import { useState, useEffect } from 'preact/hooks';
import { apiFetch } from '../utils/api';
import { useTranslation } from 'react-i18next';
import { SSOManager } from './SSOManager';
import './SystemSettingManager.css'; // Reuse CSS

interface Props {
  backendUrl: string;
  onClose: () => void;
}

export function SSOConfigDialog({ backendUrl, onClose }: Props) {
  const { t } = useTranslation();
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoForceRedirect, setSsoForceRedirect] = useState(false);
  const [ssoClientId, setSsoClientId] = useState('');
  const [ssoClientSecret, setSsoClientSecret] = useState('');
  const [ssoIssuerUrl, setSsoIssuerUrl] = useState('');
  const [ssoAllowedDomain, setSsoAllowedDomain] = useState('');
  const [ssoAutoProvisioning, setSsoAutoProvisioning] = useState(false);
  const [currentSettings, setCurrentSettings] = useState<any>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await apiFetch(`${backendUrl}/settings`);
        if (res.ok) {
          const data = await res.json();
          setCurrentSettings(data);
          setSsoEnabled(data.ssoEnabled || false);
          setSsoForceRedirect(data.ssoForceRedirect || false);
          setSsoClientId(data.ssoClientId || '');
          setSsoClientSecret(data.ssoClientSecret || '');
          setSsoIssuerUrl(data.ssoIssuerUrl || '');
          setSsoAllowedDomain(data.ssoAllowedDomain || '');
          setSsoAutoProvisioning(data.ssoAutoProvisioning || false);
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      const res = await apiFetch(`${backendUrl}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...currentSettings,
          ssoEnabled,
          ssoForceRedirect,
          ssoClientId,
          ssoClientSecret,
          ssoIssuerUrl,
          ssoAllowedDomain,
          ssoAutoProvisioning
        })
      });
      if (res.ok) {
        alert(t('Settings saved successfully'));
        onClose();
        window.location.reload(); 
      } else {
        alert(t('Failed to save settings'));
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <div className="dialog-header">
          <h2>{t('SSO Configuration')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="dialog-content">
          <SSOManager
            ssoEnabled={ssoEnabled} setSsoEnabled={setSsoEnabled}
            ssoForceRedirect={ssoForceRedirect} setSsoForceRedirect={setSsoForceRedirect}
            ssoClientId={ssoClientId} setSsoClientId={setSsoClientId}
            ssoClientSecret={ssoClientSecret} setSsoClientSecret={setSsoClientSecret}
            ssoIssuerUrl={ssoIssuerUrl} setSsoIssuerUrl={setSsoIssuerUrl}
            ssoAllowedDomain={ssoAllowedDomain} setSsoAllowedDomain={setSsoAllowedDomain}
            ssoAutoProvisioning={ssoAutoProvisioning} setSsoAutoProvisioning={setSsoAutoProvisioning}
          />
        </div>

        <div className="dialog-footer">
          <div className="footer-right">
            <button className="cancel-button" onClick={onClose}>{t('Cancel')}</button>
            <button className="save-button" onClick={handleSave}>{t('Save Changes')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
