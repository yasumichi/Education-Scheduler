import { useState, useEffect } from 'preact/hooks';
import { AuditLog } from '../types';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import './AuditLogManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
}

export function AuditLogManager({ backendUrl, onClose }: Props) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [filters, setFilters] = useState({
    date: '',
    user: '',
    table: '',
    action: ''
  });

  const fetchLogs = async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (filters.date) query.append('date', filters.date);
      if (filters.user) query.append('user', filters.user);
      if (filters.table) query.append('table', filters.table);
      if (filters.action) query.append('action', filters.action);
      query.append('page', pageNum.toString());
      query.append('limit', '50'); // Reduced default limit for pagination

      const res = await fetch(`${backendUrl}/audit-logs?${query.toString()}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalPages(data.totalPages);
        setTotalLogs(data.total);
        setPage(data.page);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, []);

  const handleSearch = (e: Event) => {
    e.preventDefault();
    fetchLogs(1);
  };

  const handleReset = () => {
    setFilters({ date: '', user: '', table: '', action: '' });
  };

  useEffect(() => {
    if (filters.date === '' && filters.user === '' && filters.table === '' && filters.action === '') {
      fetchLogs(1);
    }
  }, [filters]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchLogs(newPage);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box audit-log-manager">
        <div className="modal-header">
          <h2>{t('Audit Logs')} ({totalLogs})</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-content">
          <form className="audit-log-filters" onSubmit={handleSearch}>
            <div className="filter-group">
              <label>{t('Date')}</label>
              <input 
                type="date" 
                value={filters.date} 
                onChange={(e) => setFilters({ ...filters, date: e.currentTarget.value })}
              />
            </div>
            <div className="filter-group">
              <label>{t('User')}</label>
              <input 
                type="text" 
                placeholder={t('Email')}
                value={filters.user} 
                onInput={(e) => setFilters({ ...filters, user: e.currentTarget.value })}
              />
            </div>
            <div className="filter-group">
              <label>{t('Table')}</label>
              <input 
                type="text" 
                placeholder={t('Table Name')}
                value={filters.table} 
                onInput={(e) => setFilters({ ...filters, table: e.currentTarget.value })}
              />
            </div>
            <div className="filter-group">
              <label>{t('Action')}</label>
              <select 
                value={filters.action} 
                onChange={(e) => setFilters({ ...filters, action: e.currentTarget.value })}
              >
                <option value="">{t('All')}</option>
                <option value="CREATE">CREATE</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
                <option value="LOGIN">LOGIN</option>
              </select>
            </div>
            <div className="filter-actions">
              <button type="submit" className="search-btn" disabled={loading}>
                {loading ? t('Searching...') : t('Search')}
              </button>
              <button type="button" className="reset-btn" onClick={handleReset}>
                {t('Reset')}
              </button>
            </div>
          </form>

          <div className="audit-log-table-container">
            <table className="audit-log-table">
              <thead>
                <tr>
                  <th>{t('Timestamp')}</th>
                  <th>{t('User')}</th>
                  <th>{t('Table')}</th>
                  <th>{t('Action')}</th>
                  <th>{t('Data')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className="nowrap">{format(parseISO(log.createdAt), 'yyyy/MM/dd HH:mm:ss')}</td>
                    <td>{log.userEmail || '-'}</td>
                    <td>{log.tableName}</td>
                    <td>{log.action}</td>
                    <td className="log-data">
                      <pre>{log.data}</pre>
                    </td>
                  </tr>
                ))}
                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>
                      {t('No logs found')}
                    </td>
                  </tr>
                )}
                {loading && (
                   <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>
                      {t('Loading...')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="audit-log-pagination">
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
        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>{t('Close')}</button>
        </div>
      </div>
    </div>
  );
}
