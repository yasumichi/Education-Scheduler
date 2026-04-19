import { useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { CourseType, Subject, Lesson, TimePeriod, ResourceLabels, Resource } from '../types';
import { parseISO, differenceInDays } from 'date-fns';
import { exportCourseStatisticsToExcel } from '../utils/excelExport';
import './CourseStatistics.css';

interface Props {
  course: Resource;
  subjects: Subject[];
  lessons: Lesson[];
  periods: TimePeriod[];
  labels: ResourceLabels;
  onClose: () => void;
}

interface StatRow {
  id: string;
  name: string;
  level: number;
  assigned: number;
  scheduled: number;
  children: StatRow[];
}

export function CourseStatistics({ course, subjects, lessons, periods, labels, onClose }: Props) {
  const { t } = useTranslation();

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
    if (!course.courseTypeId) return [];

    const typeSubjects = subjects.filter(s => s.courseTypeId === course.courseTypeId);
    const courseLessons = lessons.filter(l => l.courseId === course.id);

    const buildStatTree = (parentId: string | null, level: number): StatRow[] => {
      return typeSubjects
        .filter(s => s.parentId === parentId)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(s => {
          const children = buildStatTree(s.id, level + 1);
          
          let assigned = 0;
          let scheduled = 0;

          if (children.length > 0) {
            // Aggregate from children
            assigned = children.reduce((sum, child) => sum + child.assigned, 0);
            scheduled = children.reduce((sum, child) => sum + child.scheduled, 0);
          } else {
            // Leaf node: get assigned from course.subjects and scheduled from courseLessons
            const courseSub = course.subjects?.find(cs => cs.subjectId === s.id);
            assigned = courseSub?.totalPeriods || 0;
            
            scheduled = courseLessons
              .filter(l => l.subjectId === s.id || (l.subjectId === null && l.subject === s.name))
              .reduce((sum, l) => sum + calculatePeriods(l), 0);
          }

          return {
            id: s.id,
            name: s.name,
            level: s.level,
            assigned,
            scheduled,
            children
          };
        });
    };

    return buildStatTree(null, 1);
  }, [course, subjects, lessons, periods]);

  const grandTotalAssigned = stats.reduce((sum, row) => sum + row.assigned, 0);
  const grandTotalScheduled = stats.reduce((sum, row) => sum + row.scheduled, 0);

  const renderRows = (rows: StatRow[]) => {
    const elements: any[] = [];

    const traverse = (row: StatRow) => {
      elements.push(
        <tr key={row.id} className={`stat-level-${row.level} ${row.children.length > 0 ? 'stat-group' : 'stat-leaf'}`}>
          <td className="col-large">{row.level === 1 ? row.name : ''}</td>
          <td className="col-middle">{row.level === 2 ? row.name : ''}</td>
          <td className="col-small">{row.level === 3 ? row.name : ''}</td>
          <td className="col-assigned">{row.assigned}</td>
          <td className="col-scheduled">{row.scheduled}</td>
          <td className="col-diff">
            <span className={row.scheduled > row.assigned ? 'text-over' : row.scheduled < row.assigned ? 'text-under' : ''}>
              {row.scheduled - row.assigned}
            </span>
          </td>
        </tr>
      );
      row.children.forEach(traverse);
    };

    rows.forEach(traverse);
    return elements;
  };

  return (
    <div className="course-statistics-overlay">
      <div className="course-statistics-box">
        <div className="dialog-header">
          <h2>{t('Course Statistics')}: {course.name}</h2>
          <div className="header-actions">
            <button 
              className="excel-export-btn" 
              onClick={() => exportCourseStatisticsToExcel({ courseName: course.name, stats, labels, t })}
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

        <div className="course-statistics-content">
          <table className="stat-table">
            <thead>
              <tr>
                <th className="col-large">{labels.subjectLarge}</th>
                <th className="col-middle">{labels.subjectMiddle}</th>
                <th className="col-small">{labels.subjectSmall}</th>
                <th className="col-assigned">{t('Assigned')}</th>
                <th className="col-scheduled">{t('Scheduled')}</th>
                <th className="col-diff">{t('Diff')}</th>
              </tr>
            </thead>
            <tbody>
              {renderRows(stats)}
            </tbody>
            <tfoot>
              <tr className="grand-total">
                <td colSpan={3}>{t('Grand Total')}</td>
                <td className="col-assigned">{grandTotalAssigned}</td>
                <td className="col-scheduled">{grandTotalScheduled}</td>
                <td className="col-diff">{grandTotalScheduled - grandTotalAssigned}</td>
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
