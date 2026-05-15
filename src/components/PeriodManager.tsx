import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { TimePeriod } from '../types';
import './PeriodManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: (periods: TimePeriod[]) => void;
}

export function PeriodManager({ backendUrl, onClose, onUpdate }: Props) {
  const { t } = useTranslation();
  const [periods, setPeriods] = useState<Partial<TimePeriod>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPeriods();
  }, []);

  const fetchPeriods = async () => {
    try {
      const res = await fetch(`${backendUrl}/periods`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setPeriods(data);
      }
    } catch (err) {
      console.error('Failed to fetch periods:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setPeriods([...periods, { name: '', startTime: '09:00', endTime: '09:50' }]);
  };

  const handleRemove = (index: number) => {
    setPeriods(periods.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: keyof TimePeriod, value: string) => {
    const newPeriods = [...periods];
    newPeriods[index] = { ...newPeriods[index], [field]: value };
    setPeriods(newPeriods);
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`${backendUrl}/periods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ periods })
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate(data);
        onClose();
      } else {
        alert('Failed to save periods');
      }
    } catch (err) {
      console.error('Failed to save periods:', err);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="dialog-overlay">
      <div className="dialog-box">
        <div className="dialog-header">
          <h2>{t('Manage Periods')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="period-list">
          {periods.map((p, index) => (
            <div key={index} className="period-row">
              <div className="period-field">
                <label>{t('Period Name')}</label>
                <input 
                  type="text" 
                  value={p.name} 
                  onInput={(e) => handleChange(index, 'name', e.currentTarget.value)}
                />
              </div>
              <div className="period-field">
                <label>{t('Start Time')}</label>
                <input 
                  type="time" 
                  value={p.startTime} 
                  onInput={(e) => handleChange(index, 'startTime', e.currentTarget.value)}
                />
              </div>
              <div className="period-field">
                <label>{t('End Time')}</label>
                <input 
                  type="time" 
                  value={p.endTime} 
                  onInput={(e) => handleChange(index, 'endTime', e.currentTarget.value)}
                />
              </div>
              <div className="remove-button-placeholder">
                {index === periods.length - 1 && index > 0 && (
                  <button className="remove-button" onClick={() => handleRemove(index)}>
                    {t('Remove')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="dialog-footer">
          <div className="footer-left">
            <button className="add-button" onClick={handleAdd}>{t('Add Period')}</button>
          </div>
          <div className="footer-right">
            <button className="cancel-button" onClick={onClose}>{t('Cancel')}</button>
            <button className="save-button" onClick={handleSave}>{t('Save Changes')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
