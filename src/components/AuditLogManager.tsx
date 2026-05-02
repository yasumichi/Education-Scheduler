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
  const [filters, setFilters] = useState({
    date: '',
    user: '',
    table: '',
    action: ''
  });

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (filters.date) query.append('date', filters.date);
      if (filters.user) query.append('user', filters.user);
      if (filters.table) query.append('table', filters.table);
      if (filters.action) query.append('action', filters.action);

      const res = await fetch(`${backendUrl}/audit-logs?${query.toString()}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleSearch = (e: Event) => {
    e.preventDefault();
    fetchLogs();
  };

  const handleReset = () => {
    setFilters({ date: '', user: '', table: '', action: '' });
    // We'll need to fetch again after state update, but useEffect doesn't watch filters
    // to avoid too many requests. So we call it manually after a short delay or use another state.
  };

  useEffect(() => {
    if (filters.date === '' && filters.user === '' && filters.table === '' && filters.action === '') {
      fetchLogs();
    }
  }, [filters]);

  return (
    <div className="modal-overlay">
      <div className="modal-box audit-log-manager">
        <div className="modal-header">
          <h2>{t('Audit Logs')}</h2>
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
        </div>
        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>{t('Close')}</button>
        </div>
      </div>
    </div>
  );
}
