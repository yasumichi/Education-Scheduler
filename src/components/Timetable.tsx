import { TimePeriod, Resource, Lesson, ResourceType, ViewType, Holiday, ResourceLabels, ScheduleEvent } from '../types';
import { format, addDays, isSameDay, parseISO, getYear, differenceInDays, isWithinInterval, isBefore, isAfter, startOfDay } from 'date-fns';
import './Timetable.css';

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
  const locale = navigator.language;
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', weekday: 'short' });

  const getResourceName = (id: string) => {
    return resources.find(r => r.id === id)?.name || id;
  };

  const getHoliday = (date: Date) => {
    const target = startOfDay(date);
    return holidays.find(h => {
      if (h.date) return isSameDay(target, parseISO(h.date));
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
  const displayDates = Array.from({ length: dayCount }).map((_, i) => addDays(baseDate, i));

  const filteredResources = resources
    .filter(r => r.type === viewMode)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const colWidth = '60px';
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `150px repeat(${displayDates.length * periods.length}, minmax(${colWidth}, 1fr))`,
    gridTemplateRows: `40px 30px 80px repeat(${filteredResources.length}, 80px)`,
  };

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
           title={holiday?.name}
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
    <div key="label-event" className="event-label" style={{ gridColumn: 1, gridRow: 3 }}>
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

  const holidayItems = displayDates.map((date, dIdx) => {
    const holiday = getHoliday(date);
    if (!holiday) return null;

    // 期間休暇の場合、表示範囲内での開始と終了を考慮する必要があるが、
    // ここでは簡易的に単一日の表示または期間の重なりを表示
    // 実際には holiday.start/end がある場合、複数セルをスパンさせるのが望ましい
    
    // とりあえず単一日の祝日表示
    if (holiday.date && isSameDay(date, parseISO(holiday.date))) {
      return (
        <div key={`holiday-${date.toISOString()}`}
             className="event-card holiday-card"
             style={{ gridColumn: `${dIdx * periods.length + 2} / span ${periods.length}`, gridRow: 3 }}>
          {holiday.name}
        </div>
      );
    }
    
    // 期間休暇の開始日、または表示範囲の開始日に描画
    const hStart = holiday.start ? parseISO(holiday.start) : null;
    const hEnd = holiday.end ? parseISO(holiday.end) : null;
    
    if (hStart && hEnd) {
      if (isSameDay(date, hStart) || (isSameDay(date, displayDates[0]) && isAfter(date, hStart) && isBefore(date, hEnd))) {
        const actualStart = isAfter(hStart, displayDates[0]) ? hStart : displayDates[0];
        const actualEnd = isBefore(hEnd, displayDates[displayDates.length - 1]) ? hEnd : displayDates[displayDates.length - 1];
        
        const sIdx = displayDates.findIndex(d => isSameDay(d, actualStart));
        const eIdx = displayDates.findIndex(d => isSameDay(d, actualEnd));
        
        if (sIdx !== -1 && eIdx !== -1 && isSameDay(date, actualStart)) {
          const startCol = sIdx * periods.length + 2;
          const endCol = eIdx * periods.length + periods.length + 1;
          return (
            <div key={`holiday-range-${holiday.name}-${date.toISOString()}`}
                 className="event-card holiday-card"
                 style={{ gridColumn: `${startCol} / ${endCol}`, gridRow: 3 }}>
              {holiday.name}
            </div>
          );
        }
      }
    }
    
    return null;
  });

  const scheduleEventItems = events.filter(e => {
    const eStart = parseISO(e.startDate);
    const eEnd = parseISO(e.endDate);
    const viewStart = displayDates[0];
    const viewEnd = displayDates[displayDates.length - 1];
    return !(isAfter(eStart, viewEnd) || isBefore(eEnd, viewStart));
  }).map(e => {
    const eStart = parseISO(e.startDate);
    const eEnd = parseISO(e.endDate);
    
    const startDayIdx = displayDates.findIndex(d => isSameDay(d, eStart));
    const endDayIdx = displayDates.findIndex(d => isSameDay(d, eEnd));
    const startPeriodIdx = periods.findIndex(p => p.id === e.startPeriodId);
    const endPeriodIdx = periods.findIndex(p => p.id === e.endPeriodId);

    if (startDayIdx === -1 || endDayIdx === -1) return null;

    const startCol = startDayIdx * periods.length + startPeriodIdx + 2;
    const endCol = endDayIdx * periods.length + endPeriodIdx + 2;
    const span = endCol - startCol + 1;

    return (
      <div key={`event-${e.id}`} 
           className="event-card schedule-event-card"
           style={{ 
             gridColumn: `${startCol} / span ${span}`, 
             gridRow: 3,
             backgroundColor: e.color
           }}>
        {e.name}
      </div>
    );
  });

  const resourceLabels = filteredResources.map((r, idx) => (
    <div key={`label-${r.id}`} className="grid-label" style={{ gridColumn: 1, gridRow: idx + 4 }}>
      {r.name}
    </div>
  ));

  const lessonItems = lessons.filter(l => {
    const resId = viewMode === 'room' ? l.roomId : viewMode === 'teacher' ? l.teacherId : l.courseId;
    const resMatch = filteredResources.some(r => r.id === resId);
    if (!resMatch) return false;

    const lStart = parseISO(l.startDate);
    const lEnd = parseISO(l.endDate);
    const viewStart = displayDates[0];
    const viewEnd = displayDates[displayDates.length - 1];

    return !(isAfter(lStart, viewEnd) || isBefore(lEnd, viewStart));
  }).map(l => {
    const lStart = parseISO(l.startDate);
    const lEnd = parseISO(l.endDate);
    
    const startDayIdx = displayDates.findIndex(d => isSameDay(d, lStart));
    const endDayIdx = displayDates.findIndex(d => isSameDay(d, lEnd));
    const startPeriodIdx = periods.findIndex(p => p.id === l.startPeriodId);
    const endPeriodIdx = periods.findIndex(p => p.id === l.endPeriodId);

    if (startDayIdx === -1 || endDayIdx === -1) return null;

    const resourceIdx = filteredResources.findIndex(r => {
      const resId = viewMode === 'room' ? l.roomId : viewMode === 'teacher' ? l.teacherId : l.courseId;
      return r.id === resId;
    });
    if (resourceIdx === -1) return null;

    const startCol = startDayIdx * periods.length + startPeriodIdx + 2;
    const endCol = endDayIdx * periods.length + endPeriodIdx + 2;
    const span = endCol - startCol + 1;

    const infoItems = [];
    if (viewMode !== 'room') infoItems.push({ label: labels.room, value: getResourceName(l.roomId) });
    if (viewMode !== 'teacher') infoItems.push({ label: labels.teacher, value: getResourceName(l.teacherId) });
    if (viewMode !== 'course') infoItems.push({ label: labels.course, value: getResourceName(l.courseId) });
    const tooltipText = `${l.subject}\n` + infoItems.map(item => `${item.label}: ${item.value}`).join('\n');

    return (
      <div 
        key={`lesson-${l.id}`} 
        className="lesson-card"
        style={{
          gridColumn: `${startCol} / span ${span}`,
          gridRow: resourceIdx + 4
        }}
        title={tooltipText}
      >
        <div className="lesson-subject">{l.subject}</div>
        <div className="lesson-details">
          {infoItems.map((item, idx) => (
            <div key={idx} className="lesson-info">
              {item.label}: {item.value}
            </div>
          ))}
        </div>
      </div>
    );
  });

  return (
    <div className="timetable-wrapper">
      <div className="timetable-container" style={gridStyle}>
        <div className="grid-corner" style={{ gridColumn: 1, gridRow: "1 / span 2" }} />
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
        {holidayItems}
        {scheduleEventItems}
        {resourceLabels}
        {lessonItems}
      </div>
    </div>
  );
}
