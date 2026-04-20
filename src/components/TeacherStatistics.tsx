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
  largeSubject: string;
  middleSubject: string;
  smallSubject: string;
  mainHours: number;
  subHours: number;
  totalHours: number;
  level: number; // 1: Course, 2: Subject Row, 3: Course Subtotal
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

    Object.entries(groupedData).forEach(([courseId, subjectGroups]) => {
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

        if (subject) {
          if (subject.level === 3) {
            small = subject.name;
            const mid = subjects.find(s => s.id === subject.parentId);
            if (mid) {
              middle = mid.name;
              const lrg = subjects.find(s => s.id === mid.parentId);
              if (lrg) large = lrg.name;
            }
          } else if (subject.level === 2) {
            middle = subject.name;
            const lrg = subjects.find(s => s.id === subject.parentId);
            if (lrg) large = lrg.name;
          } else if (subject.level === 1) {
            large = subject.name;
          }
        } else {
          large = subjectId; // Fallback
        }

        courseRows.push({
          courseId,
          courseName: course.name,
          largeSubject: large,
          middleSubject: middle,
          smallSubject: small,
          mainHours: hours.main,
          subHours: hours.sub,
          totalHours: hours.main + hours.sub,
          level: 2
        });

        courseTotalMain += hours.main;
        courseTotalSub += hours.sub;
      });

      // Sort subjects: Large -> Middle -> Small
      courseRows.sort((a, b) => 
        a.largeSubject.localeCompare(b.largeSubject) || 
        a.middleSubject.localeCompare(b.middleSubject) || 
        a.smallSubject.localeCompare(b.smallSubject)
      );

      // Add Course Header (optional, but requested Course subtotal)
      // Actually, standard is Course | Subject | Main | Sub | Total
      // Let's add all subject rows, then a Course subtotal row.
      
      rows.push(...courseRows);

      rows.push({
        courseId,
        courseName: course.name,
        largeSubject: '',
        middleSubject: '',
        smallSubject: t('Course Subtotal'),
        mainHours: courseTotalMain,
        subHours: courseTotalSub,
        totalHours: courseTotalMain + courseTotalSub,
        level: 3
      });

      grandTotalMain += courseTotalMain;
      grandTotalSub += courseTotalSub;
    });

    return { rows, grandTotalMain, grandTotalSub };
  }, [teacher, courses, subjects, lessons, periods, startDate, endDate]);

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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
                
                const isSameLarge = !isFirstCourseRow && row.largeSubject && prev && prev.largeSubject === row.largeSubject;
                const isSameMiddle = isSameLarge && row.middleSubject && prev && prev.middleSubject === row.middleSubject;

                return (
                  <tr key={`${row.courseId}-${idx}`} className={row.level === 3 ? 'course-subtotal' : ''}>
                    <td className={`col-course ${!isFirstCourseRow ? 'no-border-top' : ''} ${!row.largeSubject && !row.middleSubject && !row.smallSubject ? 'no-border-right' : ''}`}>
                      {isFirstCourseRow ? row.courseName : ''}
                    </td>
                    <td className={`col-large ${isSameLarge ? 'no-border-top' : ''} ${!row.largeSubject ? 'no-border-left no-border-right' : (!row.middleSubject ? 'no-border-right' : '')}`}>
                      {row.largeSubject}
                    </td>
                    <td className={`col-middle ${isSameMiddle ? 'no-border-top' : ''} ${!row.middleSubject ? 'no-border-left no-border-right' : (!row.smallSubject ? 'no-border-right' : '')}`}>
                      {row.middleSubject}
                    </td>
                    <td className={`col-small ${!row.smallSubject ? 'no-border-left' : ''}`}>
                      {row.smallSubject}
                    </td>
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
