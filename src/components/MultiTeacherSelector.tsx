import { useMemo } from 'preact/hooks';
import { Resource } from '../types';
import { useTranslation } from 'react-i18next';
import './LessonManager.css';

interface Props {
  label: string;
  teachers: Resource[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  bookedIds?: string[];
  disabledId?: string;
  disabled?: boolean;
}

export function MultiTeacherSelector({ label, teachers, selectedIds, onChange, bookedIds, disabledId, disabled }: Props) {
  const { t: translate } = useTranslation();

  const toggleTeacher = (id: string) => {
    const newIds = selectedIds.includes(id)
      ? selectedIds.filter(sid => sid !== id)
      : [...selectedIds, id];
    onChange(newIds);
  };

  const sortedTeachers = useMemo(() => {
    return [...teachers].sort((a, b) => {
      const aSelected = selectedIds.includes(a.id);
      const bSelected = selectedIds.includes(b.id);
      if (aSelected === bSelected) return 0;
      return aSelected ? -1 : 1;
    });
  }, [teachers, selectedIds]);

  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="sub-teacher-list" style="display: flex; gap: 10px; flex-wrap: wrap;">
        {sortedTeachers.map(teacher => (
          <label key={teacher.id} className={`sub-teacher-item ${selectedIds.includes(teacher.id) ? 'selected' : ''} ${bookedIds?.includes(teacher.id) ? 'booked' : ''} ${disabled || teacher.id === disabledId ? 'disabled' : ''}`}>
            <input
              type="checkbox"
              checked={selectedIds.includes(teacher.id)}
              disabled={disabled || teacher.id === disabledId}
              onChange={() => toggleTeacher(teacher.id)}
            />
            {teacher.name}
            {bookedIds?.includes(teacher.id) && <span style="font-size: 0.7rem; margin-left: 5px;">({translate('Booked')})</span>}
          </label>
        ))}
      </div>
    </div>
  );
}
