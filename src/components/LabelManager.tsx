import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { ResourceLabels } from '../types';
import './PeriodManager.css'; // Re-use PeriodManager overlay/box styles

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: (labels: ResourceLabels) => void;
  initialLabels: ResourceLabels;
}

export function LabelManager({ backendUrl, onClose, onUpdate, initialLabels }: Props) {
  const { t } = useTranslation();
  const [labels, setLabels] = useState<ResourceLabels>(initialLabels);

  const handleChange = (field: keyof ResourceLabels, value: string) => {
    setLabels({ ...labels, [field]: value });
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`${backendUrl}/labels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ labels })
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate(data);
        onClose();
      } else {
        alert('Failed to save labels');
      }
    } catch (err) {
      console.error('Failed to save labels:', err);
    }
  };

  return (
    <div className="period-manager-overlay">
      <div className="period-manager-box" style={{ maxWidth: '500px' }}>
        <div className="period-manager-header">
          <h2>{t('Manage Labels')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="period-list">
          <div className="period-field" style={{ marginBottom: '15px' }}>
            <label>Room</label>
            <input 
              type="text" 
              value={labels.room} 
              onInput={(e) => handleChange('room', e.currentTarget.value)}
            />
          </div>
          <div className="period-field" style={{ marginBottom: '15px' }}>
            <label>Teacher</label>
            <input 
              type="text" 
              value={labels.teacher} 
              onInput={(e) => handleChange('teacher', e.currentTarget.value)}
            />
          </div>
          <div className="period-field" style={{ marginBottom: '15px' }}>
            <label>Course</label>
            <input 
              type="text" 
              value={labels.course} 
              onInput={(e) => handleChange('course', e.currentTarget.value)}
            />
          </div>
          <div className="period-field" style={{ marginBottom: '15px' }}>
            <label>Event</label>
            <input 
              type="text" 
              value={labels.event} 
              onInput={(e) => handleChange('event', e.currentTarget.value)}
            />
          </div>
          <div className="period-field" style={{ marginBottom: '15px' }}>
            <label>Main Teacher</label>
            <input 
              type="text" 
              value={labels.mainTeacher} 
              onInput={(e) => handleChange('mainTeacher', e.currentTarget.value)}
            />
          </div>
          <div className="period-field" style={{ marginBottom: '15px' }}>
            <label>Sub Teacher</label>
            <input 
              type="text" 
              value={labels.subTeacher} 
              onInput={(e) => handleChange('subTeacher', e.currentTarget.value)}
            />
          </div>
          <div className="period-field" style={{ marginBottom: '15px' }}>
            <label>Main Room</label>
            <input 
              type="text" 
              value={labels.mainRoom} 
              onInput={(e) => handleChange('mainRoom', e.currentTarget.value)}
            />
          </div>
          <div className="period-field" style={{ marginBottom: '15px' }}>
            <label>Delivery Method</label>
            <input 
              type="text" 
              value={labels.deliveryMethod} 
              onInput={(e) => handleChange('deliveryMethod', e.currentTarget.value)}
            />
          </div>
        </div>

        <div className="period-manager-footer">
          <div className="footer-actions">
            <button className="cancel-button" onClick={onClose}>{t('Back to Timetable')}</button>
            <button className="save-button" onClick={handleSave}>{t('Save Changes')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
