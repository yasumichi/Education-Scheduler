import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';

interface Props {
  ssoEnabled: boolean;
  setSsoEnabled: (value: boolean) => void;
  ssoForceRedirect: boolean;
  setSsoForceRedirect: (value: boolean) => void;
  ssoClientId: string;
  setSsoClientId: (value: string) => void;
  ssoClientSecret: string;
  setSsoClientSecret: (value: string) => void;
  ssoIssuerUrl: string;
  setSsoIssuerUrl: (value: string) => void;
  ssoAllowedDomain: string;
  setSsoAllowedDomain: (value: string) => void;
  ssoAutoProvisioning: boolean;
  setSsoAutoProvisioning: (value: boolean) => void;
}

export function SSOManager({
  ssoEnabled, setSsoEnabled,
  ssoForceRedirect, setSsoForceRedirect,
  ssoClientId, setSsoClientId,
  ssoClientSecret, setSsoClientSecret,
  ssoIssuerUrl, setSsoIssuerUrl,
  ssoAllowedDomain, setSsoAllowedDomain,
  ssoAutoProvisioning, setSsoAutoProvisioning,
}: Props) {
  const { t } = useTranslation();
  const [isEditingSecret, setIsEditingSecret] = useState(false);

  return (
    <div className="setting-item">
      <label className="checkbox-label">
        <input type="checkbox" checked={ssoEnabled} onChange={(e) => setSsoEnabled(e.currentTarget.checked)} />
        {t('Enable SSO')}
      </label>
      <label className="checkbox-label">
        <input type="checkbox" checked={ssoForceRedirect} onChange={(e) => setSsoForceRedirect(e.currentTarget.checked)} />
        {t('Force SSO Redirect')}
      </label>
      <div className="form-group">
        <label>{t('Client ID')}</label>
        <input type="text" value={ssoClientId} onChange={(e) => setSsoClientId(e.currentTarget.value)} />
      </div>
      <div className="form-group">
        <label>{t('Client Secret')}</label>
        {isEditingSecret ? (
          <input 
            type="password" 
            value={ssoClientSecret === '********' ? '' : ssoClientSecret} 
            onChange={(e) => setSsoClientSecret(e.currentTarget.value)} 
          />
        ) : (
          <div className="secret-input-wrapper">
            <input type="text" value="********" readOnly onClick={() => setIsEditingSecret(true)} />
            <button type="button" onClick={() => setIsEditingSecret(true)}>{t('Change')}</button>
          </div>
        )}
      </div>
      <div className="form-group">
        <label>{t('Issuer URL')}</label>
        <input type="text" value={ssoIssuerUrl} onChange={(e) => setSsoIssuerUrl(e.currentTarget.value)} />
      </div>
      <div className="form-group">
        <label>{t('Allowed Domain')}</label>
        <input type="text" value={ssoAllowedDomain} onChange={(e) => setSsoAllowedDomain(e.currentTarget.value)} />
      </div>
      <label className="checkbox-label">
        <input type="checkbox" checked={ssoAutoProvisioning} onChange={(e) => setSsoAutoProvisioning(e.currentTarget.checked)} />
        {t('Auto Provisioning')}
      </label>
    </div>
  );
}
