import { useState, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Lesson, TimePeriod, ResourceLabels, Resource } from '../types';
import { parseISO, differenceInDays } from 'date-fns';
import { exportAllTeacherStatisticsToExcel } from '../utils/excelExport';
import './AllTeacherStatistics.css';

interface Props {
  teachers: Resource[];
  lessons: Lesson[];
  periods: TimePeriod[];
  labels: ResourceLabels;
  onClose: () => void;
  initialStartDate: string;
  initialEndDate: string;
}

interface AllTeacherStatRow {
  teacherId: string;
  teacherName: string;
  mainHours: number;
  subHours: number;
  totalHours: number;
}

export function AllTeacherStatistics({ 
  teachers, lessons, periods, labels, onClose, 
  initialStartDate, initialEndDate 
}: Props) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);

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
    const teacherStats: Record<string, { main: number, sub: number }> = {};
    
    // Initialize stats for all teachers
    teachers.forEach(t => {
      teacherStats[t.id] = { main: 0, sub: 0 };
    });

    // Filter lessons by date range
    const filteredLessons = lessons.filter(l => {
      const lessonStart = parseISO(l.startDate);
      const lessonEnd = parseISO(l.endDate);
      
      if (startDate && lessonEnd < parseISO(startDate)) return false;
      if (endDate && lessonStart > parseISO(endDate)) return false;

      return true;
    });

    filteredLessons.forEach(l => {
      const hours = calculatePeriods(l);
      
      // Main Teacher
      if (l.teacherId && teacherStats[l.teacherId]) {
        teacherStats[l.teacherId].main += hours;
      }

      // Sub Teachers
      const subIds = [...(l.subTeacherIds || []), ...(l.subTeachers || []).map(st => st.id)];
      subIds.forEach(sid => {
        if (teacherStats[sid]) {
          teacherStats[sid].sub += hours;
        }
      });
    });

    const rows: AllTeacherStatRow[] = teachers
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
      .map(teacher => ({
        teacherId: teacher.id,
        teacherName: teacher.name,
        mainHours: teacherStats[teacher.id].main,
        subHours: teacherStats[teacher.id].sub,
        totalHours: teacherStats[teacher.id].main + teacherStats[teacher.id].sub
      }));

    const grandTotalMain = rows.reduce((sum, r) => sum + r.mainHours, 0);
    const grandTotalSub = rows.reduce((sum, r) => sum + r.subHours, 0);

    return { rows, grandTotalMain, grandTotalSub };
  }, [teachers, lessons, periods, startDate, endDate]);

  const handleExport = () => {
    exportAllTeacherStatisticsToExcel({
      stats: stats.rows,
      grandTotalMain: stats.grandTotalMain,
      grandTotalSub: stats.grandTotalSub,
      labels,
      t,
      dateRange: `${startDate} ~ ${endDate}`
    });
  };

  return (
    <div className="teacher-statistics-overlay">
      <div className="teacher-statistics-box all-teachers">
        <div className="dialog-header">
          <h2>{t('{{resource}} Statistics', { resource: labels.teacher })}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="stats-controls">
          <div className="date-inputs">
            <input type="date" value={startDate} onInput={(e) => setStartDate(e.currentTarget.value)} />
            <span>~</span>
            <input type="date" value={endDate} onInput={(e) => setEndDate(e.currentTarget.value)} />
          </div>
          <button className="export-button" onClick={handleExport}>{t('Export to Excel')}</button>
        </div>

        <div className="stats-table-container">
          <table className="stat-table">
            <thead>
              <tr>
                <th>{labels.teacher}</th>
                <th>{labels.mainTeacher}</th>
                <th>{labels.subTeacher}</th>
                <th>{t('Subtotal')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.map((row) => (
                <tr key={row.teacherId}>
                  <td className="col-teacher">{row.teacherName}</td>
                  <td className="col-hours">{row.mainHours}</td>
                  <td className="col-hours">{row.subHours}</td>
                  <td className="col-hours subtotal">{row.totalHours}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="grand-total">
                <td>{t('Grand Total')}</td>
                <td className="col-hours">{stats.grandTotalMain}</td>
                <td className="col-hours">{stats.grandTotalSub}</td>
                <td className="col-hours">{stats.grandTotalMain + stats.grandTotalSub}</td>
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
