import { TimePeriod, Resource, Lesson, ResourceType, ViewType, Holiday, ResourceLabels, ScheduleEvent, SystemSetting, ColorTheme, ColorCategory } from '../types';
import { format, addDays, addMonths, isSameDay, parseISO, getYear, differenceInDays, isWithinInterval, isBefore, isAfter, startOfDay, differenceInCalendarDays, eachDayOfInterval } from 'date-fns';
import './Timetable.css';
import { useTranslation } from 'react-i18next';
import { JSX, Fragment } from 'preact';
import { useSignal } from '@preact/signals';

interface Props {
  periods: TimePeriod[];
  resources: Resource[];
  lessons: Lesson[];
  events: ScheduleEvent[];
  viewMode: ResourceType;
  viewType: ViewType;
  isTimelineReduced?: boolean;
  baseDate: Date;
  holidays: Holiday[];
  labels: ResourceLabels;
  systemSettings: SystemSetting | null;
  colorThemes: ColorTheme[];
  onEventClick?: (event: ScheduleEvent) => void;
  onEmptyEventClick?: (date: string, periodId: string) => void;
  onLessonClick?: (lesson: Lesson) => void;
  onCourseClick?: (course: Resource) => void;
  onRoomClick?: (room: Resource) => void;
  onTeacherClick?: (teacher: Resource) => void;
  onViewWeekly?: (courseId: string) => void;
  onViewStats?: (courseId: string) => void;
  onViewTeacherStats?: (teacherId: string) => void;
  onEmptyResourceCellClick?: (resourceId: string, date: string, periodId: string) => void;
}

