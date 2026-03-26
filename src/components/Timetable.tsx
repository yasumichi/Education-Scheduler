import { TimePeriod, Resource, Lesson, ResourceType, ViewType, Holiday, ResourceLabels } from '../types';
import { format, addDays, isSameDay, parseISO, getYear, differenceInDays, isWithinInterval, isBefore, isAfter } from 'date-fns';
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

  const getResourceName = (id: string) => {
    return resources.find(r => r.id === id)?.name || id;
  };

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
    gridTemplateRows: `auto auto repeat(${resources.filter(r => r.type === viewMode).length}, 80px)`,
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

  const filteredResources = resources.filter(r => r.type === viewMode);
  const resourceLabels = filteredResources.map((r, idx) => (
    <div key={`label-${r.id}`} className="grid-label" style={{ gridColumn: 1, gridRow: idx + 3 }}>
      {r.name}
    </div>
  ));

  const lessonItems = lessons.filter(l => {
    const resId = viewMode === 'room' ? l.roomId : viewMode === 'teacher' ? l.teacherId : l.courseId;
    const resMatch = filteredResources.some(r => r.id === resId);
    if (!resMatch) return false;

    // 表示期間（displayDates）と授業期間（startDate〜endDate）に重なりがあるかチェック
    const lStart = parseISO(l.startDate);
    const lEnd = parseISO(l.endDate);
    const viewStart = displayDates[0];
    const viewEnd = displayDates[displayDates.length - 1];

    return !(isAfter(lStart, viewEnd) || isBefore(lEnd, viewStart));
  }).map(l => {
    const lStart = parseISO(l.startDate);
    const lEnd = parseISO(l.endDate);
    
    // グリッド上の開始位置と終了位置を計算
    const startDayIdx = displayDates.findIndex(d => isSameDay(d, lStart));
    const endDayIdx = displayDates.findIndex(d => isSameDay(d, lEnd));
    const startPeriodIdx = periods.findIndex(p => p.id === l.startPeriodId);
    const endPeriodIdx = periods.findIndex(p => p.id === l.endPeriodId);

    // 表示範囲外から始まっている、または外で終わっている場合のクリッピング処理
    // (プロトタイプなので簡易的に、範囲内にある場合のみ描画)
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
          gridRow: resourceIdx + 3
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
