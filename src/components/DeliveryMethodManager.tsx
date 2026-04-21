import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { DeliveryMethod, ResourceLabels } from '../types';
import './DeliveryMethodManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  labels: ResourceLabels;
}

export function DeliveryMethodManager({ backendUrl, onClose, onUpdate, labels }: Props) {
  const { t } = useTranslation();
  const [methods, setMethods] = useState<Partial<DeliveryMethod>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMethods();
  }, []);

  const fetchMethods = async () => {
    try {
      const res = await fetch(`${backendUrl}/delivery-methods`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setMethods(data);
      }
    } catch (err) {
      console.error('Failed to fetch delivery methods:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setMethods([...methods, { name: '', color: '#3b82f6' }]);
  };

  const handleRemove = (index: number) => {
    setMethods(methods.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: keyof DeliveryMethod, value: string) => {
    const newMethods = [...methods];
    newMethods[index] = { ...newMethods[index], [field]: value };
    setMethods(newMethods);
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`${backendUrl}/delivery-methods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ methods })
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to save delivery methods'));
      }
    } catch (err) {
      console.error('Failed to save delivery methods:', err);
    }
  };

  if (loading) return <div className="loading">{t('Loading...')}</div>;

  return (
    <div className="delivery-method-manager-overlay">
      <div className="delivery-method-manager-box">
        <div className="delivery-method-manager-header">
          <h2>{t('Manage {{resource}}', { resource: labels.deliveryMethod })}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="method-list">
          {methods.map((m, index) => (
            <div key={index} className="method-row">
              <div className="method-field">
                <label>{t('{{resource}} Name', { resource: labels.deliveryMethod })}</label>
                <input 
                  type="text" 
                  value={m.name} 
                  onInput={(e) => handleChange(index, 'name', e.currentTarget.value)}
                  placeholder={t('e.g. Online, Face-to-face')}
                />
              </div>
              <div className="method-field color-field">
                <label>{t('Color')}</label>
                <input 
                  type="color" 
                  value={m.color} 
                  onInput={(e) => handleChange(index, 'color', e.currentTarget.value)}
                />
              </div>
              <div className="remove-button-placeholder">
                <button className="remove-button" onClick={() => handleRemove(index)}>
                  {t('Remove')}
                </button>
              </div>
            </div>
          ))}
          {methods.length === 0 && (
            <div className="empty-message">{t('No {{resource}} defined.', { resource: labels.deliveryMethod })}</div>
          )}
        </div>

        <div className="delivery-method-manager-footer">
          <button className="add-button" onClick={handleAdd}>{t('Add {{resource}}', { resource: labels.deliveryMethod })}</button>
          <div className="footer-actions">
            <button className="cancel-button" onClick={onClose}>{t('Cancel')}</button>
            <button className="save-button" onClick={handleSave}>{t('Save Changes')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

