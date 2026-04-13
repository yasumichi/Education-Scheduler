import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Resource, ResourceLabels, User } from '../types';
import './TeacherManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  resources: Resource[];
  labels: ResourceLabels;
}

export function TeacherManager({ backendUrl, onClose, onUpdate, resources, labels }: Props) {
  const { t } = useTranslation();
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState<{
    name: string;
    order: number;
    userId: string;
  }>({
    name: '',
    order: 0,
    userId: ''
  });

  const teachers = resources.filter(r => r.type === 'teacher');

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${backendUrl}/users`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedTeacherId) {
      const teacher = teachers.find(t => t.id === selectedTeacherId);
      if (teacher) {
        setFormData({
          name: teacher.name,
          order: teacher.order || 0,
          userId: teacher.userId || ''
        });
      }
    } else {
      setFormData({
        name: '',
        order: (teachers.length + 1),
        userId: ''
      });
    }
  }, [selectedTeacherId, resources]);

  const handleSave = async () => {
    if (!formData.name) {
      alert(t('Please enter a name'));
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/teachers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          id: selectedTeacherId,
          ...formData
        })
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to save {{resource}}', { resource: labels.teacher }));
      }
    } catch (err) {
      console.error('Error saving teacher:', err);
    }
  };

  const handleDelete = async () => {
    if (!selectedTeacherId) return;
    if (!confirm(t('Are you sure you want to delete this {{resource}}?', { resource: labels.teacher }))) return;

    try {
      const res = await fetch(`${backendUrl}/teachers/${selectedTeacherId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to delete {{resource}}', { resource: labels.teacher }));
      }
    } catch (err) {
      console.error('Error deleting teacher:', err);
    }
  };

  return (
    <div className="teacher-manager-overlay">
      <div className="teacher-manager-box">
        <div className="teacher-manager-header">
          <h2>{t('Manage {{resource}}', { resource: labels.teacher })}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="teacher-manager-content">
          <div className="teacher-selector">
            <label>{t('Select {{resource}} to Edit', { resource: labels.teacher })}</label>
            <select 
              value={selectedTeacherId || ''} 
              onChange={(e) => setSelectedTeacherId(e.currentTarget.value || null)}
            >
              <option value="">{t('Add New {{resource}}', { resource: labels.teacher })}</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="teacher-form">
            <div className="form-group">
              <label>{t('{{resource}} Name', { resource: labels.teacher })}</label>
              <input 
                type="text" 
                value={formData.name} 
                onInput={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
              />
            </div>
            <div className="form-group">
              <label>{t('Linked User (Optional)')}</label>
              <select 
                value={formData.userId} 
                onChange={(e) => setFormData({ ...formData, userId: e.currentTarget.value })}
              >
                <option value="">{t('No link')}</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
                ))}
              </select>
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

        <div className="teacher-manager-footer">
          {selectedTeacherId && (
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
