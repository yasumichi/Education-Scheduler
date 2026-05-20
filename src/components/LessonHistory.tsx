import { useState, useEffect, useCallback } from 'preact/hooks';
import { AuditLog, Resource, ResourceLabels, TimePeriod, Subject, Lesson } from '../types';
import { useTranslation } from 'react-i18next';
import { format, parseISO, subDays } from 'date-fns';
import './LessonHistory.css';

interface Props {
  backendUrl: string;
  courses: Resource[];
  resources: Resource[];
  periods: TimePeriod[];
  subjects: Subject[];
  labels: ResourceLabels;
}

export function LessonHistory({ backendUrl, courses, resources, periods, subjects, labels }: Props) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  
  const today = format(new Date(), 'yyyy-MM-dd');
  const lastWeek = format(subDays(new Date(), 7), 'yyyy-MM-dd');

  const [filters, setFilters] = useState({
    start: lastWeek,
    end: today,
    courseId: '',
    keyword: ''
  });

  const fetchLogs = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (filters.start) query.append('start', filters.start);
      if (filters.end) query.append('end', filters.end);
      if (filters.courseId) query.append('courseId', filters.courseId);
      if (filters.keyword) query.append('keyword', filters.keyword);
      query.append('page', pageNum.toString());
      query.append('limit', '50');

      const res = await fetch(`${backendUrl}/lessons/history?${query.toString()}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalPages(data.totalPages);
        setTotalLogs(data.total);
        setPage(data.page);
      }
    } catch (err) {
      console.error('Failed to fetch lesson history:', err);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, filters]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const handleSearch = (e: Event) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const handleReset = () => {
    setFilters({ start: lastWeek, end: today, courseId: '', keyword: '' });
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchLogs(newPage);
    }
  };

  const getResourceName = (id: string | null | undefined) => {
    if (!id) return '-';
    const r = resources.find(res => res.id === id);
    return r ? r.name : id;
  };

  const getPeriodName = (id: string | null | undefined) => {
    if (!id) return '-';
    const p = periods.find(period => period.id === id);
    return p ? p.name : id;
  };

  const getSubjectName = (id: string | null | undefined, fallbackName?: string | null) => {
    if (id) {
      const s = subjects.find(sub => sub.id === id);
      if (s) return s.name;
    }
    return fallbackName || '-';
  };

  const getSubTeacherNames = (subTeachers: any[] | null | undefined) => {
    if (!subTeachers || subTeachers.length === 0) return '-';
    return subTeachers.map((st: any) => {
      if (typeof st === 'string') return getResourceName(st);
      return st.name || getResourceName(st.id);
    }).join(', ');
  };

  const renderValue = (oldVal: any, newVal: any, isUpdate: boolean, formatter: (v: any) => string = (v) => String(v || '-')) => {
    const oldDisplay = formatter(oldVal);
    const newDisplay = formatter(newVal);
    
    if (isUpdate && oldDisplay !== newDisplay) {
      return (
        <div className="diff-value">
          <span className="old-val">{oldDisplay}</span>
          <span className="arrow">→</span>
          <span className="new-val">{newDisplay}</span>
        </div>
      );
    }
    return <span>{newDisplay}</span>;
  };

  const getOtherChanges = (oldL: any, newL: any, isUpdate: boolean) => {
    const changes: string[] = [];
    
    const checkField = (field: string, label: string) => {
      const o = oldL?.[field];
      const n = newL?.[field];
      if (isUpdate) {
        if (o !== n) changes.push(`${label}: ${o || '-'} → ${n || '-'}`);
      } else {
        if (n) changes.push(`${label}: ${n}`);
      }
    };

    checkField('location', t('Location'));
    checkField('remarks', t('Remarks'));
    checkField('externalTeacher', t('External {{resource}} (if not managed)', { resource: labels.teacher }));
    checkField('externalSubTeachers', t('External {{resource}} (comma separated)', { resource: labels.subTeacher }));

    // Delivery methods comparison
    const getDMString = (dms: any[] | null | undefined) => {
      if (!dms || dms.length === 0) return '-';
      return dms.map((d: any) => d.name || d.id).join(', ');
    };

    const oldDM = getDMString(oldL?.deliveryMethods);
    const newDM = getDMString(newL?.deliveryMethods);
    if (isUpdate) {
      if (oldDM !== newDM) changes.push(`${labels.deliveryMethod}: ${oldDM} → ${newDM}`);
    } else {
      if (newDM !== '-') changes.push(`${labels.deliveryMethod}: ${newDM}`);
    }

    return changes.length > 0 ? changes.map((c, i) => <div key={i}>{c}</div>) : '-';
  };

  return (
    <div className="lesson-history">
      <div className="history-header">
        <h2>{t('History')} ({totalLogs})</h2>
      </div>
      
      <form className="history-filters" onSubmit={handleSearch}>
        <div className="filter-group">
          <label>{t('Start Date')}</label>
          <input 
            type="date" 
            value={filters.start} 
            onChange={(e) => setFilters({ ...filters, start: e.currentTarget.value })}
          />
        </div>
        <div className="filter-group">
          <label>{t('End Date')}</label>
          <input 
            type="date" 
            value={filters.end} 
            onChange={(e) => setFilters({ ...filters, end: e.currentTarget.value })}
          />
        </div>
        <div className="filter-group">
          <label>{labels.course}</label>
          <select 
            value={filters.courseId} 
            onChange={(e) => setFilters({ ...filters, courseId: e.currentTarget.value })}
          >
            <option value="">{t('All')}</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>{t('Keyword')}</label>
          <input 
            type="text" 
            placeholder={t('Search keyword...')}
            value={filters.keyword} 
            onInput={(e) => setFilters({ ...filters, keyword: e.currentTarget.value })}
          />
        </div>
        <div className="history-filter-actions">
          <button type="submit" className="search-btn" disabled={loading}>
            {loading ? t('Searching...') : t('Search')}
          </button>
          <button type="button" className="reset-btn" onClick={handleReset}>
            {t('Reset')}
          </button>
        </div>
      </form>

      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th>{t('Timestamp')}</th>
              <th>{t('Action')}</th>
              <th>{labels.course}</th>
              <th>{t('Start Date')}</th>
              <th>{t('Start Period')}</th>
              <th>{t('End Date')}</th>
              <th>{t('End Period')}</th>
              <th>{labels.subject}</th>
              <th>{labels.room}</th>
              <th>{labels.mainTeacher}</th>
              <th>{labels.subTeacher}</th>
              <th>{t('Other changes')}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => {
              let data: any = {};
              try {
                data = JSON.parse(log.data);
              } catch (e) {
                console.error('Failed to parse log data:', log.data);
              }

              // 新形式（old/newラップあり）かどうかの判定
              const hasComparison = !!(data.old || data.new);
              // 修正（UPDATE）かつ比較データがある場合のみ、diff表示（矢印）を行う
              const isUpdate = log.action === 'UPDATE_LESSON' && hasComparison;
              
              let actualOld = data.old;
              let actualNew = data.new;

              if (!hasComparison) {
                // レガシー形式またはラップなしデータ
                if (log.action === 'DELETE_LESSON') {
                  actualOld = data;
                  actualNew = null;
                } else {
                  // CREATE またはラップなしの UPDATE は、現在のデータを new とみなす
                  actualOld = null;
                  actualNew = data;
                }
              }

              const actionLabel = t(log.action.replace('_LESSON', ''));

              return (
                <tr key={log.id}>
                  <td className="nowrap">{format(parseISO(log.createdAt), 'yyyy/MM/dd HH:mm:ss')}</td>
                  <td className="nowrap">{actionLabel}</td>
                  <td>{renderValue(actualOld?.courseId, actualNew?.courseId, isUpdate, getResourceName)}</td>
                  <td className="nowrap">{renderValue(actualOld?.startDate, actualNew?.startDate, isUpdate)}</td>
                  <td>{renderValue(actualOld?.startPeriodId, actualNew?.startPeriodId, isUpdate, getPeriodName)}</td>
                  <td className="nowrap">{renderValue(actualOld?.endDate, actualNew?.endDate, isUpdate)}</td>
                  <td>{renderValue(actualOld?.endPeriodId, actualNew?.endPeriodId, isUpdate, getPeriodName)}</td>
                  <td>{renderValue(actualOld?.subjectId, actualNew?.subjectId, isUpdate, (id) => getSubjectName(id, isUpdate ? actualNew?.subject : (actualNew?.subject || actualOld?.subject)))}</td>
                  <td>{renderValue(actualOld?.roomId, actualNew?.roomId, isUpdate, getResourceName)}</td>
                  <td>{renderValue(actualOld?.teacherId, actualNew?.teacherId, isUpdate, getResourceName)}</td>
                  <td>{renderValue(actualOld?.subTeachers, actualNew?.subTeachers, isUpdate, getSubTeacherNames)}</td>
                  <td className="other-changes-cell">{getOtherChanges(actualOld, actualNew, isUpdate)}</td>
                </tr>
              );
            })}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '40px' }}>
                  {t('No logs found')}
                </td>
              </tr>
            )}
            {loading && (
               <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '40px' }}>
                  {t('Loading...')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="history-pagination">
          <button 
            className="pagination-btn" 
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1 || loading}
          >
            &laquo; {t('Prev')}
          </button>
          <span className="pagination-info">
            {t('Page {{current}} of {{total}}', { current: page, total: totalPages })}
          </span>
          <button 
            className="pagination-btn" 
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages || loading}
          >
            {t('Next')} &raquo;
          </button>
        </div>
      )}
    </div>
  );
}
