import { useState, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Resource, ResourceLabels, User } from '../types';
import './TeacherManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  resources: Resource[];
  labels: ResourceLabels;
  isAdmin?: boolean;
  initialTeacherId?: string | null;
}

export function TeacherManager({ backendUrl, onClose, onUpdate, resources, labels, isAdmin = true, initialTeacherId }: Props) {
  const { t } = useTranslation();
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(initialTeacherId || null);
  const [teachersList, setTeachersList] = useState<Resource[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<{
    name: string;
    order: number;
    userId: string;
  }>({
    name: '',
    order: 0,
    userId: ''
  });

  // ドラッグ&ドロップ用の参照
  const dragItemRef = useRef<number | null>(null);
  const dragOverItemRef = useRef<number | null>(null);

  const teachers = resources.filter(r => r.type === 'teacher').sort((a, b) => (a.order || 0) - (b.order || 0));

  useEffect(() => {
    setTeachersList(teachers);
  }, [resources]);

  // 表示する講師のフィルタリング
  const filteredTeachers = teachersList.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isFiltering = searchQuery.length > 0;

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
    if (editingTeacherId && editingTeacherId !== 'new') {
      const teacher = teachers.find(t => t.id === editingTeacherId);
      if (teacher) {
        setFormData({
          name: teacher.name,
          order: teacher.order || 0,
          userId: teacher.userId || ''
        });
      }
    } else if (editingTeacherId === 'new') {
      setFormData({
        name: '',
        order: (teachers.length + 1),
        userId: ''
      });
    }
  }, [editingTeacherId, resources]);

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
          id: editingTeacherId === 'new' ? null : editingTeacherId,
          ...formData
        })
      });
      if (res.ok) {
        onUpdate();
        setEditingTeacherId(null);
      } else {
        alert(t('Failed to save {{resource}}', { resource: labels.teacher }));
      }
    } catch (err) {
      console.error('Error saving teacher:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('Are you sure you want to delete this {{resource}}?', { resource: labels.teacher }))) return;

    try {
      const res = await fetch(`${backendUrl}/teachers/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        onUpdate();
        if (editingTeacherId === id) setEditingTeacherId(null);
      } else {
        alert(t('Failed to delete {{resource}}', { resource: labels.teacher }));
      }
    } catch (err) {
      console.error('Error deleting teacher:', err);
    }
  };

  // 順序変更ロジック
  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newTeachers = [...teachersList];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newTeachers.length) return;

    const [movedItem] = newTeachers.splice(index, 1);
    newTeachers.splice(targetIndex, 0, movedItem);
    setTeachersList(newTeachers);
  };

  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItemRef.current = index;
  };

  const handleDragEnd = () => {
    if (dragItemRef.current === null || dragOverItemRef.current === null) return;
    const newTeachers = [...teachersList];
    const [movedItem] = newTeachers.splice(dragItemRef.current, 1);
    newTeachers.splice(dragOverItemRef.current, 0, movedItem);
    dragItemRef.current = null;
    dragOverItemRef.current = null;
    setTeachersList(newTeachers);
  };

  const handleSaveOrder = async () => {
    try {
      const res = await fetch(`${backendUrl}/teachers/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orders: teachersList.map((t, idx) => ({ id: t.id, order: idx + 1 }))
        })
      });
      if (res.ok) {
        onUpdate();
        alert(t('Settings saved successfully'));
      } else {
        alert(t('Failed to save settings'));
      }
    } catch (err) {
      console.error('Error saving teacher order:', err);
    }
  };

  const getUserEmail = (userId?: string) => {
    if (!userId) return '-';
    return users.find(u => u.id === userId)?.email || '-';
  };

  return (
    <div className="teacher-manager-overlay">
      <div className="teacher-manager-box">
        <div className="teacher-manager-header">
          <h2>{t('Manage {{resource}}', { resource: labels.teacher })}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="teacher-manager-content">
          {!editingTeacherId ? (
            <>
              <div className="header-actions">
                {isAdmin && (
                  <button className="add-button" onClick={() => setEditingTeacherId('new')}>
                    {t('Add New {{resource}}', { resource: labels.teacher })}
                  </button>
                )}
                <div className="search-box">
                  <input 
                    type="text" 
                    placeholder={t('Search by name...')} 
                    value={searchQuery}
                    onInput={(e) => setSearchQuery(e.currentTarget.value)}
                  />
                  {searchQuery && <button className="clear-search" onClick={() => setSearchQuery('')}>×</button>}
                </div>
              </div>
              <div className="teacher-list">
                <table>
                  <thead>
                    <tr>
                      {isAdmin && <th style={{ width: '30px' }}></th>}
                      {isAdmin && <th style={{ width: '70px' }}>{t('Move')}</th>}
                      <th>{t('Name')}</th>
                      {isAdmin && <th>{t('Linked User')}</th>}
                      <th style={{ width: '120px' }}>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTeachers.map((teacher) => {
                      const listIdx = teachersList.findIndex(item => item.id === teacher.id);
                      return (
                        <tr key={teacher.id}
                            draggable={isAdmin && !isFiltering}
                            onDragStart={() => isAdmin && !isFiltering && handleDragStart(listIdx)}
                            onDragEnter={() => isAdmin && !isFiltering && handleDragEnter(listIdx)}
                            onDragEnd={() => isAdmin && handleDragEnd()}
                            onDragOver={(e) => isAdmin && !isFiltering && e.preventDefault()}
                            className={`draggable-row ${isFiltering || !isAdmin ? 'non-draggable' : ''}`}
                        >
                          {isAdmin && <td className="drag-handle">{isFiltering ? '•' : '⋮⋮'}</td>}
                          {isAdmin && (
                            <td>
                              <div className="move-buttons">
                                <button className="move-btn" onClick={() => moveItem(listIdx, 'up')} disabled={isFiltering || listIdx === 0}>↑</button>
                                <button className="move-btn" onClick={() => moveItem(listIdx, 'down')} disabled={isFiltering || listIdx === teachersList.length - 1}>↓</button>
                              </div>
                            </td>
                          )}
                          <td style={{ fontWeight: 'bold' }}>{teacher.name}</td>
                          {isAdmin && <td>{getUserEmail(teacher.userId)}</td>}
                          <td>
                            <div className="action-buttons">
                              <button className="edit-btn" onClick={() => setEditingTeacherId(teacher.id)}>{isAdmin ? t('Edit') : t('View')}</button>
                              {isAdmin && <button className="delete-btn" onClick={() => handleDelete(teacher.id)}>{t('Delete')}</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {isAdmin && (
                <p className="hint-text">
                  {isFiltering ? t('Reordering is disabled during filtering') : t('Drag and drop rows or use arrows to change order')}
                </p>
              )}
              {isAdmin && (
                <div className="list-footer">
                  <button className="save-order-button" onClick={handleSaveOrder} disabled={isFiltering}>{t('Save Order')}</button>
                </div>
              )}
            </>
          ) : (
            <div className="teacher-form">
              <h3>{editingTeacherId === 'new' ? t('Add New {{resource}}', { resource: labels.teacher }) : (isAdmin ? t('Edit') : t('View'))}</h3>
              <div className="form-group">
                <label>{t('{{resource}} Name', { resource: labels.teacher })}</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onInput={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
                  readOnly={!isAdmin}
                />
              </div>
                {isAdmin && (
                  <div className="form-group">
                    <label>{t('Linked User (Optional)')}</label>
                    <select 
                      value={formData.userId} 
                      onChange={(e) => setFormData({ ...formData, userId: e.currentTarget.value })}
                      disabled={!isAdmin}
                    >
                      <option value="">{t('No link')}</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                )}
              <div className="form-group">
                <label>{t('Order')}</label>
                <input 
                  type="number" 
                  value={formData.order} 
                  onInput={(e) => setFormData({ ...formData, order: parseInt(e.currentTarget.value) || 0 })}
                  readOnly={!isAdmin}
                />
              </div>
            </div>
          )}
        </div>

        <div className="teacher-manager-footer">
          {editingTeacherId ? (
            <>
              {isAdmin && editingTeacherId !== 'new' && (
                <button className="delete-button" onClick={() => handleDelete(editingTeacherId)}>{t('Delete')}</button>
              )}
              <div className="footer-right">
                <button className="cancel-button" onClick={() => isAdmin ? setEditingTeacherId(null) : onClose()}>
                  {isAdmin ? t('Cancel') : t('Close')}
                </button>
                {isAdmin && <button className="save-button" onClick={handleSave}>{t('Save Changes')}</button>}
              </div>
            </>
          ) : (
            <div className="footer-right">
              <button className="cancel-button" onClick={onClose}>{t('Close')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
