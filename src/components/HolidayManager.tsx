import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Holiday } from '../types';
import { parseISO, getYear } from 'date-fns';
import './HolidayManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  holidays: Holiday[];
  initialYear?: number;
}

export function HolidayManager({ backendUrl, onClose, onUpdate, holidays, initialYear }: Props) {
  const { t } = useTranslation();
  const [selectedYear, setSelectedYear] = useState<number>(initialYear || new Date().getFullYear());
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Holiday>>({
    name: '',
    date: '',
    start: '',
    end: ''
  });
  const [isImportMode, setIsImportMode] = useState<boolean>(false);
  const [importYear, setImportYear] = useState<number>(selectedYear);
  const [countryCode, setCountryCode] = useState<string>('JP');

  const years = Array.from(new Set(holidays.map(h => {
    const d = h.date || h.start;
    return d ? getYear(parseISO(d)) : null;
  }).filter(y => y !== null))) as number[];
  
  if (!years.includes(new Date().getFullYear())) {
    years.push(new Date().getFullYear());
  }
  if (initialYear && !years.includes(initialYear)) {
    years.push(initialYear);
  }
  years.sort((a, b) => b - a);

  const filteredHolidays = holidays.filter(h => {
    const d = h.date || h.start;
    return d && getYear(parseISO(d)) === selectedYear;
  }).sort((a, b) => (a.date || a.start || '').localeCompare(b.date || b.start || ''));

  const handleCalendarYearChange = (e: any) => {
    const date = parseISO(e.currentTarget.value);
    if (!isNaN(date.getTime())) {
      const year = getYear(date);
      setSelectedYear(year);
      setImportYear(year);
    }
  };

  useEffect(() => {
    if (editingHolidayId && editingHolidayId !== 'new') {
      const holiday = holidays.find(h => h.id === editingHolidayId);
      if (holiday) {
        setFormData(holiday);
      }
    } else {
      setFormData({
        name: '',
        date: '',
        start: '',
        end: ''
      });
    }
  }, [editingHolidayId, holidays]);

  const handleSave = async () => {
    if (!formData.name || (!formData.date && (!formData.start || !formData.end))) {
      alert(t('Please enter a name and date/range'));
      return;
    }

    try {
      const url = editingHolidayId === 'new' ? `${backendUrl}/holidays` : `${backendUrl}/holidays/${editingHolidayId}`;
      const method = editingHolidayId === 'new' ? 'POST' : 'PUT';
      
      // Map empty strings to null for backend
      const payload = {
        name: formData.name,
        date: formData.date || null,
        start: formData.start || null,
        end: formData.end || null
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        onUpdate();
        setEditingHolidayId(null);
      } else {
        alert(t('Failed to save holiday'));
      }
    } catch (err) {
      console.error('Error saving holiday:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('Are you sure you want to delete this holiday?'))) return;

    try {
      const res = await fetch(`${backendUrl}/holidays/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        onUpdate();
      } else {
        alert(t('Failed to delete holiday'));
      }
    } catch (err) {
      console.error('Error deleting holiday:', err);
    }
  };

  const handleImportNager = async () => {
    if (!confirm(t('Import holidays for {{year}} from Nager.Date?', { year: importYear }))) return;
    try {
      const res = await fetch(`${backendUrl}/holidays/import-nager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ year: importYear, countryCode })
      });
      if (res.ok) {
        onUpdate();
        setIsImportMode(false);
      } else {
        alert(t('Failed to import holidays'));
      }
    } catch (err) {
      console.error('Error importing holidays:', err);
    }
  };

  const handleImportJson = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const res = await fetch(`${backendUrl}/holidays/import-json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ holidays: json })
        });
        if (res.ok) {
          onUpdate();
          setIsImportMode(false);
        } else {
          alert(t('Failed to import holidays from JSON'));
        }
      } catch (err) {
        console.error('Error parsing JSON:', err);
        alert(t('Invalid JSON file'));
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="holiday-manager-overlay">
      <div className="holiday-manager-box">
        <div className="holiday-manager-header">
          <h2>{t('Manage Holidays')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="holiday-manager-content">
          {!isImportMode && !editingHolidayId && (
            <>
              <div className="year-selector">
                <div className="year-input-group">
                  <label>{t('Year')}</label>
                  <select value={selectedYear} onChange={(e) => {
                    const y = parseInt(e.currentTarget.value);
                    setSelectedYear(y);
                    setImportYear(y);
                  }}>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="year-calendar-group">
                  <label>{t('Select from Calendar')}</label>
                  <input 
                    type="date" 
                    value={`${selectedYear}-01-01`}
                    onChange={handleCalendarYearChange}
                  />
                </div>
                <div className="header-actions">
                  <button onClick={() => setEditingHolidayId('new')}>{t('Add Holiday')}</button>
                  <button onClick={() => setIsImportMode(true)}>{t('Import')}</button>
                </div>
              </div>

              <div className="holiday-list">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Date')}</th>
                      <th>{t('Name')}</th>
                      <th>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHolidays.map(h => (
                      <tr key={h.id}>
                        <td>{h.date || `${h.start} ~ ${h.end}`}</td>
                        <td>{h.name}</td>
                        <td>
                          <button onClick={() => setEditingHolidayId(h.id)}>{t('Edit')}</button>
                          <button className="delete-btn" onClick={() => handleDelete(h.id)}>{t('Delete')}</button>
                        </td>
                      </tr>
                    ))}
                    {filteredHolidays.length === 0 && (
                      <tr>
                        <td colSpan={3} className="empty-message">{t('No holidays found for this year')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="list-footer">
                <button className="cancel-button" onClick={onClose}>{t('Close')}</button>
              </div>
            </>
          )}

          {editingHolidayId && (
            <div className="holiday-form">
              <h3>{editingHolidayId === 'new' ? t('Add Holiday') : t('Edit Holiday')}</h3>
              <div className="form-group">
                <label>{t('Holiday Name')}</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onInput={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{t('Single Date')}</label>
                  <input 
                    type="date" 
                    value={formData.date || ''} 
                    onInput={(e) => setFormData({ ...formData, date: e.currentTarget.value, start: '', end: '' })}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{t('Start Date (for range)')}</label>
                  <input 
                    type="date" 
                    value={formData.start || ''} 
                    onInput={(e) => setFormData({ ...formData, start: e.currentTarget.value, date: '' })}
                  />
                </div>
                <div className="form-group">
                  <label>{t('End Date (for range)')}</label>
                  <input 
                    type="date" 
                    value={formData.end || ''} 
                    onInput={(e) => setFormData({ ...formData, end: e.currentTarget.value, date: '' })}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button className="cancel-button" onClick={() => setEditingHolidayId(null)}>{t('Cancel')}</button>
                <button className="save-button" onClick={handleSave}>{t('Save')}</button>
              </div>
            </div>
          )}

          {isImportMode && (
            <div className="import-section">
              <h3>{t('Import Holidays')}</h3>
              <div className="import-nager">
                <h4>Nager.Date API</h4>
                <div className="form-row">
                  <div className="form-group">
                    <label>{t('Year')}</label>
                    <input 
                      type="number" 
                      value={importYear} 
                      onInput={(e) => setImportYear(parseInt(e.currentTarget.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('Country Code')}</label>
                    <input 
                      type="text" 
                      value={countryCode} 
                      onInput={(e) => setCountryCode(e.currentTarget.value.toUpperCase())}
                    />
                  </div>
                </div>
                <button onClick={handleImportNager}>{t('Import from Nager.Date')}</button>
              </div>

              <div className="import-json">
                <h4>{t('Local JSON File')}</h4>
                <p>{t('Select a JSON file downloaded from Nager.Date')}</p>
                <input type="file" accept=".json" onChange={handleImportJson} />
              </div>

              <div className="form-actions">
                <button className="cancel-button" onClick={() => setIsImportMode(false)}>{t('Cancel')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
