import { useState, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Resource, ResourceLabels, Equipment } from '../types';
import { apiFetch } from '../utils/api';
import './RoomManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  resources: Resource[];
  labels: ResourceLabels;
  isAdmin?: boolean;
  initialRoomId?: string | null;
}

export function RoomManager({ backendUrl, onClose, onUpdate, resources, labels, isAdmin = true, initialRoomId }: Props) {
  const { t } = useTranslation();
  const [editingRoomId, setEditingRoomId] = useState<string | null>(initialRoomId || null);
  const [roomsList, setRoomsList] = useState<Resource[]>([]);
  const [equipmentsMaster, setEquipmentsMaster] = useState<Equipment[]>([]);
  const [formData, setFormData] = useState<{
    name: string;
    order: number;
    capacity: number | '';
    equipments: { equipmentId: string; quantity: number }[];
  }>({
    name: '',
    order: 0,
    capacity: '',
    equipments: []
  });

  // Refs for drag and drop
  const dragItemRef = useRef<number | null>(null);
  const dragOverItemRef = useRef<number | null>(null);

  const rooms = resources.filter(r => r.type === 'room').sort((a, b) => (a.order || 0) - (b.order || 0));

  useEffect(() => {
    setRoomsList(rooms);
  }, [resources]);

  useEffect(() => {
    const fetchEquipments = async () => {
      try {
        const res = await apiFetch(`${backendUrl}/equipments`);
        if (res.ok) {
          const data = await res.json();
          setEquipmentsMaster(data);
        }
      } catch (err) {
        console.error('Failed to fetch equipments master:', err);
      }
    };
    fetchEquipments();
  }, [backendUrl]);

  useEffect(() => {
    if (editingRoomId && editingRoomId !== 'new') {
      const room = rooms.find(r => r.id === editingRoomId);
      if (room) {
        setFormData({
          name: room.name,
          order: room.order || 0,
          capacity: room.capacity || '',
          equipments: room.equipments?.map(re => ({
            equipmentId: re.equipmentId,
            quantity: re.quantity
          })) || []
        });
      }
    } else {
      setFormData({
        name: '',
        order: (rooms.length + 1),
        capacity: '',
        equipments: []
      });
    }
  }, [editingRoomId, resources]);

  const handleSave = async () => {
    if (!formData.name) {
      alert(t('Please enter a name'));
      return;
    }

    try {
      const res = await apiFetch(`${backendUrl}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          id: editingRoomId === 'new' ? null : editingRoomId,
          ...formData
        })
      });
      if (res.ok) {
        onUpdate();
        setEditingRoomId(null);
      } else {
        alert(t('Failed to save {{resource}}', { resource: labels.room }));
      }
    } catch (err) {
      console.error('Error saving room:', err);
    }
  };

  const handleAddEquipment = () => {
    setFormData({
      ...formData,
      equipments: [...formData.equipments, { equipmentId: '', quantity: 1 }]
    });
  };

  const handleEquipmentChange = (index: number, equipmentId: string) => {
    const newEquipments = [...formData.equipments];
    newEquipments[index].equipmentId = equipmentId;
    setFormData({ ...formData, equipments: newEquipments });
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    const newEquipments = [...formData.equipments];
    newEquipments[index].quantity = quantity;
    setFormData({ ...formData, equipments: newEquipments });
  };

  const handleRemoveEquipment = (index: number) => {
    const newEquipments = [...formData.equipments];
    newEquipments.splice(index, 1);
    setFormData({ ...formData, equipments: newEquipments });
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('Are you sure you want to delete this {{resource}}?', { resource: labels.room }))) return;

    try {
      const res = await apiFetch(`${backendUrl}/rooms/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        onUpdate();
        if (editingRoomId === id) setEditingRoomId(null);
      } else {
        alert(t('Failed to delete {{resource}}', { resource: labels.room }));
      }
    } catch (err) {
      console.error('Error deleting room:', err);
    }
  };

  // Move using up/down buttons
  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newRooms = [...roomsList];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newRooms.length) return;

    const [movedItem] = newRooms.splice(index, 1);
    newRooms.splice(targetIndex, 0, movedItem);
    setRoomsList(newRooms);
  };

  // Drag and drop processing
  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItemRef.current = index;
  };

  const handleDragEnd = () => {
    if (dragItemRef.current === null || dragOverItemRef.current === null) return;
    const newRooms = [...roomsList];
    const [movedItem] = newRooms.splice(dragItemRef.current, 1);
    newRooms.splice(dragOverItemRef.current, 0, movedItem);
    dragItemRef.current = null;
    dragOverItemRef.current = null;
    setRoomsList(newRooms);
  };

  const handleSaveOrder = async () => {
    try {
      const res = await apiFetch(`${backendUrl}/rooms/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          // Save current array order (index) as the new order
          orders: roomsList.map((r, idx) => ({ id: r.id, order: idx + 1 }))
        })
      });
      if (res.ok) {
        onUpdate();
        alert(t('Settings saved successfully'));
      } else {
        alert(t('Failed to save settings'));
      }
    } catch (err) {
      console.error('Error saving room order:', err);
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box room-manager-box">
        <div className="dialog-header">
          <h2>{t('Manage {{resource}}', { resource: labels.room })}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="dialog-content">
          {!editingRoomId ? (
            <>
              {isAdmin && (
                <div className="header-actions">
                  <button className="add-button" onClick={() => setEditingRoomId('new')}>
                    {t('Add New {{resource}}', { resource: labels.room })}
                  </button>
                </div>
              )}
              <div className="manager-list">
                <table>
                  <thead>
                    <tr>
                      {isAdmin && <th style={{ width: '40px' }}></th>}
                      {isAdmin && <th style={{ width: '80px' }}>{t('Move')}</th>}
                      <th>{t('Name')}</th>
                      <th style={{ width: '100px' }}>{t('Capacity')}</th>
                      <th style={{ width: '120px' }}>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomsList.map((r, idx) => (
                      <tr key={r.id}
                          draggable={isAdmin}
                          onDragStart={() => isAdmin && handleDragStart(idx)}
                          onDragEnter={() => isAdmin && handleDragEnter(idx)}
                          onDragEnd={() => isAdmin && handleDragEnd()}
                          onDragOver={(e) => isAdmin && e.preventDefault()}
                          className={isAdmin ? "draggable-row" : ""}
                      >
                        {isAdmin && (
                          <td className="drag-handle">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
                              <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
                            </svg>
                          </td>
                        )}
                        {isAdmin && (
                          <td>
                            <div className="move-buttons">
                              <button className="move-btn" onClick={() => moveItem(idx, 'up')} disabled={idx === 0}>↑</button>
                              <button className="move-btn" onClick={() => moveItem(idx, 'down')} disabled={idx === roomsList.length - 1}>↓</button>
                            </div>
                          </td>
                        )}
                        <td>{r.name}</td>
                        <td style={{ textAlign: 'right' }}>{r.capacity || '-'}</td>
                        <td>
                          <div className="action-buttons">
                            <button className="edit-btn" onClick={() => setEditingRoomId(r.id)}>{isAdmin ? t('Edit') : t('View')}</button>
                            {isAdmin && <button className="delete-btn" onClick={() => handleDelete(r.id)}>{t('Delete')}</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isAdmin && <p className="hint-text">{t('Drag and drop rows or use arrows to change order')}</p>}
            </>
          ) : (
            <div className="room-form">
              <h3>{editingRoomId === 'new' ? t('Add New {{resource}}', { resource: labels.room }) : (isAdmin ? t('Edit') : t('View'))}</h3>
              <div className="form-group">
                <label>{t('{{resource}} Name', { resource: labels.room })}</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onInput={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
                  readOnly={!isAdmin}
                />
              </div>
              <div className="form-group">
                <label>{t('Order')}</label>
                <input 
                  type="number" 
                  value={formData.order} 
                  onInput={(e) => setFormData({ ...formData, order: parseInt(e.currentTarget.value) || 0 })}
                  readOnly={!isAdmin}
                />
              </div>
              <div className="form-group">
                <label>{t('Capacity')}</label>
                <input 
                  type="number" 
                  min="0"
                  value={formData.capacity} 
                  onInput={(e) => setFormData({ ...formData, capacity: e.currentTarget.value === '' ? '' : parseInt(e.currentTarget.value) || 0 })}
                  readOnly={!isAdmin}
                />
              </div>

              <div className="room-equipments-section">
                <div className="section-header">
                  <label>{labels.equipment}</label>
                  {isAdmin && (
                    <button className="add-equipment-btn" onClick={handleAddEquipment}>
                      + {t('Add')}
                    </button>
                  )}
                </div>
                <div className="equipment-items">
                  {formData.equipments.map((item, idx) => (
                    <div key={idx} className="equipment-item-row">
                      <select
                        value={item.equipmentId}
                        onChange={(e) => handleEquipmentChange(idx, e.currentTarget.value)}
                        disabled={!isAdmin}
                      >
                        <option value="">-- {t('Select {{resource}}', { resource: labels.equipment })} --</option>
                        {equipmentsMaster.map(e => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onInput={(e) => handleQuantityChange(idx, parseInt(e.currentTarget.value) || 1)}
                        className="quantity-input"
                        readOnly={!isAdmin}
                      />
                      {isAdmin && (
                        <button className="remove-item-btn" onClick={() => handleRemoveEquipment(idx)}>×</button>
                      )}
                    </div>
                  ))}
                  {formData.equipments.length === 0 && (
                    <div className="empty-text">{t('No {{resource}} defined.', { resource: labels.equipment })}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          {!editingRoomId ? (
            <div className="footer-right">
              {isAdmin && <button className="save-order-button" onClick={handleSaveOrder}>{t('Save Order')}</button>}
              <button className="cancel-button" onClick={onClose}>{t('Close')}</button>
            </div>
          ) : (
            <div className="footer-right">
              <button className="cancel-button" onClick={() => isAdmin ? setEditingRoomId(null) : onClose()}>
                {isAdmin ? t('Cancel') : t('Close')}
              </button>
              {isAdmin && <button className="save-button" onClick={handleSave}>{t('Save')}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
