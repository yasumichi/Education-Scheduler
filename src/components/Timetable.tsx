import { TimePeriod, Resource, Lesson, ResourceType, ViewType, Holiday, ResourceLabels, ScheduleEvent } from '../types';
import { format, addDays, isSameDay, parseISO, getYear, differenceInDays, isWithinInterval, isBefore, isAfter, startOfDay } from 'date-fns';
import './Timetable.css';
import { useTranslation } from 'react-i18next';
import { JSX } from 'preact';

interface Props {
  periods: TimePeriod[];
  resources: Resource[];
  lessons: Lesson[];
  events: ScheduleEvent[];
  viewMode: ResourceType;
  viewType: ViewType;
  baseDate: Date;
  holidays: Holiday[];
  labels: ResourceLabels;
}

export function Timetable({ periods, resources, lessons, events, viewMode, viewType, baseDate, holidays, labels }: Props) {
  const { t } = useTranslation();
  const locale = navigator.language;
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', weekday: 'short' });

  const getResourceName = (id: string) => {
    const res = resources.find(r => r.id === id);
    return res ? t(res.name) : id;
  };

  const currentViewStart = startOfDay(baseDate);

  const getHoliday = (date: Date) => {
    const target = startOfDay(date);
    return holidays.find(h => {
      if (h.date) return isSameDay(target, startOfDay(parseISO(h.date)));
      if (h.start && h.end) {
        const start = startOfDay(parseISO(h.start));
        const end = startOfDay(parseISO(h.end));
        return (isSameDay(target, start) || isAfter(target, start)) && 
               (isSameDay(target, end) || isBefore(target, end));
      }
      return false;
    });
  };

  const getDayCount = () => {
    if (viewType === 'day') return 1;
    if (viewType === 'week') return 7;
    if (viewType === 'month') return 30;
    if (viewType === 'year') {
      const start = new Date(getYear(baseDate), 3, 1);
      const end = new Date(getYear(baseDate) + 1, 2, 31);
      return differenceInDays(end, start) + 1;
    }
    return 1;
  };

  const dayCount = getDayCount();
  const displayDates = Array.from({ length: dayCount }).map((_, i) => addDays(currentViewStart, i));
  const currentViewEnd = startOfDay(displayDates[displayDates.length - 1]);

  const filteredResources = resources
    .filter(r => r.type === viewMode)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const isDayView = viewType === 'day';
  const colWidthNum = isDayView ? 60 : 50;
  const colWidth = isDayView ? '1fr' : `${colWidthNum}px`;
  const totalCols = displayDates.length * periods.length;
  const totalWidth = 150 + totalCols * colWidthNum;

  const gridStyle = {
    '--col-width': isDayView ? 'auto' : colWidth,
    display: 'grid',
    width: isDayView ? '100%' : 'fit-content',
    minWidth: isDayView ? '0' : `${totalWidth}px`,
    gridTemplateColumns: `150px repeat(${totalCols}, ${colWidth})`,
    gridTemplateRows: `40px 30px 80px repeat(${filteredResources.length || 0}, 80px)`,
  } as JSX.CSSProperties;

  const stickyLeft = { position: 'sticky', left: 0 } as JSX.CSSProperties;

  const dateHeaders = displayDates.map((date, dIdx) => {
    const holiday = getHoliday(date);
    const isSun = date.getDay() === 0;
    const isSat = date.getDay() === 6;
    const isFirstOfMonth = date.getDate() === 1;

    let className = 'date-header';
    if (isSun) className += ' is-sunday';
    if (isSat) className += ' is-saturday';
    if (holiday) className += ' is-holiday';
    if (isFirstOfMonth) className += ' month-start';

    return (
      <div key={`date-${date.toISOString()}`} 
           className={className} 
           style={{ gridColumn: `${dIdx * periods.length + 2} / span ${periods.length}`, gridRow: 1 }}
           title={holiday ? t(holiday.name) : undefined}
      >
        {dateFormatter.format(date)}
      </div>
    );
    });

    const periodHeaders = displayDates.flatMap((date, dIdx) => 
    periods.map((p, pIdx) => {
      const isSun = date.getDay() === 0;
      const isSat = date.getDay() === 6;
      const holiday = getHoliday(date);
      let className = 'period-header';
      if (isSun) className += ' is-sunday';
      if (isSat) className += ' is-saturday';
      if (holiday) className += ' is-holiday';
      return (
        <div key={`period-${date.toISOString()}-${p.id}`} 
             className={className} 
             style={{ gridColumn: dIdx * periods.length + pIdx + 2, gridRow: 2 }}>
          {p.name}
        </div>
      );
    })
    );

  const eventLabel = (
    <div key="label-event" className="event-label" style={{ ...stickyLeft, gridColumn: 1, gridRow: 3 }}>
      {labels.event}
    </div>
  );

  const eventCells = displayDates.flatMap((date, dIdx) => {
    const holiday = getHoliday(date);
    const isSun = date.getDay() === 0;
    const isSat = date.getDay() === 6;
    let className = 'grid-cell event-cell';
    if (isSun) className += ' is-sunday';
    if (isSat) className += ' is-saturday';
    if (holiday) className += ' is-holiday';

    return periods.map((_, pIdx) => (
      <div key={`event-cell-${dIdx}-${pIdx}`} 
           className={className} 
           style={{ gridColumn: dIdx * periods.length + pIdx + 2, gridRow: 3 }} />
    ));
  });

  // イベント行（row 3）に表示する全アイテムの競合チェック
  type Placement = { id: string; start: number; end: number; level: number; element: JSX.Element };
  const row3Placements: Placement[] = [];

  const getPlacementLevel = (start: number, end: number) => {
    let level = 0;
    while (true) {
      const conflict = row3Placements.some(p => p.level === level && !(end < p.start || start > p.end));
      if (!conflict) return level;
      level++;
    }
  };

  const holidayItems = displayDates.flatMap((date, dIdx) => {
    const holiday = getHoliday(date);
    if (!holiday) return [];

    if (holiday.date && isSameDay(date, startOfDay(parseISO(holiday.date)))) {
      const startCol = dIdx * periods.length + 2;
      const endCol = dIdx * periods.length + periods.length + 1;
      const level = getPlacementLevel(startCol, endCol - 1);
      const el = (
        <div key={`holiday-${date.toISOString()}`}
             className="event-card holiday-card"
             style={{ 
               gridColumn: `${startCol} / ${endCol}`, 
               gridRow: 3,
               top: `${72 + level * 22}px`
             }}>
             {t(holiday.name)}
             </div>
             );
             row3Placements.push({ id: `holiday-${date.toISOString()}`, start: startCol, end: endCol - 1, level, element: el });
             return [el];
             }

             const hStart = holiday.start ? startOfDay(parseISO(holiday.start)) : null;
             const hEnd = holiday.end ? startOfDay(parseISO(holiday.end)) : null;

             if (hStart && hEnd) {
             if (isSameDay(date, hStart) || (isSameDay(date, displayDates[0]) && isAfter(date, hStart) && isBefore(date, hEnd))) {
             const actualStart = isAfter(hStart, displayDates[0]) ? hStart : displayDates[0];
             const actualEnd = isBefore(hEnd, displayDates[displayDates.length - 1]) ? hEnd : displayDates[displayDates.length - 1];

             const sIdx = displayDates.findIndex(d => isSameDay(d, actualStart));
             const eIdx = displayDates.findIndex(d => isSameDay(d, actualEnd));

             if (sIdx !== -1 && eIdx !== -1 && isSameDay(date, actualStart)) {
             const startCol = sIdx * periods.length + 2;
             const endCol = eIdx * periods.length + periods.length + 1;
             const level = getPlacementLevel(startCol, endCol - 1);
             const el = (
             <div key={`holiday-range-${holiday.name}-${date.toISOString()}`}
                 className="event-card holiday-card"
                 style={{ 
                   gridColumn: `${startCol} / ${endCol}`, 
                   gridRow: 3,
                   top: `${72 + level * 22}px`
                 }}>
              {t(holiday.name)}
             </div>
             );
             row3Placements.push({ id: `holiday-range-${holiday.name}`, start: startCol, end: endCol - 1, level, element: el });
             return [el];
             }
             }
             }

             return [];
             });

             const scheduleEventItems = events.flatMap(e => {
             const eStart = startOfDay(parseISO(e.startDate));
             const eEnd = startOfDay(parseISO(e.endDate));

             if (isAfter(eStart, currentViewEnd) || isBefore(eEnd, currentViewStart)) return [];
             const startDayIdx = displayDates.findIndex(d => isSameDay(d, eStart));
             const endDayIdx = displayDates.findIndex(d => isSameDay(d, eEnd));
             const startPeriodIdx = periods.findIndex(p => p.id === e.startPeriodId);
             const endPeriodIdx = periods.findIndex(p => p.id === e.endPeriodId);
             // ビュー外でも一部が掛かっている場合の調整
             const sCol = (startDayIdx === -1) ? 2 : startDayIdx * periods.length + startPeriodIdx + 2;
             const eCol = (endDayIdx === -1) ? (displayDates.length * periods.length + 1) : endDayIdx * periods.length + endPeriodIdx + 2;
             const span = eCol - sCol + 1;
             const result = [];

             // リソースIDのリストを統合
             const resourceIdList = [
             ...(e.resourceIds || []),
             ...(e.resources || []).map(r => r.id)
             ];
             // リソース固有の予定
             if (resourceIdList.length > 0) {
             resourceIdList.forEach(resId => {
             const resourceIdx = filteredResources.findIndex(r => r.id === resId);
             if (resourceIdx !== -1) {
             result.push(
             <div key={`event-${e.id}-${resId}`} 
                 className="event-card schedule-event-card resource-event-card"
                 style={{ 
                   gridColumn: `${sCol} / span ${span}`, 
                   gridRow: resourceIdx + 4,
                   backgroundColor: e.color
                 }}>
              {t(e.name)}
             </div>
             );
             }
             });
             }
             // イベント行（row 3）に表示する場合
             if (e.showInEventRow !== false || resourceIdList.length === 0) {
             const level = getPlacementLevel(sCol, sCol + span - 1);
             const el = (
             <div key={`event-${e.id}-global`} 
             className="event-card schedule-event-card"
             style={{ 
               gridColumn: `${sCol} / span ${span}`, 
               gridRow: 3,
               backgroundColor: e.color,
               top: `${72 + level * 22}px`
             }}>
             {t(e.name)}
             </div>
             );
             row3Placements.push({ id: `event-${e.id}`, start: sCol, end: sCol + span - 1, level, element: el });
             result.push(el);
             }
             return result;
             });

             const resourceLabels = filteredResources.map((r, idx) => (
             <div key={`label-${r.id}`} className="grid-label" style={{ ...stickyLeft, gridColumn: 1, gridRow: idx + 4 }}>
             {t(r.name)}
             </div>
             ));

             const lessonItems = lessons.flatMap(l => {
             const lStart = startOfDay(parseISO(l.startDate));
             const lEnd = startOfDay(parseISO(l.endDate));
             if (isAfter(lStart, currentViewEnd) || isBefore(lEnd, currentViewStart)) return [];

             const startDayIdx = displayDates.findIndex(d => isSameDay(d, lStart));
             const endDayIdx = displayDates.findIndex(d => isSameDay(d, lEnd));
             const startPeriodIdx = periods.findIndex(p => p.id === l.startPeriodId);
             const endPeriodIdx = periods.findIndex(p => p.id === l.endPeriodId);
             const sCol = (startDayIdx === -1) ? 2 : startDayIdx * periods.length + startPeriodIdx + 2;
             const eCol = (endDayIdx === -1) ? (displayDates.length * periods.length + 1) : endDayIdx * periods.length + endPeriodIdx + 2;
             const span = eCol - sCol + 1;
             const subIds = [
             ...(l.subTeacherIds || []),
             ...(l.subTeachers || []).map(t => t.id)
             ];
             // 関連するリソースIDを特定
             let targetResIds: string[] = [];
             if (viewMode === 'room') targetResIds = [l.roomId];
             else if (viewMode === 'teacher') targetResIds = [l.teacherId, ...subIds];
             else if (viewMode === 'course') targetResIds = [l.courseId];

             return targetResIds.map(resId => {
             const resourceIdx = filteredResources.findIndex(r => r.id === resId);
             if (resourceIdx === -1) return null;
             const infoItems = [];
             if (viewMode !== 'room') infoItems.push({ label: labels.room, value: getResourceName(l.roomId) });

             const mainTeacherName = getResourceName(l.teacherId);
             const subTeacherNames = subIds.map(id => getResourceName(id));

             if (viewMode !== 'teacher') {
             const allTeachers = [mainTeacherName, ...subTeacherNames].join(', ');
             infoItems.push({ label: labels.teacher, value: allTeachers });
             } else {
             if (subTeacherNames.length > 0) {
             // メイン・サブ講師を分けずに表示（同等に扱う）
             const allTeachers = [mainTeacherName, ...subTeacherNames].join(', ');
             infoItems.push({ label: labels.teacher, value: allTeachers });
             }
             }
             if (viewMode !== 'course') infoItems.push({ label: labels.course, value: getResourceName(l.courseId) });

             const translatedSubject = t(l.subject);
             const tooltipText = `${translatedSubject}\n` + infoItems.map(item => `${item.label}: ${item.value}`).join('\n');

             return (
             <div 
             key={`lesson-${l.id}-${resId}`} 
             className="lesson-card"
             style={{
             gridColumn: `${sCol} / span ${span}`,
             gridRow: resourceIdx + 4
             }}
             title={tooltipText}
             >
             <div className="lesson-subject">{translatedSubject}</div>
             <div className="lesson-details">
             {infoItems.map((item, idx) => (
              <div key={idx} className="lesson-info">
                {item.label}: {item.value}
              </div>
             ))}
             </div>
             </div>
             );
             }).filter(Boolean);
             });

  const wrapperStyle = {
    overflowX: isDayView ? 'hidden' : 'auto'
  } as JSX.CSSProperties;

  return (
    <div className="timetable-wrapper" style={wrapperStyle}>
      <div 
        key={`grid-${viewType}-${baseDate.getTime()}-${viewMode}-${filteredResources.length}-${totalCols}`}
        className="timetable-container" 
        style={gridStyle}
      >
        <div className="grid-corner" style={{ ...stickyLeft, gridColumn: 1, gridRow: "1 / span 2", zIndex: 100 }} />
        {filteredResources.map((_, rIdx) => 
          displayDates.map((date, dIdx) => {
            const isSun = date.getDay() === 0;
            const isSat = date.getDay() === 6;
            const holiday = getHoliday(date);
            let cellClass = 'grid-cell';
            if (isSun) cellClass += ' is-sunday';
            if (isSat) cellClass += ' is-saturday';
            if (holiday) cellClass += ' is-holiday';
            return periods.map((_, pIdx) => (
              <div key={`cell-${rIdx}-${dIdx}-${pIdx}`} 
                   className={cellClass} 
                   style={{ gridColumn: dIdx * periods.length + pIdx + 2, gridRow: rIdx + 4 }} />
            ));
          })
        )}
        {dateHeaders}
        {periodHeaders}
        {eventLabel}
        {eventCells}
        {/* レベル別の配置を確保 */}
        {holidayItems}
        {scheduleEventItems}
        {resourceLabels}
        {lessonItems}
      </div>
    </div>
  );
}
