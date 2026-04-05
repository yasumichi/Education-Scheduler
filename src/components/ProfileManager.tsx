import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { User } from '../types';
import './ProfileManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  user: User;
}

export function ProfileManager({ backendUrl, onClose, user }: Props) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

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

  return (
    <div className="profile-manager-overlay">
      <div className="profile-manager-box">
        <div className="profile-manager-header">
          <h2>{t('My Profile')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="profile-manager-content">
          <div className="user-info-section">
            <p><strong>{t('Email')}:</strong> {user.email}</p>
            <p><strong>{t('Role')}:</strong> {user.role}</p>
          </div>

          <div className="password-change-section">
            <h3>{t('Change Password')}</h3>
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
        </div>

        <div className="profile-manager-footer">
          <button className="cancel-button" onClick={onClose}>{t('Cancel')}</button>
          <button className="save-button" onClick={handleChangePassword}>{t('Change Password')}</button>
        </div>
      </div>
    </div>
  );
}
