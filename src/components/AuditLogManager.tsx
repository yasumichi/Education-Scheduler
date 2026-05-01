import { AuditLog } from '../types';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import './AuditLogManager.css';

interface Props {
  logs: AuditLog[];
  onClose: () => void;
}

export function AuditLogManager({ logs, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <div className="modal-overlay">
      <div className="modal-box audit-log-manager">
        <div className="modal-header">
          <h2>{t('Audit Logs')}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-content">
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
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>
                    {t('No logs found')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>{t('Close')}</button>
        </div>
      </div>
    </div>
  );
}
