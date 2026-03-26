import { TimePeriod, Resource, Lesson, ResourceType, ViewType, Holiday, ResourceLabels } from '../types';
import { format, addDays, isSameDay, parseISO, getYear, differenceInDays, isWithinInterval } from 'date-fns';
import './Timetable.css';

interface Props {
  periods: TimePeriod[];
  resources: Resource[];
  lessons: Lesson[];
  viewMode: ResourceType;
  viewType: ViewType;
  baseDate: Date;
  holidays: Holiday[];
  labels: ResourceLabels;
}

export function Timetable({ periods, resources, lessons, viewMode, viewType, baseDate, holidays, labels }: Props) {
  const locale = navigator.language;
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', weekday: 'short' });

  const getHoliday = (date: Date) => {
    return holidays.find(h => {
      if (h.date) return isSameDay(date, parseISO(h.date));
      if (h.start && h.end) {
        return isWithinInterval(date, { start: parseISO(h.start), end: parseISO(h.end) });
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

  const colWidth = '60px';

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `150px repeat(${displayDates.length * periods.length}, minmax(${colWidth}, 1fr))`,
    gridTemplateRows: `auto auto repeat(${resources.length}, 80px)`,
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

  const resourceLabels = resources.map((r, idx) => (
    <div key={`label-${r.id}`} className="grid-label" style={{ gridColumn: 1, gridRow: idx + 3 }}>
      {r.name}
    </div>
  ));

  const lessonItems = lessons.filter(l => {
    const resId = viewMode === 'room' ? l.roomId : viewMode === 'teacher' ? l.teacherId : l.courseId;
    const resMatch = resources.some(r => r.id === resId);
    if (!resMatch) return false;
    const lessonDate = parseISO(l.date);
    return displayDates.some(d => isSameDay(d, lessonDate));
  }).map(l => {
    const lessonDate = parseISO(l.date);
    const dayIdx = displayDates.findIndex(d => isSameDay(d, lessonDate));
    const periodIdx = periods.findIndex(p => p.id === l.startPeriodId);
    const resId = viewMode === 'room' ? l.roomId : viewMode === 'teacher' ? l.teacherId : l.courseId;
    const resourceIdx = resources.findIndex(r => r.id === resId);

    if (dayIdx === -1 || periodIdx === -1 || resourceIdx === -1) return null;

    const startCol = dayIdx * periods.length + periodIdx + 2;

    // カード内の追加情報の表示ラベルを決定
    let infoLabel = '';
    let infoValue = '';
    if (viewMode === 'room') { infoLabel = labels.teacher; infoValue = l.teacherId; }
    else if (viewMode === 'teacher') { infoLabel = labels.room; infoValue = l.roomId; }
    else { infoLabel = labels.room; infoValue = l.roomId; }

    return (
      <div 
        key={`lesson-${l.id}`} 
        className="lesson-card"
        style={{
          gridColumn: `${startCol} / span ${l.duration}`,
          gridRow: resourceIdx + 3
        }}
      >
        <div className="lesson-subject">{l.subject}</div>
        <div className="lesson-info">
          {infoLabel}: {infoValue}
        </div>
      </div>
    );
  });

  return (
    <div className="timetable-wrapper">
      <div className="timetable-container" style={gridStyle}>
        {resources.map((_, rIdx) => 
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
                   style={{ gridColumn: dIdx * periods.length + pIdx + 2, gridRow: rIdx + 3 }} />
            ));
          })
        )}
        {dateHeaders}
        {periodHeaders}
        {resourceLabels}
        {lessonItems}
      </div>
    </div>
  );
}
