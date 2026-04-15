import { JSX } from 'preact';
import { useTranslation } from 'react-i18next';
import { 
  format, 
  startOfWeek, 
  addDays, 
  eachDayOfInterval
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { TimePeriod, Resource, Lesson, ResourceLabels } from '../types';
import { exportCourseWeeklyToExcel } from '../utils/excelExport';
import './CourseWeeklyView.css';

interface Props {
  courseId: string;
  resources: Resource[];
  lessons: Lesson[];
  periods: TimePeriod[];
  baseDate: Date;
  labels: ResourceLabels;
  onLessonClick?: (lesson: Lesson) => void;
}

export function CourseWeeklyView({
  courseId,
  resources,
  lessons,
  periods,
  baseDate,
  labels,
  onLessonClick
}: Props) {
  const { t } = useTranslation();
  
  const course = resources.find(r => r.id === courseId);
  if (!course) return <div>Course not found</div>;

  const weekStart = startOfWeek(baseDate, { weekStartsOn: 0 });
  const weekEnd = addDays(weekStart, 6);
  const days = eachDayOfInterval({
    start: weekStart,
    end: weekEnd
  });

  const handleExport = () => {
    exportCourseWeeklyToExcel({
      courseId,
      periods,
      resources,
      lessons,
      baseDate,
      labels,
      t
    });
  };

  const dateLocale = t('locale') === 'ja' ? ja : undefined;

  return (
    <div className="course-weekly-container">
      <div className="course-weekly-header">
        <h2 className="course-title">{t(course.name)}</h2>
      </div>

      <div className="course-weekly-table-wrapper">
        <table className="course-weekly-table">
          <thead>
            <tr>
              <th style={{ width: '120px' }}>{t('Date')}</th>
              <th style={{ width: '60px' }}>{t('Period')}</th>
              <th style={{ width: '360px' }}>{labels.subject}</th>
              <th style={{ width: '150px' }}>{labels.deliveryMethod}</th>
              <th style={{ width: '150px' }}>{labels.room}</th>
              <th style={{ width: '150px' }}>{labels.mainTeacher}</th>
              <th style={{ width: '150px' }}>{t('Remarks')}</th>
            </tr>
          </thead>
          <tbody>
            {days.flatMap(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayLessons = lessons.filter(l => l.courseId === courseId && dateStr >= l.startDate && dateStr <= l.endDate);

              // この日の各時限でどのレッスンを表示するか、および rowspan を計算
              const periodAssignment: { lesson: Lesson | null, rowSpan: number }[] = periods.map(() => ({ lesson: null, rowSpan: 1 }));
              
              const processedLessonIds = new Set<string>();
              const processedEmptyStartIndices = new Set<number>();

              periods.forEach((period, pIdx) => {
                const lesson = dayLessons.find(l => {
                  if (dateStr === l.startDate && dateStr === l.endDate) {
                    return period.id >= l.startPeriodId && period.id <= l.endPeriodId;
                  }
                  if (dateStr === l.startDate) return period.id >= l.startPeriodId;
                  if (dateStr === l.endDate) return period.id <= l.endPeriodId;
                  return dateStr > l.startDate && dateStr < l.endDate;
                });

                if (lesson) {
                  if (!processedLessonIds.has(lesson.id)) {
                    processedLessonIds.add(lesson.id);
                    let span = 1;
                    for (let nextPIdx = pIdx + 1; nextPIdx < periods.length; nextPIdx++) {
                      const nextPeriod = periods[nextPIdx];
                      const isSameLesson = dayLessons.some(l => l.id === lesson.id && (() => {
                        if (dateStr === l.startDate && dateStr === l.endDate) {
                          return nextPeriod.id >= l.startPeriodId && nextPeriod.id <= l.endPeriodId;
                        }
                        if (dateStr === l.startDate) return nextPeriod.id >= l.startPeriodId;
                        if (dateStr === l.endDate) return nextPeriod.id <= l.endPeriodId;
                        return dateStr > l.startDate && dateStr < l.endDate;
                      })());
                      if (isSameLesson) span++;
                      else break;
                    }
                    periodAssignment[pIdx] = { lesson, rowSpan: span };
                  } else {
                    periodAssignment[pIdx] = { lesson, rowSpan: 0 };
                  }
                } else {
                  // 空きコマの場合の連続結合処理
                  if (!Array.from(processedEmptyStartIndices).some(startIdx => {
                    const assignment = periodAssignment[startIdx];
                    return assignment.lesson === null && pIdx < startIdx + assignment.rowSpan;
                  })) {
                    let span = 1;
                    for (let nextPIdx = pIdx + 1; nextPIdx < periods.length; nextPIdx++) {
                      const nextPeriod = periods[nextPIdx];
                      const nextLesson = dayLessons.find(l => {
                        if (dateStr === l.startDate && dateStr === l.endDate) {
                          return nextPeriod.id >= l.startPeriodId && nextPeriod.id <= l.endPeriodId;
                        }
                        if (dateStr === l.startDate) return nextPeriod.id >= l.startPeriodId;
                        if (dateStr === l.endDate) return nextPeriod.id <= l.endPeriodId;
                        return dateStr > l.startDate && dateStr < l.endDate;
                      });
                      if (!nextLesson) span++;
                      else break;
                    }
                    periodAssignment[pIdx] = { lesson: null, rowSpan: span };
                    processedEmptyStartIndices.add(pIdx);
                  } else {
                    periodAssignment[pIdx] = { lesson: null, rowSpan: 0 };
                  }
                }
              });

              return periods.map((period, pIdx) => {
                const { lesson, rowSpan } = periodAssignment[pIdx];
                const room = lesson ? resources.find(r => r.id === lesson.roomId) : null;
                const teacher = lesson ? resources.find(r => r.id === lesson.teacherId) : null;
                const periodDisplay = period.name.replace(/\D/g, '');

                return (
                  <tr key={`${dateStr}-${period.id}`} 
                      onDblClick={() => lesson && onLessonClick?.(lesson)} 
                      className={lesson ? 'clickable-row' : ''}>
                    {pIdx === 0 ? (
                      <td rowSpan={periods.length} className="date-cell">
                        {format(day, t('date_format'), { locale: dateLocale })}
                      </td>
                    ) : null}
                    <td className="period-cell">{periodDisplay}</td>
                    
                    {rowSpan > 0 ? (
                      <>
                        <td rowSpan={rowSpan} className="subject-cell">{lesson ? t(lesson.subject) : ''}</td>
                        <td rowSpan={rowSpan} className="method-cell">
                          {lesson && (lesson.deliveryMethods || []).map(m => (
                            <span key={m.id} className="method-tag" style={{ backgroundColor: m.color }}>
                              {m.name}
                            </span>
                          ))}
                        </td>
                        <td rowSpan={rowSpan} className="room-cell">
                          {lesson ? (room ? t(room.name) : (lesson.location || '')) : ''}
                        </td>
                        <td rowSpan={rowSpan} className="teacher-cell">
                          {lesson ? (teacher ? t(teacher.name) : (lesson.externalTeacher || '')) : ''}
                        </td>
                        <td rowSpan={rowSpan} className="remarks-cell">{lesson?.remarks || ''}</td>
                      </>
                    ) : null}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
