import { useState, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { CourseType, Subject, Lesson, TimePeriod, ResourceLabels, Resource } from '../types';
import { parseISO, differenceInDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { exportTeacherStatisticsToExcel } from '../utils/excelExport';
import './TeacherStatistics.css';

interface Props {
  teacher: Resource;
  courses: Resource[];
  subjects: Subject[];
  lessons: Lesson[];
  periods: TimePeriod[];
  labels: ResourceLabels;
  onClose: () => void;
  initialStartDate?: string;
  initialEndDate?: string;
}

interface TeacherStatRow {
  courseId: string;
  courseName: string;
  courseOrder: number;
  largeSubject: string;
  largeOrder: number;
  middleSubject: string;
  middleOrder: number;
  smallSubject: string;
  smallOrder: number;
  mainHours: number;
  subHours: number;
  totalHours: number;
  level: number; // 1: Course, 2: Subject Row, 3: Course Subtotal
  courseSpan?: number;
  largeSpan?: number;
  middleSpan?: number;
}

export function TeacherStatistics({ 
  teacher, courses, subjects, lessons, periods, labels, onClose, 
  initialStartDate, initialEndDate 
}: Props) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(initialStartDate || '');
  const [endDate, setEndDate] = useState(initialEndDate || '');

  const calculatePeriods = (l: Lesson) => {
    const sIdx = periods.findIndex(p => p.id === l.startPeriodId);
    const eIdx = periods.findIndex(p => p.id === l.endPeriodId);
    if (sIdx === -1 || eIdx === -1) return 0;

    if (l.startDate === l.endDate) {
      return eIdx - sIdx + 1;
    } else {
      const numDays = differenceInDays(parseISO(l.endDate), parseISO(l.startDate));
      return (periods.length - sIdx) + (numDays - 1) * periods.length + (eIdx + 1);
    }
  };

  const stats = useMemo(() => {
    // 1. Filter lessons by date range and teacher
    const filteredLessons = lessons.filter(l => {
      const lessonStart = parseISO(l.startDate);
      const lessonEnd = parseISO(l.endDate);
      
      // Teacher filter
      const isMain = l.teacherId === teacher.id;
      const isSub = l.subTeacherIds?.includes(teacher.id) || l.subTeachers?.some(st => st.id === teacher.id);
      if (!isMain && !isSub) return false;

      // Date filter
      if (startDate && lessonEnd < parseISO(startDate)) return false;
      if (endDate && lessonStart > parseISO(endDate)) return false;

      return true;
    });

    // 2. Group by Course and Subject
    const groupedData: Record<string, Record<string, { main: number, sub: number }>> = {};

    filteredLessons.forEach(l => {
      const course = courses.find(c => c.id === l.courseId);
      if (!course) return;

      const courseKey = course.id;
      if (!groupedData[courseKey]) groupedData[courseKey] = {};

      const subject = subjects.find(s => s.id === l.subjectId);
      const subjectKey = subject ? subject.id : (l.subjectId || 'unknown');
      
      if (!groupedData[courseKey][subjectKey]) {
        groupedData[courseKey][subjectKey] = { main: 0, sub: 0 };
      }

      const hours = calculatePeriods(l);
      if (l.teacherId === teacher.id) {
        groupedData[courseKey][subjectKey].main += hours;
      } else {
        groupedData[courseKey][subjectKey].sub += hours;
      }
    });

    // 3. Flatten and build hierarchy
    const rows: TeacherStatRow[] = [];
    let grandTotalMain = 0;
    let grandTotalSub = 0;

    // Sort courses by order
    const sortedCourseIds = Object.keys(groupedData).sort((a, b) => {
      const courseA = courses.find(c => c.id === a);
      const courseB = courses.find(c => c.id === b);
      return (courseA?.order || 0) - (courseB?.order || 0);
    });

    sortedCourseIds.forEach(courseId => {
      const subjectGroups = groupedData[courseId];
      const course = courses.find(c => c.id === courseId)!;
      let courseTotalMain = 0;
      let courseTotalSub = 0;

      // Group subjects by their hierarchy
      const courseRows: TeacherStatRow[] = [];

      Object.entries(subjectGroups).forEach(([subjectId, hours]) => {
        const subject = subjects.find(s => s.id === subjectId);
        
        let large = '';
        let middle = '';
        let small = '';
        let largeOrder = 0;
        let middleOrder = 0;
        let smallOrder = 0;

        if (subject) {
          if (subject.level === 3) {
            small = subject.name;
            smallOrder = subject.order;
            const mid = subjects.find(s => s.id === subject.parentId);
            if (mid) {
              middle = mid.name;
              middleOrder = mid.order;
              const lrg = subjects.find(s => s.id === mid.parentId);
              if (lrg) {
                large = lrg.name;
                largeOrder = lrg.order;
              }
            }
          } else if (subject.level === 2) {
            middle = subject.name;
            middleOrder = subject.order;
            const lrg = subjects.find(s => s.id === subject.parentId);
            if (lrg) {
              large = lrg.name;
              largeOrder = lrg.order;
            }
          } else if (subject.level === 1) {
            large = subject.name;
            largeOrder = subject.order;
          }
        } else {
          large = subjectId; // Fallback
        }

        courseRows.push({
          courseId,
          courseName: course.name,
          courseOrder: course.order || 0,
          largeSubject: large,
          largeOrder,
          middleSubject: middle,
          middleOrder,
          smallSubject: small,
          smallOrder,
          mainHours: hours.main,
          subHours: hours.sub,
          totalHours: hours.main + hours.sub,
          level: 2
        });

        courseTotalMain += hours.main;
        courseTotalSub += hours.sub;
      });

      // Sort subjects: Large Order -> Middle Order -> Small Order
      courseRows.sort((a, b) => 
        a.largeOrder - b.largeOrder || 
        a.middleOrder - b.middleOrder || 
        a.smallOrder - b.smallOrder
      );

      // Calculate rowSpans within courseRows
      for (let i = 0; i < courseRows.length; i++) {
        // Large Span
        let lSpan = 1;
        while (i + lSpan < courseRows.length && 
               courseRows[i + lSpan].largeSubject === courseRows[i].largeSubject && 
               courseRows[i].largeSubject !== '') {
          lSpan++;
        }
        courseRows[i].largeSpan = lSpan;

        // Middle Span (must be within same Large group)
        for (let j = 0; j < lSpan; j++) {
          let mSpan = 1;
          const currentM = courseRows[i + j].middleSubject;
          if (currentM !== '') {
            while (i + j + mSpan < i + lSpan && 
                   courseRows[i + j + mSpan].middleSubject === currentM) {
              mSpan++;
            }
          }
          courseRows[i + j].middleSpan = mSpan;
          j += mSpan - 1;
        }
        i += lSpan - 1;
      }

      // Add Subject rows
      rows.push(...courseRows);

      // Add Course Subtotal row
      rows.push({
        courseId,
        courseName: course.name,
        courseOrder: course.order || 0,
        largeSubject: '',
        largeOrder: 999999,
        middleSubject: '',
        middleOrder: 999999,
        smallSubject: t('{{resource}} Subtotal', { resource: labels.course }),
        smallOrder: 999999,
        mainHours: courseTotalMain,
        subHours: courseTotalSub,
        totalHours: courseTotalMain + courseTotalSub,
        level: 3
      });

      // Set Course Span (on the first row of the course)
      const numCourseRows = courseRows.length + 1; // +1 for subtotal row
      const firstCourseRowIndex = rows.length - numCourseRows;
      rows[firstCourseRowIndex].courseSpan = numCourseRows;

      grandTotalMain += courseTotalMain;
      grandTotalSub += courseTotalSub;
    });

    return { rows, grandTotalMain, grandTotalSub };
  }, [teacher, courses, subjects, lessons, periods, startDate, endDate, t]);

  return (
    <div className="teacher-statistics-overlay">
      <div className="teacher-statistics-box">
        <div className="dialog-header">
          <h2>{t('{{resource}} Statistics', { resource: labels.teacher })}: {teacher.name}</h2>
          <div className="header-actions">
            <button 
              className="excel-export-btn" 
              onClick={() => exportTeacherStatisticsToExcel({ 
                teacherName: teacher.name, 
                stats: stats.rows, 
                grandTotalMain: stats.grandTotalMain,
                grandTotalSub: stats.grandTotalSub,
                labels, t,
                dateRange: startDate || endDate ? `${startDate} ~ ${endDate}` : t('All Period')
              })}
              title={t('Export to Excel')}
              style={{ marginRight: '10px' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span style={{ marginLeft: '5px' }}>Excel</span>
            </button>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="teacher-statistics-content">
          <div className="range-selector">
            <label>{t('Period')}:</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.currentTarget.value)} />
            <span>~</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.currentTarget.value)} />
          </div>

          <table className="stat-table">
            <thead>
              <tr>
                <th className="col-course">{labels.course}</th>
                <th className="col-large">{labels.subjectLarge}</th>
                <th className="col-middle">{labels.subjectMiddle}</th>
                <th className="col-small">{labels.subjectSmall}</th>
                <th className="col-main">{labels.mainTeacher}</th>
                <th className="col-sub">{labels.subTeacher}</th>
                <th className="col-total">{t('Subtotal')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.map((row, idx) => {
                const prev = idx > 0 ? stats.rows[idx - 1] : null;
                const isFirstCourseRow = !prev || prev.courseId !== row.courseId;

                return (
                  <tr key={`${row.courseId}-${idx}`} className={row.level === 3 ? 'course-subtotal' : ''}>
                    {row.courseSpan !== undefined ? (
                      <td 
                        className="col-course" 
                        rowSpan={row.courseSpan}
                      >
                        {row.courseName}
                      </td>
                    ) : null}
                    
                    {row.level === 3 ? (
                      <>
                        <td colSpan={3} className="col-subtotal-label">
                          {row.smallSubject}
                        </td>
                      </>
                    ) : (
                      <>
                        {row.largeSpan !== undefined ? (
                          <td className="col-large" rowSpan={row.largeSpan}>
                            {row.largeSubject}
                          </td>
                        ) : null}
                        
                        {row.middleSpan !== undefined ? (
                          <td className="col-middle" rowSpan={row.middleSpan}>
                            {row.middleSubject}
                          </td>
                        ) : null}

                        <td className="col-small">
                          {row.smallSubject}
                        </td>
                      </>
                    )}
                    
                    <td className="col-main">{row.mainHours}</td>
                    <td className="col-sub">{row.subHours}</td>
                    <td className="col-total">{row.totalHours}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="grand-total">
                <td colSpan={4}>{t('Grand Total')}</td>
                <td className="col-main">{stats.grandTotalMain}</td>
                <td className="col-sub">{stats.grandTotalSub}</td>
                <td className="col-total">{stats.grandTotalMain + stats.grandTotalSub}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="dialog-footer">
          <button className="cancel-button" onClick={onClose}>{t('Close')}</button>
        </div>
      </div>
    </div>
  );
}
