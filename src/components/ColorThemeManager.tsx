import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { ColorTheme, ColorCategory } from '../types';
import './ColorThemeManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  themes: ColorTheme[];
}

export function ColorThemeManager({ backendUrl, onClose, onUpdate, themes: initialThemes }: Props) {
  const { t } = useTranslation();
  const [themes, setThemes] = useState<ColorTheme[]>([]);

  useEffect(() => {
    setThemes(initialThemes);
  }, [initialThemes]);

  const handleChange = (id: string, field: keyof ColorTheme, value: string) => {
    setThemes(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const handleAdd = (category: ColorCategory) => {
    const newTheme: ColorTheme = {
      id: `temp-${Date.now()}`,
      name: t('New Theme'),
      category,
      background: '#3b82f6',
      foreground: '#ffffff',
      order: themes.filter(t => t.category === category).length + 1
    };
    setThemes([...themes, newTheme]);
  };

  const handleRemove = async (id: string) => {
    if (id.startsWith('temp-')) {
      setThemes(themes.filter(t => t.id !== id));
      return;
    }

    if (!confirm(t('Are you sure you want to delete this theme?'))) return;

    try {
      const res = await fetch(`${backendUrl}/color-themes/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setThemes(themes.filter(t => t.id !== id));
        onUpdate();
      } else {
        alert(t('Failed to delete theme'));
      }
    } catch (err) {
      console.error('Error deleting theme:', err);
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`${backendUrl}/color-themes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ themes })
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to save themes'));
      }
    } catch (err) {
      console.error('Error saving themes:', err);
    }
  };

  const renderCategory = (category: ColorCategory, title: string) => {
    const categoryThemes = themes.filter(t => t.category === category);
    return (
      <div className="category-section">
        <h3>{title}</h3>
        <div className="theme-list">
          {categoryThemes.map(theme => (
            <div key={theme.id} className="theme-row">
              <div 
                className={`theme-preview-name ${!theme.key ? 'editable' : ''}`}
                style={{ backgroundColor: theme.background, color: theme.foreground }}
              >
                {!theme.key ? (
                  <input 
                    type="text" 
                    value={theme.name} 
                    onInput={(e) => handleChange(theme.id, 'name', e.currentTarget.value)}
                  />
                ) : (
                  <span>{t(theme.name)}</span>
                )}
              </div>
              
              <div className="color-input-group">
                <label>{t('Background')}</label>
                <div className="color-input-wrapper">
                  <input 
                    type="color" 
                    value={theme.background} 
                    onInput={(e) => handleChange(theme.id, 'background', e.currentTarget.value)}
                  />
                  <input 
                    type="text" 
                    value={theme.background} 
                    onInput={(e) => handleChange(theme.id, 'background', e.currentTarget.value)}
                  />
                </div>
              </div>

              <div className="color-input-group">
                <label>{t('Foreground')}</label>
                <div className="color-input-wrapper">
                  <input 
                    type="color" 
                    value={theme.foreground} 
                    onInput={(e) => handleChange(theme.id, 'foreground', e.currentTarget.value)}
                  />
                  <input 
                    type="text" 
                    value={theme.foreground} 
                    onInput={(e) => handleChange(theme.id, 'foreground', e.currentTarget.value)}
                  />
                </div>
              </div>

              <button 
                className="remove-theme-btn" 
                onClick={() => handleRemove(theme.id)}
                disabled={!!theme.key}
                title={t('Delete')}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {(category === 'EVENT' || category === 'HOLIDAY') && (
          <button className="add-theme-btn" onClick={() => handleAdd(category)}>
            + {t('Add New Theme')}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="theme-manager-overlay">
      <div className="theme-manager-box">
        <div className="theme-manager-header">
          <h2>{t('Manage Color Themes')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="theme-manager-content">
          {renderCategory('EVENT', t('Events'))}
          {renderCategory('LESSON', t('Lessons'))}
          {renderCategory('HOLIDAY', t('Holidays'))}
        </div>

        <div className="theme-manager-footer">
          <button className="cancel-button" onClick={onClose}>{t('Cancel')}</button>
          <button className="save-button" onClick={handleSave}>{t('Save Changes')}</button>
        </div>
      </div>
    </div>
  );
}
