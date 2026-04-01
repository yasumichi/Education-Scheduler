import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Resource, ResourceLabels } from '../types';
import './RoomManager.css';

interface Props {
  token: string;
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  resources: Resource[];
  labels: ResourceLabels;
}

export function RoomManager({ token, backendUrl, onClose, onUpdate, resources, labels }: Props) {
  const { t } = useTranslation();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    order: number;
  }>({
    name: '',
    order: 0
  });

  const rooms = resources.filter(r => r.type === 'room');

  useEffect(() => {
    if (selectedRoomId) {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (room) {
        setFormData({
          name: room.name,
          order: room.order || 0
        });
      }
    } else {
      setFormData({
        name: '',
        order: (rooms.length + 1)
      });
    }
  }, [selectedRoomId, resources]);

  const handleSave = async () => {
    if (!formData.name) {
      alert(t('Please enter a name'));
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/rooms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: selectedRoomId,
          ...formData
        })
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to save room'));
      }
    } catch (err) {
      console.error('Error saving room:', err);
    }
  };

  const handleDelete = async () => {
    if (!selectedRoomId) return;
    if (!confirm(t('Are you sure you want to delete this room?'))) return;

    try {
      const res = await fetch(`${backendUrl}/rooms/${selectedRoomId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to delete room'));
      }
    } catch (err) {
      console.error('Error deleting room:', err);
    }
  };

  return (
    <div className="room-manager-overlay">
      <div className="room-manager-box">
        <div className="room-manager-header">
          <h2>{t('Manage {{resource}}', { resource: labels.room })}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="room-manager-content">
          <div className="room-selector">
            <label>{t('Select {{resource}} to Edit', { resource: labels.room })}</label>
            <select 
              value={selectedRoomId || ''} 
              onChange={(e) => setSelectedRoomId(e.currentTarget.value || null)}
            >
              <option value="">{t('Add New {{resource}}', { resource: labels.room })}</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="room-form">
            <div className="form-group">
              <label>{t('{{resource}} Name', { resource: labels.room })}</label>
              <input 
                type="text" 
                value={formData.name} 
                onInput={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
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
        </div>

        <div className="room-manager-footer">
          {selectedRoomId && (
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