export function Timetable({ 
  periods, resources, lessons, events, viewMode, viewType, isTimelineReduced = false, baseDate, holidays, labels, systemSettings,
  colorThemes, onEventClick, onEmptyEventClick, onLessonClick, onCourseClick, onRoomClick, onTeacherClick,
  onViewWeekly, onViewStats, onViewTeacherStats, onEmptyResourceCellClick 
}: Props) {
  const { t } = useTranslation();
  const locale = navigator.language;
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', weekday: 'short' });
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' });
  const dayFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric' });
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });

  const showFilterPopup = useSignal(false);
  const hiddenResourceIds = useSignal<Set<string>>(new Set());

  const getResourceName = (id: string) => {
    const res = resources.find(r => r.id === id);
    return res ? t(res.name) : id;
  };

  const currentViewStart = startOfDay(baseDate);

  const getDayInfo = (day: number) => {
    const weekendDaysStr = systemSettings?.weekendDays || "0:default:true,1:default:false,2:default:false,3:default:false,4:default:false,5:default:false,6:vivid:true";
    const parts = weekendDaysStr.split(',').filter(p => p !== '');
    const part = parts.find(p => p.startsWith(`${day}:`));
    if (part) {
      const bits = part.split(':');
      if (bits.length >= 3) {
        return { themeId: bits[1], isWeekend: bits[2] === 'true' };
      }
      if (bits.length === 2) {
        return { themeId: bits[1], isWeekend: true };
      }
    }
    const simpleIndices = weekendDaysStr.split(',').filter(p => !p.includes(':'));
    if (simpleIndices.includes(day.toString())) {
      return { themeId: 'default', isWeekend: true };
    }
    return { themeId: 'default', isWeekend: false };
  };

  const isWeekend = (date: Date) => getDayInfo(date.getDay()).isWeekend;
  const holidayTheme = systemSettings?.holidayTheme || 'default';

  // カラーテーマ取得用ヘルパー
  const getThemeColor = (category: ColorCategory, keyOrId: string) => {
    const theme = colorThemes.find(t => t.category === category && (t.key === keyOrId || t.id === keyOrId));
    if (theme) return theme;
    // Fallback to default
    return colorThemes.find(t => t.category === category && t.key === 'default');
  };

  const getHolidayOrWeekendTheme = (date: Date) => {
    const holiday = getHoliday(date);
    const dayInfo = getDayInfo(date.getDay());
    
    // 週末設定がある場合は、休日であっても週末のテーマを優先する
    if (dayInfo.isWeekend) {
      return getThemeColor('HOLIDAY', dayInfo.themeId);
    }

    // 週末でない平日の休日の場合は、holidayTheme を使用する
    if (holiday) {
      return getThemeColor('HOLIDAY', holidayTheme);
    }
    
    return null;
  };

  const getHoliday = (date: Date) => {
    const targetStr = format(date, 'yyyy-MM-dd');
    return holidays.find(h => {
      if (h.date) return h.date === targetStr;
      if (h.start && h.end) {
        return targetStr >= h.start && targetStr <= h.end;
      }
      return false;
    });
  };

  const getDayCount = () => {
    if (viewType === 'day') return 1;
    if (viewType === 'week') return 7;
    if (viewType === 'month') {
      return differenceInDays(addMonths(currentViewStart, 1), currentViewStart);
    }
    if (viewType === '3month' || viewType === '6month') {
      const months = viewType === '3month' ? 3 : 6;
      return differenceInDays(addMonths(currentViewStart, months), currentViewStart);
    }
    if (viewType === 'year' || viewType === 'course_timeline') {
      const month = systemSettings?.yearViewStartMonth ?? 4;
      const day = systemSettings?.yearViewStartDay ?? 1;
      
      const start = new Date(getYear(baseDate), month - 1, day);
      const end = new Date(getYear(baseDate) + 1, month - 1, day);
      return differenceInDays(end, start);
    }
    return 1;
  };

  const dayCount = getDayCount();
  const displayDates = Array.from({ length: dayCount }).map((_, i) => addDays(currentViewStart, i));
  const currentViewEnd = startOfDay(displayDates[displayDates.length - 1]);

  const viewStartStr = format(currentViewStart, 'yyyy-MM-dd');
  const viewEndStr = format(currentViewEnd, 'yyyy-MM-dd');

  const isDayView = viewType === 'day';
  const isCourseTimeline = viewType === 'course_timeline';
  const effectivePeriods = isCourseTimeline ? [{ id: 'p-all', name: '', startTime: '', endTime: '', order: 0 }] : periods;

  const allResourcesOfMode = resources
    .filter(r => {
      if (r.type !== viewMode) return false;
      // 講座ビューの場合、表示期間内に開催されているもののみを表示
      if (viewMode === 'course') {
        if (r.startDate && r.endDate) {
          return r.startDate <= viewEndStr && r.endDate >= viewStartStr;
        }
      }
      return true;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order || 0));

  const filteredResources = allResourcesOfMode.filter(r => !hiddenResourceIds.value.has(r.id));

  const toggleResource = (id: string) => {
    const next = new Set(hiddenResourceIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    hiddenResourceIds.value = next;
  };

  const showAllResources = () => {
    const next = new Set(hiddenResourceIds.value);
    allResourcesOfMode.forEach(r => next.delete(r.id));
    hiddenResourceIds.value = next;
  };

  const hideAllResources = () => {
    const next = new Set(hiddenResourceIds.value);
    allResourcesOfMode.forEach(r => next.add(r.id));
    hiddenResourceIds.value = next;
  };

  const colWidthNum = isDayView ? 60 : (isCourseTimeline && isTimelineReduced ? 5 : 50);
  const colWidth = isDayView ? '1fr' : `${colWidthNum}px`;
  const totalCols = displayDates.length * effectivePeriods.length;
  const totalWidth = 150 + totalCols * colWidthNum;

  const eventRowIdx = isCourseTimeline ? (isTimelineReduced ? 2 : 4) : 3;
  const resourceBaseRowIdx = isCourseTimeline ? (isTimelineReduced ? 3 : 5) : 4;
  const headerHeight = isCourseTimeline ? (isTimelineReduced ? 30 : 90) : 70;

  const gridRows = isCourseTimeline 
    ? (isTimelineReduced 
        ? `30px 40px repeat(${filteredResources.length || 0}, 60px)` 
        : `30px 30px 30px 80px repeat(${filteredResources.length || 0}, 120px)`)
    : `40px 30px 80px repeat(${filteredResources.length || 0}, 80px)`;

  const gridStyle = {
    '--col-width': isDayView ? 'auto' : colWidth,
    display: 'grid',
    width: (isDayView) ? '100%' : 'fit-content',
    minWidth: (isDayView) ? '0' : `${totalWidth}px`,
    gridTemplateColumns: `150px repeat(${totalCols}, ${colWidth})`,
    gridTemplateRows: gridRows,
  } as JSX.CSSProperties;

  const stickyLeft = { position: 'sticky', left: 0 } as JSX.CSSProperties;
  const eventRowHeight = isCourseTimeline && isTimelineReduced ? 40 : 80;
  const resourceStickyTop = `${headerHeight + eventRowHeight}px`;
  const stickyTop = { position: 'sticky', top: resourceStickyTop } as JSX.CSSProperties;

  const handleIntentionalClick = (callback: () => void) => {
    callback();
  };

  const filterButton = (
    <div className="grid-corner" style={{ ...stickyLeft, gridColumn: 1, gridRow: isCourseTimeline ? (isTimelineReduced ? "1 / span 1" : "1 / span 3") : "1 / span 2", zIndex: 100 }}>
      <button 
        className="resource-filter-btn" 
        onClick={() => showFilterPopup.value = !showFilterPopup.value}
        title={t('Filter')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </svg>
      </button>
      {showFilterPopup.value && (
        <div className="resource-filter-popup">
          <div className="filter-actions">
            <button onClick={showAllResources}>{t('Select All')}</button>
            <button onClick={hideAllResources}>{t('Deselect All')}</button>
          </div>
          {allResourcesOfMode.map(r => (
            <label key={r.id} className="filter-item">
              <input 
                type="checkbox" 
                checked={!hiddenResourceIds.value.has(r.id)} 
                onChange={() => toggleResource(r.id)}
              />
              {t(r.name)}
            </label>
          ))}
        </div>
      )}
    </div>
  );

  const dateHeaders = (() => {
    if (isCourseTimeline) {
      const monthHeaders: any[] = [];
      let currentMonth: string | null = null;
      displayDates.forEach((date, i) => {
        const monthLabel = monthFormatter.format(date);
        if (monthLabel !== currentMonth) {
          monthHeaders.push({ label: monthLabel, start: i + 2, count: 1 });
          currentMonth = monthLabel;
        } else {
          monthHeaders[monthHeaders.length - 1].count++;
        }
      });

      return (
        <>
          {monthHeaders.map((m, i) => (
            <div key={`m-${i}`} className="date-header month-row" 
                 style={{ gridColumn: `${m.start} / span ${m.count}`, gridRow: 1 }}>
              {m.label}
            </div>
          ))}
          {!isTimelineReduced && displayDates.map((date, i) => {
            const holiday = getHoliday(date);
            const isWknd = isWeekend(date);
            let baseClass = "date-header";
            if (isWknd) baseClass += " is-weekend";
            if (holiday) baseClass += " is-holiday";

            const hTheme = getHolidayOrWeekendTheme(date);
            const style: any = {};
            if (hTheme) {
              style.backgroundColor = hTheme.background;
              style.color = hTheme.foreground;
            }

            return (
              <Fragment key={`header-day-${i}`}>
                <div className={`${baseClass} day-row`} 
                     style={{ ...style, gridColumn: i + 2, gridRow: 2 }}>
                  {dayFormatter.format(date)}
                </div>
                <div className={`${baseClass} weekday-row`} 
                     style={{ ...style, gridColumn: i + 2, gridRow: 3 }}>
                  {weekdayFormatter.format(date)}
                </div>
              </Fragment>
            );
          })}
        </>
      );
    }

    return displayDates.map((date, dIdx) => {
      const holiday = getHoliday(date);
      const isWknd = isWeekend(date);
      const isFirstOfMonth = date.getDate() === 1;

      let className = 'date-header';
      if (isWknd) className += ' is-weekend';
      if (holiday) className += ' is-holiday';
      if (isFirstOfMonth) className += ' month-start';

      const hTheme = getHolidayOrWeekendTheme(date);
      const style: any = {};
      if (hTheme) {
        style.backgroundColor = hTheme.background;
        style.color = hTheme.foreground;
      }

      return (
        <div key={`date-${date.toISOString()}`} 
             className={className} 
             style={{ ...style, gridColumn: `${dIdx * effectivePeriods.length + 2} / span ${effectivePeriods.length}`, gridRow: 1 }}
             title={holiday ? holiday.name : undefined}
        >
          {dateFormatter.format(date)}
        </div>
      );
    });
  })();

  const periodHeaders = isCourseTimeline ? null : displayDates.flatMap((date, dIdx) => 
    periods.map((p, pIdx) => {
      const isWknd = isWeekend(date);
      const holiday = getHoliday(date);
      let className = 'period-header';
      if (isWknd) className += ' is-weekend';
      if (holiday) className += ' is-holiday';

      const hTheme = getHolidayOrWeekendTheme(date);
      const style: any = {};
      if (hTheme) {
        style.backgroundColor = hTheme.background;
        style.color = hTheme.foreground;
      }

      return (
        <div key={`period-${date.toISOString()}-${p.id}`} 
             className={className} 
             style={{ ...style, gridColumn: dIdx * periods.length + pIdx + 2, gridRow: 2 }}>
          {p.name}
        </div>
      );
    })
  );

  const eventLabel = (
    <div key="label-event" className="event-label" style={{ ...stickyLeft, top: `${headerHeight}px`, gridColumn: 1, gridRow: eventRowIdx, height: isCourseTimeline && isTimelineReduced ? '40px' : '80px' }}>
      {labels.event}
    </div>
  );

  const eventCells = displayDates.flatMap((date, dIdx) => {
    const holiday = getHoliday(date);
    const isWknd = isWeekend(date);
    let className = 'grid-cell event-cell';
    if (isWknd) className += ' is-weekend';
    if (holiday) className += ' is-holiday';

    const dateStr = format(date, 'yyyy-MM-dd');

    const hTheme = getHolidayOrWeekendTheme(date);
    const style: any = {};
    if (hTheme) {
      style.backgroundColor = hTheme.background;
    }

    return effectivePeriods.map((p, pIdx) => (
      <div key={`event-cell-${dIdx}-${pIdx}`} 
           className={className} 
           style={{ ...style, gridColumn: dIdx * effectivePeriods.length + pIdx + 2, gridRow: eventRowIdx, top: `${headerHeight}px`, height: isCourseTimeline && isTimelineReduced ? '40px' : '80px' }}
           onDblClick={() => handleIntentionalClick(() => onEmptyEventClick?.(dateStr, p.id))} />
    ));
  });

  const calculateLayout = (items: { id: string, start: number, end: number }[]) => {
    if (items.length === 0) return [];
    const placements: { id: string, start: number, end: number, level: number, maxLevelInGroup: number }[] = [];
    const sortedItems = [...items].sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    sortedItems.forEach(item => {
      let level = 0;
      while (placements.some(p => p.level === level && !(item.end < p.start || item.start > p.end))) {
        level++;
      }
      placements.push({ ...item, level, maxLevelInGroup: 0 });
    });
    placements.forEach(p => {
      const overlapping = placements.filter(other => !(p.end < other.start || p.start > other.end));
      p.maxLevelInGroup = Math.max(...overlapping.map(o => o.level)) + 1;
    });
    return placements;
  };

  const row3Items: { id: string, start: number, end: number, type: 'holiday' | 'event', data: any }[] = [];
  displayDates.forEach((date, dIdx) => {
    const holiday = getHoliday(date);
    if (!holiday) return;
    if (holiday.date && isSameDay(date, startOfDay(parseISO(holiday.date)))) {
      const startCol = dIdx * effectivePeriods.length + 2;
      const endCol = dIdx * effectivePeriods.length + effectivePeriods.length + 2;
      row3Items.push({ id: `holiday-${date.toISOString()}`, start: startCol, end: endCol - 1, type: 'holiday', data: holiday });
    } else if (holiday.start && holiday.end) {
      const hStart = startOfDay(parseISO(holiday.start));
      const hEnd = startOfDay(parseISO(holiday.end));
      if (isSameDay(date, hStart) || (isSameDay(date, displayDates[0]) && isAfter(date, hStart) && isBefore(date, hEnd))) {
        const actualStart = isAfter(hStart, displayDates[0]) ? hStart : displayDates[0];
        const actualEnd = isBefore(hEnd, displayDates[displayDates.length - 1]) ? hEnd : displayDates[displayDates.length - 1];
        const sIdx = displayDates.findIndex(d => isSameDay(d, actualStart));
        const eIdx = displayDates.findIndex(d => isSameDay(d, actualEnd));
        if (sIdx !== -1 && eIdx !== -1 && isSameDay(date, actualStart)) {
          const startCol = sIdx * effectivePeriods.length + 2;
          const endCol = eIdx * effectivePeriods.length + effectivePeriods.length + 2;
          row3Items.push({ id: `holiday-range-${holiday.name}-${date.toISOString()}`, start: startCol, end: endCol - 1, type: 'holiday', data: holiday });
        }
      }
    }
  });

  events.forEach(e => {
    const eStart = startOfDay(parseISO(e.startDate));
    const eEnd = startOfDay(parseISO(e.endDate));
    if (isAfter(eStart, currentViewEnd) || isBefore(eEnd, currentViewStart)) return;
    const resourceIdList = [...(e.resourceIds || []), ...(e.resources || []).map(r => r.id)];
    if (e.showInEventRow !== false || resourceIdList.length === 0) {
      const startDayIdx = displayDates.findIndex(d => isSameDay(d, eStart));
      const endDayIdx = displayDates.findIndex(d => isSameDay(d, eEnd));

      const startPeriodIdx = (e.startPeriodId && !isCourseTimeline) ? effectivePeriods.findIndex(p => p.id === e.startPeriodId) : 0;
      const endPeriodIdx = (e.endPeriodId && !isCourseTimeline) ? effectivePeriods.findIndex(p => p.id === e.endPeriodId) : effectivePeriods.length - 1;
      
      const safeStartPeriodIdx = startPeriodIdx === -1 ? 0 : startPeriodIdx;
      const safeEndPeriodIdx = endPeriodIdx === -1 ? effectivePeriods.length - 1 : endPeriodIdx;

      const sCol = (startDayIdx === -1) ? 2 : startDayIdx * effectivePeriods.length + safeStartPeriodIdx + 2;
      const eCol = (endDayIdx === -1) ? (displayDates.length * effectivePeriods.length + 1) : endDayIdx * effectivePeriods.length + safeEndPeriodIdx + 2;
      row3Items.push({ id: `event-${e.id}`, start: sCol, end: eCol, type: 'event', data: e });
    }
  });

  const row3Layouts = calculateLayout(row3Items);

  const holidayItems = row3Layouts.filter(l => row3Items.find(i => i.id === l.id)?.type === 'holiday').map(layout => {
    const item = row3Items.find(i => i.id === layout.id)!;
    const h = item.data;
    const unitHeight = (eventRowHeight - 8) / layout.maxLevelInGroup;
    const itemHeight = unitHeight - 8;
    const top = headerHeight + 4 + (layout.level * unitHeight);

    const hDate = parseISO(h.date || h.start);
    const theme = getHolidayOrWeekendTheme(hDate);
    const style: any = {
      gridColumn: `${layout.start} / ${layout.end + 1}`,
      gridRow: eventRowIdx,
      top: `${top}px`,
      height: `${itemHeight}px`
    };
    if (theme) {
      style.backgroundColor = theme.background;
      style.color = theme.foreground;
    }

    return (
      <div key={layout.id} className="event-card holiday-card" title={h.name} style={style}>
        {h.name}
      </div>
    );
  });

  const globalEventItems = row3Layouts.filter(l => row3Items.find(i => i.id === l.id)?.type === 'event').map(layout => {
    const e = row3Items.find(i => i.id === layout.id)!.data as ScheduleEvent;
    const unitHeight = (eventRowHeight - 8) / layout.maxLevelInGroup;
    const itemHeight = unitHeight - 8;
    const top = headerHeight + 4 + (layout.level * unitHeight);

    const theme = getThemeColor('EVENT', e.name) || getThemeColor('EVENT', 'default');
    const bgColor = e.color || theme?.background || '#fef3c7';
    const textColor = theme?.foreground || 'inherit';

    const startP = periods.find(p => p.id === e.startPeriodId)?.name || e.startPeriodId;
    const endP = periods.find(p => p.id === e.endPeriodId)?.name || e.endPeriodId;
    const resNames = [
      ...(e.resourceIds || []),
      ...(e.resources || []).map(r => r.id)
    ].map(id => getResourceName(id)).join(', ');

    const tooltip = `${e.name}${e.location ? ` (${e.location})` : ''}\n${e.startDate} ${startP} ～ ${e.endDate} ${endP}` + 
                   (e.location ? `\n${t('Location')}: ${e.location}` : '') +
                   (e.remarks ? `\n\n${t('Remarks')}:\n${e.remarks}` : '') +
                   (resNames ? `\n\n${labels.event}: ${resNames}` : '');

    return (
      <div key={layout.id} className="event-card schedule-event-card"
           title={tooltip}
           style={{ 
             gridColumn: `${layout.start} / ${layout.end + 1}`, 
             gridRow: eventRowIdx, 
             backgroundColor: bgColor, 
             color: textColor,
             top: `${top}px`, 
             height: `${itemHeight}px`, 
             cursor: 'pointer' 
           }}
           onDblClick={() => handleIntentionalClick(() => onEventClick?.(e))}>
        {e.name}{e.location && <span className="event-location"> ({e.location})</span>}
      </div>
    );
  });

  const resourceRowItems: JSX.Element[] = [];
  
  filteredResources.forEach((res, resIdx) => {
    if (isCourseTimeline) {
      const allCourses = resources.filter(r => r.type === 'course' && r.startDate && r.endDate);
      let relatedCourses: Resource[] = [];
      if (viewMode === 'course') {
        relatedCourses = [res];
      } else if (viewMode === 'teacher') {
        relatedCourses = allCourses.filter(c => {
          const chiefId = c.chiefTeacherId;
          const subIds = [...(c.assistantTeacherIds || []), ...(c.assistantTeachers || []).map(at => at.id)];
          return chiefId === res.id || subIds.includes(res.id);
        });
      } else if (viewMode === 'room') {
        relatedCourses = allCourses.filter(c => c.mainRoomId === res.id);
      }

      const courseItems = relatedCourses.map(c => {
        const cStart = startOfDay(parseISO(c.startDate!));
        const cEnd = startOfDay(parseISO(c.endDate!));
        if (isAfter(cStart, currentViewEnd) || isBefore(cEnd, currentViewStart)) return null;
        const sIdx = displayDates.findIndex(d => isSameDay(d, cStart));
        const eIdx = displayDates.findIndex(d => isSameDay(d, cEnd));
        const sCol = (sIdx === -1) ? 2 : sIdx + 2;
        const eCol = (eIdx === -1) ? (displayDates.length + 1) : eIdx + 2;
        return { id: `course-${c.id}-${res.id}`, start: sCol, end: eCol, data: c };
      }).filter(Boolean) as { id: string, start: number, end: number, data: Resource }[];

      const layouts = calculateLayout(courseItems);
      layouts.forEach(layout => {
        const c = courseItems.find(i => i.id === layout.id)!.data;
        const unitHeight = (isCourseTimeline && isTimelineReduced ? 60 : 120) / layout.maxLevelInGroup;
        const itemHeight = unitHeight - 8;
        const top = 4 + (layout.level * unitHeight);

        const days = eachDayOfInterval({ start: parseISO(c.startDate!), end: parseISO(c.endDate!) });
        const workDays = days.filter(d => !isWeekend(d) && !getHoliday(d)).length;
        const totalPeriods = workDays * periods.length;

        const chiefTeacher = resources.find(r => r.id === c.chiefTeacherId);
        const subIds = [...(c.assistantTeacherIds || []), ...(c.assistantTeachers || []).map(at => at.id)];
        const assistantNames = subIds.map(id => resources.find(r => r.id === id)?.name).filter(Boolean).map(name => t(name!)).join(', ');

        const mLabel = c.mainTeacherLabel || labels.mainTeacher;
        const sLabel = c.subTeacherLabel || labels.subTeacher;

        const tooltip = `${t(c.name)}\n` +
                        `${mLabel}: ${chiefTeacher ? t(chiefTeacher.name) : '-'}\n` +
                        (assistantNames ? `${sLabel}: ${assistantNames}\n` : '') +
                        `${c.startDate} ～ ${c.endDate}\n` +
                        `${t('Work Days')}: ${workDays}${t('days')} (${totalPeriods} ${t('periods')})`;

        resourceRowItems.push(
          <div key={layout.id} className={`course-timeline-card ${isTimelineReduced ? 'reduced' : ''}`}
               title={tooltip}
               onDblClick={() => handleIntentionalClick(() => onCourseClick?.(c))}
               style={{ 
                 gridColumn: `${layout.start} / ${layout.end + 1}`, 
                 gridRow: resIdx + resourceBaseRowIdx, 
                 top: `${top}px`, 
                 height: `${itemHeight}px`,
                 position: 'relative',
                 zIndex: 2,
                 cursor: 'pointer'
               }}>
            <div className="course-card-content">
              <div className="course-card-name">{t(c.name)}</div>
              {!isTimelineReduced && (
                <>
                  <div className="course-card-teachers">
                    <div>{mLabel}: {chiefTeacher ? t(chiefTeacher.name) : '-'}</div>
                    {assistantNames && <div>{sLabel}: {assistantNames}</div>}
                  </div>
                  <div className="course-card-footer">
                    <span className="course-card-dates">{c.startDate} ～ {c.endDate}</span>
                    <span className="course-card-stats">
                      {t('Work Days')}: {workDays}{t('days')} ({totalPeriods} {t('periods')})
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      });
    } else {
      const resItems: { id: string, start: number, end: number, type: 'event' | 'lesson', data: any }[] = [];
      
      events.forEach(e => {
        const resourceIdList = [...(e.resourceIds || []), ...(e.resources || []).map(r => r.id)];
        if (resourceIdList.includes(res.id)) {
          const eStart = startOfDay(parseISO(e.startDate));
          const eEnd = startOfDay(parseISO(e.endDate));
          if (isAfter(eStart, currentViewEnd) || isBefore(eEnd, currentViewStart)) return;
          
          const startDayIdx = displayDates.findIndex(d => isSameDay(d, eStart));
          const endDayIdx = displayDates.findIndex(d => isSameDay(d, eEnd));
          const startPeriodIdx = e.startPeriodId ? periods.findIndex(p => p.id === e.startPeriodId) : 0;
          const endPeriodIdx = e.endPeriodId ? periods.findIndex(p => p.id === e.endPeriodId) : periods.length - 1;
          const safeStartPeriodIdx = startPeriodIdx === -1 ? 0 : startPeriodIdx;
          const safeEndPeriodIdx = endPeriodIdx === -1 ? periods.length - 1 : endPeriodIdx;
          const sCol = (startDayIdx === -1) ? 2 : startDayIdx * periods.length + safeStartPeriodIdx + 2;
          const eCol = (endDayIdx === -1) ? (displayDates.length * periods.length + 1) : endDayIdx * periods.length + safeEndPeriodIdx + 2;
          resItems.push({ id: `event-${e.id}-${res.id}`, start: sCol, end: eCol, type: 'event', data: e });
        }
      });

      lessons.forEach(l => {
        const lStart = startOfDay(parseISO(l.startDate));
        const lEnd = startOfDay(parseISO(l.endDate));
        if (isAfter(lStart, currentViewEnd) || isBefore(lEnd, currentViewStart)) return;

        const subIds = [...(l.subTeacherIds || []), ...(l.subTeachers || []).map(t => t.id)];
        let isTarget = false;
        if (viewMode === 'room' && l.roomId === res.id) isTarget = true;
        else if (viewMode === 'teacher' && (l.teacherId === res.id || subIds.includes(res.id))) isTarget = true;
        else if (viewMode === 'course' && l.courseId === res.id) isTarget = true;

        if (isTarget) {
          const startDayIdx = displayDates.findIndex(d => isSameDay(d, lStart));
          const endDayIdx = displayDates.findIndex(d => isSameDay(d, lEnd));
          const startPeriodIdx = l.startPeriodId ? periods.findIndex(p => p.id === l.startPeriodId) : 0;
          const endPeriodIdx = l.endPeriodId ? periods.findIndex(p => p.id === l.endPeriodId) : periods.length - 1;
          const safeStartPeriodIdx = startPeriodIdx === -1 ? 0 : startPeriodIdx;
          const safeEndPeriodIdx = endPeriodIdx === -1 ? periods.length - 1 : endPeriodIdx;
          const sCol = (startDayIdx === -1) ? 2 : startDayIdx * periods.length + safeStartPeriodIdx + 2;
          const eCol = (endDayIdx === -1) ? (displayDates.length * periods.length + 1) : endDayIdx * periods.length + safeEndPeriodIdx + 2;
          resItems.push({ id: `lesson-${l.id}-${res.id}`, start: sCol, end: eCol, type: 'lesson', data: l });
        }
      });

      const layouts = calculateLayout(resItems);
      layouts.forEach(layout => {
        const item = resItems.find(i => i.id === layout.id)!;
        const unitHeight = (80 - 8) / layout.maxLevelInGroup;
        const itemHeight = unitHeight - 8;
        const top = 4 + (layout.level * unitHeight);

        if (item.type === 'event') {
          const e = item.data as ScheduleEvent;
          const theme = getThemeColor('EVENT', e.name) || getThemeColor('EVENT', 'default');
          const bgColor = e.color || theme?.background || '#fef3c7';
          const textColor = theme?.foreground || 'inherit';

          const startP = periods.find(p => p.id === e.startPeriodId)?.name || e.startPeriodId;
          const endP = periods.find(p => p.id === e.endPeriodId)?.name || e.endPeriodId;
          const tooltip = `${e.name}${e.location ? ` (${e.location})` : ''}\n${e.startDate} ${startP} ～ ${e.endDate} ${endP}` +
                          (e.remarks ? `\n\n${t('Remarks')}:\n${e.remarks}` : '');

          resourceRowItems.push(
            <div key={layout.id} className="event-card schedule-event-card resource-event-card"
                 title={tooltip}
                 style={{ 
                   gridColumn: `${layout.start} / ${layout.end + 1}`, 
                   gridRow: resIdx + resourceBaseRowIdx, 
                   backgroundColor: bgColor, 
                   color: textColor,
                   top: `${top}px`, 
                   height: `${itemHeight}px`, 
                   cursor: 'pointer', 
                   position: 'relative' 
                 }}
                 onDblClick={() => handleIntentionalClick(() => onEventClick?.(e))}>
              {e.name}{e.location && <span className="event-location"> ({e.location})</span>}
            </div>
          );
        } else {
          const l = item.data as Lesson;
          const hasTeacher = !!(l.teacherId || l.externalTeacher);
          const theme = getThemeColor('LESSON', hasTeacher ? 'with-teacher' : 'no-teacher');
          const bgColor = theme?.background || (hasTeacher ? '#646cff' : '#e884fa');
          const textColor = theme?.foreground || '#ffffff';

          const infoItems = [];
          const roomValue = l.roomId ? getResourceName(l.roomId) : (l.location || t('No room'));
          if (viewMode !== 'room') infoItems.push({ label: labels.room, value: roomValue });

          const mainTeacherName = l.teacherId ? getResourceName(l.teacherId) : (l.externalTeacher || t('No main teacher'));
          const subIds = [...(l.subTeacherIds || []), ...(l.subTeachers || []).map(t => t.id)];
          const subTeacherNames = subIds.map(id => getResourceName(id));
          if (l.externalSubTeachers) subTeacherNames.push(l.externalSubTeachers);

          if (viewMode !== 'teacher') {
            if (l.teacherId || l.externalTeacher) infoItems.push({ label: labels.mainTeacher, value: mainTeacherName });
            if (subTeacherNames.length > 0) infoItems.push({ label: labels.subTeacher, value: subTeacherNames.join(', ') });
          } else {
            if (l.teacherId || l.externalTeacher) infoItems.push({ label: labels.mainTeacher, value: mainTeacherName });
            if (subTeacherNames.length > 0) infoItems.push({ label: labels.subTeacher, value: subTeacherNames.join(', ') });
          }
          if (viewMode !== 'course') infoItems.push({ label: labels.course, value: getResourceName(l.courseId) });

          const translatedSubject = t(l.subject);
          const methodNames = (l.deliveryMethods || []).map(m => m.name).join(', ');
          let tooltipText = `${translatedSubject}\n` + 
                             (l.location ? `${t('Location')}: ${l.location}\n` : '') +
                             (methodNames ? `${labels.deliveryMethod}: ${methodNames}\n` : '') +
                             infoItems.map(item => `${item.label}: ${item.value}`).join('\n');
          
          if (l.remarks) {
            tooltipText += `\n\n${t('Remarks')}:\n${l.remarks}`;
          }

          resourceRowItems.push(
            <div key={layout.id} 
              className={`lesson-card ${(!l.teacherId && !l.externalTeacher) ? 'no-main-teacher' : ''}`}
              style={{
                gridColumn: `${layout.start} / ${layout.end + 1}`,
                gridRow: resIdx + resourceBaseRowIdx,
                cursor: 'pointer',
                backgroundColor: bgColor,
                color: textColor,
                top: `${top}px`,
                height: `${itemHeight}px`,
                position: 'relative'
              }}
              title={tooltipText}
              onDblClick={() => handleIntentionalClick(() => onLessonClick?.(l))}
            >
              <div className="lesson-subject"><div className="lesson-delivery-methods">{translatedSubject}
              {l.deliveryMethods && l.deliveryMethods.length > 0 && (
                  l.deliveryMethods.map(m => (
                    <span key={m.id} className="delivery-method-tag" style={{ backgroundColor: m.color || '#646cff' }}>
                      {m.name}
                    </span>
                  ))
              )}</div></div>
              {layout.maxLevelInGroup === 1 && (
                <div className="lesson-details">
                  {infoItems.map((item, idx) => (
                    <div key={idx} className="lesson-info" style={{ color: textColor }}>
                      {item.label}: {item.value}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }
      });
    }
  });

  const resourceLabels = filteredResources.map((r, idx) => {
    const handleLabelClick = () => {
      if (r.type === 'room') onRoomClick?.(r);
      else if (r.type === 'teacher') onTeacherClick?.(r);
      else if (r.type === 'course') onCourseClick?.(r);
    };

    return (
      <div key={`label-${r.id}`} className="grid-label" style={{ ...stickyLeft, gridColumn: 1, gridRow: idx + resourceBaseRowIdx, height: isCourseTimeline ? (isTimelineReduced ? '60px' : '120px') : '80px' }}>
        <span className="label-name"
              onClick={() => handleIntentionalClick(handleLabelClick)}
              style={{ cursor: 'pointer' }}
              title={t(r.name)}>
          {t(r.name)}
        </span>

        {viewMode === 'course' && (
          <div className="label-actions">
            <button 
              className="weekly-view-btn" 
              onClick={(e) => {
                e.stopPropagation();
                onViewWeekly?.(r.id);
              }}
              title={t('Weekly Schedule')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </button>
            <button 
              className="stats-view-btn" 
              onClick={(e) => {
                e.stopPropagation();
                onViewStats?.(r.id);
              }}
              title={t('Stats')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
            </button>
          </div>
        )}

        {viewMode === 'teacher' && (
          <div className="label-actions">
            <button 
              className="stats-view-btn" 
              onClick={(e) => {
                e.stopPropagation();
                onViewTeacherStats?.(r.id);
              }}
              title={t('Stats')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
            </button>
          </div>
        )}
      </div>
    );
  });

  const wrapperStyle = {
    overflowX: isDayView ? 'hidden' : 'auto'
  } as JSX.CSSProperties;

  if (isCourseTimeline && filteredResources.length === 0) {
    return null;
  }

  return (
    <div className={`timetable-wrapper holiday-theme-${holidayTheme}`} style={wrapperStyle}>
      <div 
        key={`grid-${viewType}-${baseDate.getTime()}-${viewMode}-${filteredResources.length}-${totalCols}`}
        className={`timetable-container ${isTimelineReduced ? 'is-reduced' : ''}`} 
        style={gridStyle}
      >
        {filterButton}
        {filteredResources.map((res, rIdx) => 
          displayDates.map((date, dIdx) => {
            const isWknd = isWeekend(date);
            const holiday = getHoliday(date);
            const dateStr = format(date, 'yyyy-MM-dd');
            let cellClass = 'grid-cell';
            if (isWknd) cellClass += ' is-weekend';
            if (holiday) cellClass += ' is-holiday';

            const hTheme = getHolidayOrWeekendTheme(date);
            const style: any = {};
            if (hTheme) {
              style.backgroundColor = hTheme.background;
            }

            return effectivePeriods.map((p, pIdx) => (
              <div key={`cell-${rIdx}-${dIdx}-${pIdx}`} 
                   className={cellClass} 
                   style={{ ...style, gridColumn: dIdx * effectivePeriods.length + pIdx + 2, gridRow: rIdx + resourceBaseRowIdx }}
                   onDblClick={() => !isCourseTimeline && handleIntentionalClick(() => onEmptyResourceCellClick?.(res.id, dateStr, p.id))} />
            ));
          })
        )}
        {dateHeaders}
        {periodHeaders}
        {eventLabel}
        {eventCells}
        {holidayItems}
        {globalEventItems}
        {resourceRowItems}
        {resourceLabels}
        {isCourseTimeline && isTimelineReduced && displayDates.map((_, i) => {
          if ((i + 1) % 10 === 0) {
            return (
              <div 
                key={`dotted-line-${i}`} 
                className="timeline-dotted-line" 
                style={{ gridColumn: i + 2, gridRow: `1 / span ${resourceBaseRowIdx + filteredResources.length - 1}` }} 
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
