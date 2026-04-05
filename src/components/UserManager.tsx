import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { User, UserRole } from '../types';
import './UserManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  currentUser: User;
}

export function UserManager({ backendUrl, onClose, currentUser }: Props) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'STUDENT' as UserRole
  });
  const [resetPasswordMode, setResetPasswordMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${backendUrl}/users`, { credentials: 'include' });
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
    if (editingUserId && editingUserId !== 'new') {
      const user = users.find(u => u.id === editingUserId);
      if (user) {
        setFormData({
          email: user.email,
          password: '',
          role: user.role
        });
      }
    } else {
      setFormData({
        email: '',
        password: '',
        role: 'STUDENT'
      });
    }
    setResetPasswordMode(false);
  }, [editingUserId, users]);

  const handleSave = async () => {
    if (!formData.email || (isAddingNew && !formData.password)) {
      alert(t('Please fill in all required fields'));
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: isAddingNew ? null : editingUserId,
          ...formData
        })
      });
      if (res.ok) {
        fetchUsers();
        setEditingUserId(null);
        setIsAddingNew(false);
        alert(t('User saved successfully'));
      } else {
        const errData = await res.json();
        alert(errData.error || t('Failed to save user'));
      }
    } catch (err) {
      console.error('Error saving user:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (id === currentUser.id) {
      alert(t('Cannot delete yourself'));
      return;
    }
    if (!confirm(t('Are you sure you want to delete this user?'))) return;

    try {
      const res = await fetch(`${backendUrl}/users/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        fetchUsers();
      } else {
        alert(t('Failed to delete user'));
      }
    } catch (err) {
      console.error('Error deleting user:', err);
    }
  };

  const handleResetPassword = async () => {
    if (!editingUserId || !newPassword) return;
    try {
      const res = await fetch(`${backendUrl}/users/${editingUserId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newPassword })
      });
      if (res.ok) {
        setResetPasswordMode(false);
        setNewPassword('');
        setEditingUserId(null);
        alert(t('Password reset successfully'));
      } else {
        alert(t('Failed to reset password'));
      }
    } catch (err) {
      console.error('Error resetting password:', err);
    }
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const startEdit = (user: User) => {
    setEditingUserId(user.id);
    setIsAddingNew(false);
  };

  const startReset = (user: User) => {
    setEditingUserId(user.id);
    setResetPasswordMode(true);
  };

  return (
    <div className="user-manager-overlay">
      <div className="user-manager-box larger">
        <div className="user-manager-header">
          <h2>{t('Manage Users')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="user-manager-content">
          {!editingUserId && !isAddingNew ? (
            <>
              <div className="user-list-actions">
                <input 
                  type="text" 
                  placeholder={t('Search users...')} 
                  value={searchTerm}
                  onInput={(e) => setSearchTerm(e.currentTarget.value)}
                  className="search-input"
                />
                <button className="save-button" onClick={() => setIsAddingNew(true)}>
                  {t('Add New User')}
                </button>
              </div>

              <div className="user-table-container">
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>{t('Email')}</th>
                      <th>{t('Role')}</th>
                      <th>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td>{u.role}</td>
                        <td className="actions-cell">
                          <button className="action-btn" onClick={() => startEdit(u)}>{t('Edit')}</button>
                          <button className="action-btn" onClick={() => startReset(u)}>{t('Reset Password')}</button>
                          {u.id !== currentUser.id && (
                            <button className="action-btn delete-btn" onClick={() => handleDelete(u.id)}>{t('Delete')}</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              {!resetPasswordMode ? (
                <div className="user-form">
                  <h3>{isAddingNew ? t('Add New User') : t('Edit User')}</h3>
                  <div className="form-group">
                    <label>{t('Email')}</label>
                    <input 
                      type="email" 
                      value={formData.email} 
                      onInput={(e) => setFormData({ ...formData, email: e.currentTarget.value })}
                    />
                  </div>
                  {isAddingNew && (
                    <div className="form-group">
                      <label>{t('Password')}</label>
                      <input 
                        type="password" 
                        value={formData.password} 
                        onInput={(e) => setFormData({ ...formData, password: e.currentTarget.value })}
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label>{t('Role')}</label>
                    <select 
                      value={formData.role} 
                      onChange={(e) => setFormData({ ...formData, role: e.currentTarget.value as UserRole })}
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="TEACHER">TEACHER</option>
                      <option value="STUDENT">STUDENT</option>
                    </select>
                  </div>
                  <div className="form-actions">
                    <button className="cancel-button" onClick={() => { setEditingUserId(null); setIsAddingNew(false); }}>{t('Cancel')}</button>
                    <button className="save-button" onClick={handleSave}>{t('Save')}</button>
                  </div>
                </div>
              ) : (
                <div className="user-form">
                  <h3>{t('Reset Password')}</h3>
                  <p>{t('Resetting password for')}: {formData.email}</p>
                  <div className="form-group">
                    <label>{t('New Password')}</label>
                    <input 
                      type="password" 
                      value={newPassword} 
                      onInput={(e) => setNewPassword(e.currentTarget.value)}
                    />
                  </div>
                  <div className="form-actions">
                    <button className="cancel-button" onClick={() => setResetPasswordMode(false)}>{t('Cancel')}</button>
                    <button className="save-button" onClick={handleResetPassword}>{t('Reset')}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
