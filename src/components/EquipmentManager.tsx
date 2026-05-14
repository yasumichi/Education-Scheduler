import { useState, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Equipment, ResourceLabels } from '../types';
import './EquipmentManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  labels: ResourceLabels;
}

export function EquipmentManager({ backendUrl, onClose, labels }: Props) {
  const { t } = useTranslation();
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    remarks: string;
    order: number;
  }>({
    name: '',
    remarks: '',
    order: 0
  });

  // For Drag & Drop
  const dragItemRef = useRef<number | null>(null);
  const dragOverItemRef = useRef<number | null>(null);

  const fetchEquipments = async () => {
    try {
      const res = await fetch(`${backendUrl}/equipments`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setEquipments(data);
      }
    } catch (err) {
      console.error('Failed to fetch equipments:', err);
    }
  };

  useEffect(() => {
    fetchEquipments();
  }, []);

  useEffect(() => {
    if (editingId && editingId !== 'new') {
      const item = equipments.find(e => e.id === editingId);
      if (item) {
        setFormData({
          name: item.name,
          remarks: item.remarks || '',
          order: item.order
        });
      }
    } else {
      setFormData({
        name: '',
        remarks: '',
        order: equipments.length > 0 ? Math.max(...equipments.map(e => e.order)) + 1 : 1
      });
    }
  }, [editingId, equipments]);

  const handleSave = async () => {
    if (!formData.name) {
      alert(t('Please enter a name'));
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/equipments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingId === 'new' ? null : editingId,
          ...formData
        })
      });
      if (res.ok) {
        fetchEquipments();
        setEditingId(null);
      } else {
        alert(t('Failed to save {{resource}}', { resource: labels.equipment }));
      }
    } catch (err) {
      console.error('Error saving equipment:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('Are you sure you want to delete this {{resource}}?', { resource: labels.equipment }))) return;

    try {
      const res = await fetch(`${backendUrl}/equipments/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        fetchEquipments();
        if (editingId === id) setEditingId(null);
      } else {
        alert(t('Failed to delete {{resource}}', { resource: labels.equipment }));
      }
    } catch (err) {
      console.error('Error deleting equipment:', err);
    }
  };

  const handleSaveOrder = async () => {
    try {
      const res = await fetch(`${backendUrl}/equipments/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orders: equipments.map((e, idx) => ({ id: e.id, order: idx + 1 }))
        })
      });
      if (res.ok) {
        fetchEquipments();
        alert(t('Settings saved successfully'));
      } else {
        alert(t('Failed to save settings'));
      }
    } catch (err) {
      console.error('Error saving equipment order:', err);
    }
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newList = [...equipments];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    const [movedItem] = newList.splice(index, 1);
    newList.splice(targetIndex, 0, movedItem);
    setEquipments(newList);
  };

  const handleDragStart = (index: number) => { dragItemRef.current = index; };
  const handleDragEnter = (index: number) => { dragOverItemRef.current = index; };
  const handleDragEnd = () => {
    if (dragItemRef.current === null || dragOverItemRef.current === null) return;
    const newList = [...equipments];
    const [movedItem] = newList.splice(dragItemRef.current, 1);
    newList.splice(dragOverItemRef.current, 0, movedItem);
    dragItemRef.current = null;
    dragOverItemRef.current = null;
    setEquipments(newList);
  };

  return (
    <div className="equipment-manager-overlay">
      <div className="equipment-manager-box">
        <div className="dialog-header">
          <h2>{t('Manage {{resource}}', { resource: labels.equipment })}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="equipment-manager-content">
          {!editingId ? (
            <>
              <div className="header-actions">
                <button className="add-button" onClick={() => setEditingId('new')}>
                  {t('Add New {{resource}}', { resource: labels.equipment })}
                </button>
              </div>
              <div className="manager-list">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}></th>
                      <th style={{ width: '80px' }}>{t('Move')}</th>
                      <th>{t('Name')}</th>
                      <th>{t('Remarks')}</th>
                      <th style={{ width: '120px' }}>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipments.map((e, idx) => (
                      <tr key={e.id}
                          draggable
                          onDragStart={() => handleDragStart(idx)}
                          onDragEnter={() => handleDragEnter(idx)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(ev) => ev.preventDefault()}
                          className="draggable-row"
                      >
                        <td className="drag-handle">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
                            <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
                          </svg>
                        </td>
                        <td>
                          <div className="move-buttons">
                            <button className="move-btn" onClick={() => moveItem(idx, 'up')} disabled={idx === 0}>↑</button>
                            <button className="move-btn" onClick={() => moveItem(idx, 'down')} disabled={idx === equipments.length - 1}>↓</button>
                          </div>
                        </td>
                        <td>{e.name}</td>
                        <td>{e.remarks}</td>
                        <td>
                          <div className="action-buttons">
                            <button className="edit-btn" onClick={() => setEditingId(e.id)}>{t('Edit')}</button>
                            <button className="delete-btn" onClick={() => handleDelete(e.id)}>{t('Delete')}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint-text">{t('Drag and drop rows or use arrows to change order')}</p>
            </>
          ) : (
            <div className="equipment-form">
              <h3>{editingId === 'new' ? t('Add New {{resource}}', { resource: labels.equipment }) : t('Edit {{resource}}', { resource: labels.equipment })}</h3>
              <div className="form-group">
                <label>{t('{{resource}} Name', { resource: labels.equipment })}</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onInput={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
                />
              </div>
              <div className="form-group">
                <label>{t('Remarks')}</label>
                <textarea 
                  value={formData.remarks} 
                  onInput={(e) => setFormData({ ...formData, remarks: e.currentTarget.value })}
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>{t('Order')}</label>
                <input 
                  type="number" 
                  value={formData.order} 
                  onInput={(e) => setFormData({ ...formData, order: parseInt(e.currentTarget.value) || 0 })}
                />
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <div className="footer-right">
            {!editingId ? (
              <>
                <button className="save-order-button" onClick={handleSaveOrder}>{t('Save Order')}</button>
                <button className="cancel-button" onClick={onClose}>{t('Close')}</button>
              </>
            ) : (
              <>
                <button className="cancel-button" onClick={() => setEditingId(null)}>{t('Cancel')}</button>
                <button className="save-button" onClick={handleSave}>{t('Save')}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
