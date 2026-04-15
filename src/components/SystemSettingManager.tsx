import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { ColorTheme } from '../types';
import './SystemSettingManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  themes: ColorTheme[];
}

export function SystemSettingManager({ backendUrl, onClose, themes }: Props) {
  const { t } = useTranslation();
  const [allowPublicSignup, setAllowPublicSignup] = useState(true);
  const [yearViewStartMonth, setYearViewStartMonth] = useState(4);
  const [yearViewStartDay, setYearViewStartDay] = useState(1);
  // Default format: day:themeId:isWeekend
  const [weekendDays, setWeekendDays] = useState("0:default:true,1:default:false,2:default:false,3:default:false,4:default:false,5:default:false,6:vivid:true");

  const holidayThemes = themes.filter(t => t.category === 'HOLIDAY');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${backendUrl}/settings`);
        if (res.ok) {
          const data = await res.json();
          setAllowPublicSignup(data.allowPublicSignup);
          setYearViewStartMonth(data.yearViewStartMonth || 4);
          setYearViewStartDay(data.yearViewStartDay || 1);
          setWeekendDays(data.weekendDays || "0:default:true,1:default:false,2:default:false,3:default:false,4:default:false,5:default:false,6:vivid:true");
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      }
    };
    fetchSettings();
  }, []);

  const getDayInfo = (day: number) => {
    const parts = weekendDays.split(',').filter(p => p !== '');
    const part = parts.find(p => p.startsWith(`${day}:`));
    if (part) {
      const bits = part.split(':');
      if (bits.length >= 3) {
        return { themeId: bits[1], isWeekend: bits[2] === 'true' };
      }
      if (bits.length === 2) {
        // Migration from day:themeId
        return { themeId: bits[1], isWeekend: true };
      }
    }
    
    // Fallback for old comma-separated indices format
    const simpleIndices = weekendDays.split(',').filter(p => !p.includes(':'));
    if (simpleIndices.includes(day.toString())) {
      return { themeId: 'default', isWeekend: true };
    }

    return { themeId: 'default', isWeekend: false };
  };

  const updateDayInfo = (day: number, themeId: string, isWeekend: boolean) => {
    const newParts = [];
    for (let i = 0; i < 7; i++) {
      if (i === day) {
        newParts.push(`${i}:${themeId}:${isWeekend}`);
      } else {
        const info = getDayInfo(i);
        newParts.push(`${i}:${info.themeId}:${info.isWeekend}`);
      }
    }
    setWeekendDays(newParts.join(','));
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
          holidayTheme: 'default'
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

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
              {t('Used as the start date for the year-based views (3 months, 6 months, 1 year).')}
            </p>
          </div>

          <div className="setting-item">
            <label className="field-label">{t('Weekend Days')}</label>
            <div className="weekend-selector-vertical">
              {daysOfWeek.map((day, i) => {
                const { themeId, isWeekend } = getDayInfo(i);
                return (
                  <div key={i} className="weekend-day-row">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={isWeekend}
                        onChange={() => updateDayInfo(i, themeId, !isWeekend)}
                      />
                      {t(day)}
                    </label>
                    <select 
                      value={themeId || 'default'}
                      onChange={(e) => updateDayInfo(i, e.currentTarget.value, isWeekend)}
                      className="theme-select-mini"
                    >
                      {holidayThemes.map(theme => (
                        <option key={theme.id} value={theme.key || theme.id}>{t(theme.name)}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <p className="setting-description">
              {t('Selected days will be styled as weekends in the calendar.')}
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
