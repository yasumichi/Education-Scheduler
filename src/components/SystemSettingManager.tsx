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
  const [yearViewStartMonth, setYearViewStartMonth] = useState(4);
  const [yearViewStartDay, setYearViewStartDay] = useState(1);
  const [weekendDays, setWeekendDays] = useState("0,6");
  const [holidayTheme, setHolidayTheme] = useState("default");

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${backendUrl}/settings`);
        if (res.ok) {
          const data = await res.json();
          setAllowPublicSignup(data.allowPublicSignup);
          setYearViewStartMonth(data.yearViewStartMonth || 4);
          setYearViewStartDay(data.yearViewStartDay || 1);
          setWeekendDays(data.weekendDays || "0,6");
          setHolidayTheme(data.holidayTheme || "default");
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      }
    };
    fetchSettings();
  }, []);

  const toggleWeekendDay = (day: number) => {
    const days = weekendDays ? weekendDays.split(',').map(Number) : [];
    if (days.includes(day)) {
      setWeekendDays(days.filter(d => d !== day).sort().join(','));
    } else {
      setWeekendDays([...days, day].sort().join(','));
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`${backendUrl}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          allowPublicSignup,
          yearViewStartMonth,
          yearViewStartDay,
          weekendDays,
          holidayTheme
        })
      });
      if (res.ok) {
        alert(t('Settings saved successfully'));
        onClose();
        // ページをリロードするか、親コンポーネントの状態を更新して変更を反映させる
        window.location.reload(); 
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

          <div className="setting-item">
            <label className="field-label">{t('Year View Start Date')}</label>
            <div className="form-row">
              <div className="form-group">
                <label>{t('Month')}</label>
                <select 
                  value={yearViewStartMonth} 
                  onChange={(e) => setYearViewStartMonth(parseInt(e.currentTarget.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t('Day')}</label>
                <select 
                  value={yearViewStartDay} 
                  onChange={(e) => setYearViewStartDay(parseInt(e.currentTarget.value))}
                >
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="setting-description">
              {t('Used as the start date for the "1 year" view.')}
            </p>
          </div>

          <div className="setting-item">
            <label className="field-label">{t('Weekend Days')}</label>
            <div className="weekend-selector">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                <label key={i} className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={weekendDays.split(',').includes(i.toString())}
                    onChange={() => toggleWeekendDay(i)}
                  />
                  {t(day)}
                </label>
              ))}
            </div>
            <p className="setting-description">
              {t('Selected days will be styled as weekends in the calendar.')}
            </p>
          </div>

          <div className="setting-item">
            <label className="field-label">{t('Holiday Theme')}</label>
            <select 
              value={holidayTheme}
              onChange={(e) => setHolidayTheme(e.currentTarget.value)}
              className="theme-select"
            >
              <option value="default">{t('Default')}</option>
              <option value="vivid">{t('Vivid')}</option>
            </select>
            <p className="setting-description">
              {t('Choose the base theme for holidays and weekends.')}
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
