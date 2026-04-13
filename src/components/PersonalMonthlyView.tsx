import { JSX } from 'preact';
import { useTranslation } from 'react-i18next';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  parseISO,
  isSunday,
  isSaturday,
  addDays
} from 'date-fns';
import { TimePeriod, Resource, Lesson, ScheduleEvent, Holiday, ResourceLabels, SystemSetting } from '../types';
import './PersonalMonthlyView.css';

interface Props {
  userResourceId: string;
  resources: Resource[];
  lessons: Lesson[];
  events: ScheduleEvent[];
  periods: TimePeriod[];
  baseDate: Date;
  holidays: Holiday[];
  labels: ResourceLabels;
  systemSettings: SystemSetting | null;
  onLessonClick?: (lesson: Lesson) => void;
  onEventClick?: (event: ScheduleEvent) => void;
}

export function PersonalMonthlyView({
  userResourceId,
  resources,
  lessons,
  events,
  periods,
  baseDate,
  holidays,
  labels,
  systemSettings,
  onLessonClick,
  onEventClick
}: Props) {
  const { t } = useTranslation();
  
  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  
  const days = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd
  });
  
  const weeksCount = days.length / 7;

  const weekendDayIndices = (systemSettings?.weekendDays || "0,6").split(',').map(Number);
  const isWeekend = (date: Date) => weekendDayIndices.includes(date.getDay());
  const holidayTheme = systemSettings?.holidayTheme || 'default';

  const getHoliday = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return holidays.find(h => {
      if (h.date === dateStr) return true;
      if (h.start && h.end) {
        return dateStr >= h.start && dateStr <= h.end;
      }
      return false;
    });
  };

  const getLessonsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return lessons.filter(l => {
      const subIds = [...(l.subTeacherIds || []), ...(l.subTeachers || []).map(t => t.id)];
      const isTeacher = l.teacherId === userResourceId || subIds.includes(userResourceId);
      if (!isTeacher) return false;
      
      // 期間内に入っているかチェック
      return dateStr >= l.startDate && dateStr <= l.endDate;
    });
  };

  const getEventsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events.filter(e => {
      const resourceIdList = [...(e.resourceIds || []), ...(e.resources || []).map(r => r.id)];
      // 1. この教官に割り当てられたイベント (教官行に表示されるもの)
      const isAssigned = resourceIdList.includes(userResourceId);
      // 2. イベント行に表示されるグローバルイベント
      const isGlobal = e.showInEventRow !== false || resourceIdList.length === 0;

      if (!isAssigned && !isGlobal) return false;
      
      return dateStr >= e.startDate && dateStr <= e.endDate;
    });
  };

  const renderDayItems = (date: Date, dayLessons: Lesson[], dayEvents: ScheduleEvent[]) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // 全ての時限アイテムを収集
    const items: { type: 'lesson' | 'event', data: any, periodId: string }[] = [];

    periods.slice(0, 8).forEach(p => {
      // この時限のイベント
      dayEvents.filter(e => {
        if (e.startDate === e.endDate) return p.id >= e.startPeriodId && p.id <= e.endPeriodId;
        if (dateStr === e.startDate) return p.id >= e.startPeriodId;
        if (dateStr === e.endDate) return p.id <= e.endPeriodId;
        return true;
      }).forEach(e => {
        if (!items.find(item => item.type === 'event' && item.data.id === e.id)) {
          items.push({ type: 'event', data: e, periodId: p.id });
        }
      });

      // この時限の授業
      dayLessons.filter(l => {
        if (l.startDate === l.endDate) return p.id >= l.startPeriodId && p.id <= l.endPeriodId;
        if (dateStr === l.startDate) return p.id >= l.startPeriodId;
        if (dateStr === l.endDate) return p.id <= l.endPeriodId;
        return true;
      }).forEach(l => {
        if (!items.find(item => item.type === 'lesson' && item.data.id === l.id)) {
          items.push({ type: 'lesson', data: l, periodId: p.id });
        }
      });
    });

    // 時限順にソート (p1, p2...)
    items.sort((a, b) => {
      const aNum = parseInt(a.periodId.replace('p', ''));
      const bNum = parseInt(b.periodId.replace('p', ''));
      return aNum - bNum;
    });

    // 重なり（同一開始時限）のカウント用
    const overlapCount: Record<string, number> = {};

    return (
      <div className="daily-grid-container">
        {items.map(item => {
          const startIdx = parseInt(item.periodId.replace('p', '')) - 1;
          let endIdx = startIdx;
          let data = item.data;
          
          if (item.type === 'event') {
            const e = data as ScheduleEvent;
            const eEnd = parseInt(e.endPeriodId.replace('p', '')) - 1;
            // この日の中での終了位置を計算
            if (dateStr === e.endDate) endIdx = eEnd;
            else if (dateStr < e.endDate) endIdx = 7; // この日は最後まで
          } else {
            const l = data as Lesson;
            const lEnd = parseInt(l.endPeriodId.replace('p', '')) - 1;
            if (dateStr === l.endDate) endIdx = lEnd;
            else if (dateStr < l.endDate) endIdx = 7;
          }

          const span = Math.max(1, endIdx - startIdx + 1);
          const key = `${item.type}-${data.id}`;
          
          const periodLabel = span > 1 ? `${startIdx + 1}-${endIdx + 1}` : `${startIdx + 1}`;

          // シンプルな重なり回避（左からのオフセット）
          const slotKey = `${startIdx}`;
          const offset = overlapCount[slotKey] || 0;
          overlapCount[slotKey] = offset + 1;

          const style = {
            top: `${(startIdx / 8) * 100}%`,
            height: `${(span / 8) * 100}%`,
            left: `${offset * 5}px`,
            width: `calc(100% - ${offset * 5}px)`,
            zIndex: 10 + offset
          };

          if (item.type === 'event') {
            const event = data as ScheduleEvent;
            return (
              <div 
                className="personal-event-mini-card" 
                style={{ ...style, backgroundColor: event.color || '#fef3c7' }}
                onClick={() => onEventClick?.(event)}
                key={key}
                title={`${event.name}${event.location ? ` (${event.location})` : ''}`}
              >
                <span className="period-tag">{periodLabel}</span>
                <span className="item-name">{event.name}{event.location ? ` (${event.location})` : ''}</span>
              </div>
            );
          } else {
            const lesson = data as Lesson;
            const room = resources.find(r => r.id === lesson.roomId);
            const roomLabel = room?.name || lesson.location || '';
            return (
              <div 
                className="personal-lesson-mini-card"
                style={style}
                onClick={() => onLessonClick?.(lesson)}
                key={key}
                title={`${lesson.subject} (${roomLabel})`}
              >
                <div className="card-content-wrapper">
                  <span className="period-tag">{periodLabel}</span>
                  <span className="mini-subject">{lesson.subject} {roomLabel ? `(${roomLabel})` : ''}</span>
                </div>
              </div>
            );
          }
        })}
      </div>
    );
  };

  const weekdayFormatter = new Intl.DateTimeFormat(navigator.language, { weekday: 'short' });
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2021, 0, 3 + i); // 2021-01-03 is Sunday
    return weekdayFormatter.format(d);
  });

  return (
    <div className={`personal-monthly-container holiday-theme-${holidayTheme}`} style={{ '--weeks-count': weeksCount } as any}>
      <div className="personal-calendar-header">
        {weekDays.map(day => (
          <div className="calendar-weekday-label" key={day}>{day}</div>
        ))}
      </div>
      <div className="personal-calendar-grid">
        {days.map(day => {
          const isCurrentMonth = isSameMonth(day, monthStart);
          const holiday = getHoliday(day);
          const isWknd = isWeekend(day);
          const dayLessons = getLessonsForDay(day);
          const dayEvents = getEventsForDay(day);

          let dayClasses = "calendar-day-cell";
          if (!isCurrentMonth) dayClasses += " other-month";
          if (isWknd) dayClasses += " is-weekend";
          if (holiday) dayClasses += " is-holiday";

          return (
            <div className={dayClasses} key={day.getTime()}>
              <div className="day-header">
                <span className="day-number">{format(day, 'd')}</span>
                {holiday && <span className="holiday-name">{holiday.name}</span>}
              </div>
              <div className="day-content">
                {renderDayItems(day, dayLessons, dayEvents)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

