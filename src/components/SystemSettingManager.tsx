import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import './SystemSettingManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
}

export function SystemSettingManager({ backendUrl, onClose }: Props) {
  const { t } = useTranslation();
  const [allowPublicSignup, setAllowPublicSignup] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${backendUrl}/settings`);
        if (res.ok) {
          const data = await res.json();
          setAllowPublicSignup(data.allowPublicSignup);
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      const res = await fetch(`${backendUrl}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ allowPublicSignup })
      });
      if (res.ok) {
        alert(t('Settings saved successfully'));
        onClose();
      } else {
        alert(t('Failed to save settings'));
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  };

  return (
    <div className="system-setting-overlay">
      <div className="system-setting-box">
        <div className="system-setting-header">
          <h2>{t('System Settings')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="system-setting-content">
          <div className="setting-item">
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={allowPublicSignup} 
                onChange={(e) => setAllowPublicSignup(e.currentTarget.checked)}
              />
              {t('Allow Public Signup')}
            </label>
            <p className="setting-description">
              {t('If enabled, anyone can create an account from the login page.')}
            </p>
          </div>
        </div>

        <div className="system-setting-footer">
          <button className="cancel-button" onClick={onClose}>{t('Cancel')}</button>
          <button className="save-button" onClick={handleSave}>{t('Save Changes')}</button>
        </div>
      </div>
    </div>
  );
}
