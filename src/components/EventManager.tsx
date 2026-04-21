import { useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { ScheduleEvent, TimePeriod, Resource, ResourceLabels, ColorTheme } from '../types';
import './EventManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  periods: TimePeriod[];
  resources: Resource[];
  labels: ResourceLabels;
  initialEvent?: Partial<ScheduleEvent>; // 編集時は既存、新規時は日付・時限のみ
  themes: ColorTheme[];
}

export function EventManager({ backendUrl, onClose, onUpdate, periods, resources, labels, initialEvent, themes }: Props) {
  const { t } = useTranslation();
  const eventThemes = themes.filter(t => t.category === 'EVENT');

  const [formData, setFormData] = useState<{
    id?: string;
    name: string;
    startDate: string;
    startPeriodId: string;
    endDate: string;
    endPeriodId: string;
    color: string;
    location: string;
    remarks: string;
    showInEventRow: boolean;
    resourceIds: string[];
  }>({
    id: initialEvent?.id,
    name: initialEvent?.name || '',
    startDate: initialEvent?.startDate || '',
    startPeriodId: initialEvent?.startPeriodId || periods[0]?.id || 'p1',
    endDate: initialEvent?.endDate || initialEvent?.startDate || '',
    endPeriodId: initialEvent?.endPeriodId || initialEvent?.startPeriodId || periods[periods.length - 1]?.id || 'p8',
    color: initialEvent?.color || eventThemes[0]?.background || '#3b82f6',
    location: initialEvent?.location || '',
    remarks: initialEvent?.remarks || '',
    showInEventRow: initialEvent?.showInEventRow ?? true,
    resourceIds: initialEvent?.resourceIds || (initialEvent?.resources || []).map(r => r.id)
  });

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert(t('Event name is required'));
      return;
    }
    try {
      const res = await fetch(`${backendUrl}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to save event'));
      }
    } catch (err) {
      console.error('Error saving event:', err);
    }
  };

  const handleDelete = async () => {
    if (!formData.id) return;
    if (!confirm(t('Are you sure you want to delete this event?'))) return;

    try {
      const res = await fetch(`${backendUrl}/events/${formData.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to delete event'));
      }
    } catch (err) {
      console.error('Error deleting event:', err);
    }
  };

  const handleResourceToggle = (id: string) => {
    const newIds = formData.resourceIds.includes(id)
      ? formData.resourceIds.filter(rid => rid !== id)
      : [...formData.resourceIds, id];
    setFormData({ ...formData, resourceIds: newIds });
  };

  const teacherResources = resources.filter(r => r.type === 'teacher');
  const roomResources = resources.filter(r => r.type === 'room');

  return (
    <div className="event-manager-overlay">
      <div className="event-manager-box">
        <div className="dialog-header">
          <h2>{formData.id ? t('Edit Event') : t('Create Event')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="event-manager-content">
          <div className="form-group">
            <label>{t('Event Name')} *</label>
            <input 
              type="text" 
              value={formData.name} 
              onInput={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
              placeholder={t('e.g. School Trip')}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('Start Date')}</label>
              <input 
                type="date" 
                value={formData.startDate} 
                onInput={(e) => setFormData({ ...formData, startDate: e.currentTarget.value })}
              />
            </div>
            <div className="form-group">
              <label>{t('Start Period')}</label>
              <select 
                value={formData.startPeriodId} 
                onChange={(e) => setFormData({ ...formData, startPeriodId: e.currentTarget.value })}
              >
                {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('End Date')}</label>
              <input 
                type="date" 
                value={formData.endDate} 
                onInput={(e) => setFormData({ ...formData, endDate: e.currentTarget.value })}
              />
            </div>
            <div className="form-group">
              <label>{t('End Period')}</label>
              <select 
                value={formData.endPeriodId} 
                onChange={(e) => setFormData({ ...formData, endPeriodId: e.currentTarget.value })}
              >
                {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('Location')}</label>
              <input 
                type="text" 
                value={formData.location} 
                onInput={(e) => setFormData({ ...formData, location: e.currentTarget.value })}
                placeholder={t('e.g. Gym, Library')}
              />
            </div>
            <div className="form-group">
              <label>{t('Color')}</label>
              <div className="theme-preview-list">
                {eventThemes.map(theme => (
                  <div 
                    key={theme.id}
                    className={`theme-preview-item ${formData.color === theme.background ? 'selected' : ''}`}
                    style={{ backgroundColor: theme.background, color: theme.foreground }}
                    onClick={() => setFormData({ ...formData, color: theme.background })}
                    title={t(theme.name)}
                  >
                    Aa
                  </div>
                ))}
                <input 
                  type="color" 
                  value={formData.color} 
                  onInput={(e) => setFormData({ ...formData, color: e.currentTarget.value })}
                  className="custom-color-picker"
                  title={t('Custom Color')}
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>{t('Remarks')}</label>
            <textarea 
              value={formData.remarks} 
              onInput={(e) => setFormData({ ...formData, remarks: e.currentTarget.value })}
              placeholder={t('Any additional information...')}
              rows={3}
            />
          </div>

          <div className="form-group checkbox-group">
            <label>
              <input 
                type="checkbox" 
                checked={formData.showInEventRow}
                onChange={(e) => setFormData({ ...formData, showInEventRow: e.currentTarget.checked })}
              />
              {t('Show in Global Event Row')}
            </label>
          </div>


          <div className="form-group">
            <label>{t('Target Resources (Optional)')}</label>
            
            {teacherResources.length > 0 && (
              <div className="resource-section">
                <div className="resource-section-title">{labels.teacher || t('Teacher')}</div>
                <div className="resource-selector-list">
                  {(() => {
                    const selected = teacherResources.filter(r => formData.resourceIds.includes(r.id));
                    const unselected = teacherResources.filter(r => !formData.resourceIds.includes(r.id));
                    return [...selected, ...unselected].map(r => (
                      <label key={r.id} className={`resource-item ${formData.resourceIds.includes(r.id) ? 'selected' : ''}`}>
                        <input 
                          type="checkbox" 
                          checked={formData.resourceIds.includes(r.id)}
                          onChange={() => handleResourceToggle(r.id)}
                        />
                        {r.name}
                      </label>
                    ));
                  })()}
                </div>
              </div>
            )}

            {roomResources.length > 0 && (
              <div className="resource-section">
                <div className="resource-section-title">{labels.room || t('Room')}</div>
                <div className="resource-selector-list">
                  {(() => {
                    const selected = roomResources.filter(r => formData.resourceIds.includes(r.id));
                    const unselected = roomResources.filter(r => !formData.resourceIds.includes(r.id));
                    return [...selected, ...unselected].map(r => (
                      <label key={r.id} className={`resource-item ${formData.resourceIds.includes(r.id) ? 'selected' : ''}`}>
                        <input 
                          type="checkbox" 
                          checked={formData.resourceIds.includes(r.id)}
                          onChange={() => handleResourceToggle(r.id)}
                        />
                        {r.name}
                      </label>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="dialog-footer">
          {formData.id && (
            <button className="delete-button" onClick={handleDelete}>{t('Delete')}</button>
          )}
          <div className="footer-right">
            <button className="cancel-button" onClick={onClose}>{t('Cancel')}</button>
            <button className="save-button" onClick={handleSave}>{t('Save Changes')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
