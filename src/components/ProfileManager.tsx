import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { User } from '../types';
import './ProfileManager.css';

export type ProfileMode = 'profile' | 'password' | 'export';

interface Props {
  backendUrl: string;
  onClose: () => void;
  user: User;
  mode: ProfileMode;
}

export function ProfileManager({ backendUrl, onClose, user, mode }: Props) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const today = new Date().toISOString().split('T')[0];
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthStr = nextMonth.toISOString().split('T')[0];

  const [exportDates, setExportDates] = useState({
    start: today,
    end: nextMonthStr
  });

  const handleExportICal = () => {
    if (!user.resourceId) return;
    const url = `${backendUrl}/resources/${user.resourceId}/icalendar?start=${exportDates.start}&end=${exportDates.end}`;
    window.open(url, '_blank');
  };

  const handleChangePassword = async () => {
    if (!formData.currentPassword || !formData.newPassword) {
      alert(t('Please fill in all required fields'));
      return;
    }
    if (formData.newPassword !== formData.confirmPassword) {
      alert(t('Passwords do not match'));
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword
        })
      });
      if (res.ok) {
        alert(t('Password changed successfully'));
        onClose();
      } else {
        const errData = await res.json();
        alert(errData.error || t('Failed to change password'));
      }
    } catch (err) {
      console.error('Error changing password:', err);
    }
  };

  const getTitle = () => {
    if (mode === 'password') return t('Change Password');
    if (mode === 'export') return t('Export Schedule (iCalendar)');
    return t('My Profile');
  };

  return (
    <div className="profile-manager-overlay">
      <div className="profile-manager-box">
        <div className="profile-manager-header">
          <h2>{getTitle()}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="profile-manager-content">
         {mode === 'profile' && (
           <div className="user-info-section">
             <p><strong>{t('Email')}:</strong> {user.email}</p>
             <p><strong>{t('Role')}:</strong> {user.role}</p>
           </div>
         )}

         {mode === 'password' && (
           <div className="password-change-section">
             <div className="form-group">
               <label>{t('Current Password')}</label>
               <input
                 type="password"
                 value={formData.currentPassword}
                 onInput={(e) => setFormData({ ...formData, currentPassword: e.currentTarget.value })}
               />
             </div>
             <div className="form-group">
               <label>{t('New Password')}</label>
               <input
                 type="password"
                 value={formData.newPassword}
                 onInput={(e) => setFormData({ ...formData, newPassword: e.currentTarget.value })}
               />
             </div>
             <div className="form-group">
               <label>{t('Confirm New Password')}</label>
               <input
                 type="password"
                 value={formData.confirmPassword}
                 onInput={(e) => setFormData({ ...formData, confirmPassword: e.currentTarget.value })}
               />
             </div>
          </div>
          )}
          {mode === 'export' && user.resourceId && (
            <div className="ical-export-section">
              <p className="section-desc">{t('Select period to export')}</p>
              <div className="form-row">
                <div className="form-group">
                  <label>{t('Start Date')}</label>
                  <input 
                    type="date" 
                    value={exportDates.start} 
                    onInput={(e) => setExportDates({ ...exportDates, start: e.currentTarget.value })}
                  />
                </div>
                <div className="form-group">
                  <label>{t('End Date')}</label>
                  <input 
                    type="date" 
                    value={exportDates.end} 
                    onInput={(e) => setExportDates({ ...exportDates, end: e.currentTarget.value })}
                  />
                </div>
              </div>
              <button className="ical-download-button" onClick={handleExportICal}>
                📅 {t('Download')} (.ics)
              </button>
            </div>
          )}
        </div>

        <div className="profile-manager-footer">
          <button className="cancel-button" onClick={onClose}>{t('Cancel')}</button>
        </div>
        {mode === 'password' && (
        <button className="save-button" onClick={handleChangePassword}>{t('Change Password')}</button>
        )}
      </div>
    </div>
  );
}
