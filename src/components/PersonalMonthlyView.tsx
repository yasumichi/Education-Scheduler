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
import { TimePeriod, Resource, Lesson, ScheduleEvent, Holiday, ResourceLabels, SystemSetting, ColorTheme, ColorCategory } from '../types';
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
  colorThemes: ColorTheme[];
  onLessonClick?: (lesson: Lesson) => void;
  onEventClick?: (event: ScheduleEvent) => void;
  onEmptyCellClick?: (date: string) => void;
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
  colorThemes,
  onLessonClick,
  onEventClick,
  onEmptyCellClick
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

  // カラーテーマ取得用ヘルパー
  const getThemeColor = (category: ColorCategory, keyOrName: string) => {
    const theme = colorThemes.find(t => t.category === category && (t.key === keyOrName || t.name === keyOrName));
    if (theme) return theme;
    return colorThemes.find(t => t.category === category && t.key === 'default');
  };

  // テキスト選択中のクリックを無視するためのチェック
  const handleIntentionalClick = (callback: () => void) => {
    if (window.getSelection()?.toString()) return;
    callback();
  };

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
      // この教官に割り当てられたイベントのみを表示
      const isAssigned = resourceIdList.includes(userResourceId);
      if (!isAssigned) return false;
      
      return dateStr >= e.startDate && dateStr <= e.endDate;
    });
  };

  const renderDayItems = (date: Date, dayLessons: Lesson[], dayEvents: ScheduleEvent[]) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const totalPeriods = periods.length || 8;
    
    // この日のアイテムを整形して抽出
    const dayItems = [
      ...dayLessons.map(l => {
        let startIdx = 0;
        let endIdx = totalPeriods - 1;
        if (dateStr === l.startDate) {
          const pIdx = periods.findIndex(p => p.id === l.startPeriodId);
          startIdx = pIdx !== -1 ? pIdx : 0;
        }
        if (dateStr === l.endDate) {
          const pIdx = periods.findIndex(p => p.id === l.endPeriodId);
          endIdx = pIdx !== -1 ? pIdx : totalPeriods - 1;
        }
        return { type: 'lesson' as const, data: l, startIdx, endIdx };
      }),
      ...dayEvents.map(e => {
        let startIdx = 0;
        let endIdx = totalPeriods - 1;
        if (dateStr === e.startDate) {
          const pIdx = periods.findIndex(p => p.id === e.startPeriodId);
          startIdx = pIdx !== -1 ? pIdx : 0;
        }
        if (dateStr === e.endDate) {
          const pIdx = periods.findIndex(p => p.id === e.endPeriodId);
          endIdx = pIdx !== -1 ? pIdx : totalPeriods - 1;
        }
        return { type: 'event' as const, data: e, startIdx, endIdx };
      })
    ];

    if (dayItems.length === 0) return null;

    // 重なりを計算して列（level）を割り当てる
    const placements: { item: any, level: number, maxLevelInGroup: number }[] = [];
    const sortedItems = [...dayItems].sort((a, b) => a.startIdx - b.startIdx || (b.endIdx - b.startIdx) - (a.endIdx - a.startIdx));
    
    sortedItems.forEach(item => {
      let level = 0;
      while (placements.some(p => p.level === level && !(item.endIdx < p.item.startIdx || item.startIdx > p.item.endIdx))) {
        level++;
      }
      placements.push({ item, level, maxLevelInGroup: 0 });
    });

    // 同じグループ（重なり合う一群）内での最大列数を計算
    placements.forEach(p => {
      const overlapping = placements.filter(other => !(p.item.endIdx < other.item.startIdx || p.item.startIdx > other.item.endIdx));
      p.maxLevelInGroup = Math.max(...overlapping.map(o => o.level)) + 1;
    });

    return (
      <div className="daily-grid-container">
        {placements.map(p => {
          const { item, level, maxLevelInGroup } = p;
          const { type, data, startIdx, endIdx } = item;
          const span = endIdx - startIdx + 1;
          
          const style: any = {
            top: `${(startIdx / totalPeriods) * 100}%`,
            height: `${(span / totalPeriods) * 100}%`,
            left: `${(level / maxLevelInGroup) * 100}%`,
            width: `${(1 / maxLevelInGroup) * 100}%`,
            zIndex: 10 + level
          };

          // 表示用の時限ラベル (単位不要のため番号のみ)
          const periodLabel = span > 1 ? `${startIdx + 1}-${endIdx + 1}` : `${startIdx + 1}`;

          if (type === 'event') {
            const event = data as ScheduleEvent;
            const theme = getThemeColor('EVENT', event.name) || getThemeColor('EVENT', 'default');
            const bgColor = event.color || theme?.background || '#fef3c7';
            const textColor = theme?.foreground || 'inherit';

            return (
              <div 
                className="personal-event-mini-card" 
                style={{ ...style, backgroundColor: bgColor, color: textColor }}
                onClick={() => handleIntentionalClick(() => onEventClick?.(event))}
                key={`event-${event.id}`}
                title={`${event.name}${event.location ? ` (${event.location})` : ''}`}
              >
                <span className="period-tag" style={{ backgroundColor: 'rgba(0,0,0,0.1)', color: 'inherit' }}>{periodLabel}</span>
                <span className="item-name">{event.name}</span>
              </div>
            );
          } else {
            const lesson = data as Lesson;
            
            const hasTeacher = !!(lesson.teacherId || lesson.externalTeacher);
            const theme = getThemeColor('LESSON', hasTeacher ? 'with-teacher' : 'no-teacher');
            const bgColor = theme?.background || (hasTeacher ? '#646cff' : '#e884fa');
            const textColor = theme?.foreground || '#ffffff';

            const room = resources.find(r => r.id === lesson.roomId);
            const roomLabel = room?.name || lesson.location || '';
            return (
              <div 
                className="personal-lesson-mini-card"
                style={{ ...style, backgroundColor: bgColor, color: textColor }}
                onClick={() => handleIntentionalClick(() => onLessonClick?.(lesson))}
                key={`lesson-${lesson.id}`}
                title={`${lesson.subject} (${roomLabel})`}
              >
                <div className="card-content-wrapper">
                  <span className="period-tag" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'inherit' }}>{periodLabel}</span>
                  <span className="mini-subject">{lesson.subject}</span>
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

          const hTheme = getThemeColor('HOLIDAY', holidayTheme);
          const cellStyle: any = {};
          if (holiday || isWknd) {
            if (hTheme) {
              cellStyle.backgroundColor = hTheme.background;
              cellStyle.color = hTheme.foreground;
            }
          }

          return (
            <div 
              className={dayClasses} 
              key={day.getTime()}
              style={cellStyle}
              onDblClick={() => handleIntentionalClick(() => onEmptyCellClick?.(format(day, 'yyyy-MM-dd')))}
            >
              <div className="day-header">
                <span className="day-number">{format(day, 'd')}</span>
                {holiday && <span className="holiday-name" style={{ color: 'inherit' }}>{holiday.name}</span>}
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
