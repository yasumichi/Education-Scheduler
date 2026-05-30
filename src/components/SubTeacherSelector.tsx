import { Resource } from '../types';
import { useTranslation } from 'react-i18next';
import './LessonManager.css';

interface Props {
  label: string;
  teachers: Resource[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabledId?: string;
  disabled?: boolean;
}

export function SubTeacherSelector({ label, teachers, selectedIds, onChange, disabledId, disabled }: Props) {
  const { t } = useTranslation();

  const toggleTeacher = (id: string) => {
    const newIds = selectedIds.includes(id)
      ? selectedIds.filter(sid => sid !== id)
      : [...selectedIds, id];
    onChange(newIds);
  };

  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="sub-teacher-list" style="display: flex; gap: 10px; flex-wrap: wrap;">
        {teachers.map(t => (
          <label key={t.id} className={`sub-teacher-item ${selectedIds.includes(t.id) ? 'selected' : ''} ${disabled || t.id === disabledId ? 'disabled' : ''}`}>
            <input
              type="checkbox"
              checked={selectedIds.includes(t.id)}
              disabled={disabled || t.id === disabledId}
              onChange={() => toggleTeacher(t.id)}
            />
            {t.name}
          </label>
        ))}
      </div>
    </div>
  );
}
