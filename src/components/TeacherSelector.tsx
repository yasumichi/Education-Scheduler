import { useState, useMemo, useRef, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Resource } from '../types';
import './LessonManager.css';

interface Props {
  label: string;
  teachers: Resource[];
  valueId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function TeacherSelector({ label, teachers, valueId, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredTeachers = useMemo(() => {
    if (!searchTerm) return teachers;
    const lowerSearch = searchTerm.toLowerCase();
    return teachers.filter(t => t.name.toLowerCase().includes(lowerSearch));
  }, [searchTerm, teachers]);

  return (
    <div className="form-group searchable-combo-container" ref={dropdownRef}>
      <label>{label}</label>
      <input 
        type="text"
        className="combo-input"
        value={searchTerm || teachers.find(t => t.id === valueId)?.name || ''}
        onFocus={() => setIsDropdownOpen(true)}
        onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
        onInput={(e) => {
          const val = e.currentTarget.value;
          setSearchTerm(val);
          setIsDropdownOpen(true);
          if (val === '') {
            onChange('');
          }
        }}
        placeholder={t('Search or enter {{resource}}', { resource: label })}
        disabled={disabled}
      />
      {isDropdownOpen && !disabled && (
        <div className="combo-dropdown">
          {filteredTeachers.length > 0 ? (
            filteredTeachers.map(t => (
              <div 
                key={t.id} 
                className="combo-item"
                onClick={() => {
                  onChange(t.id);
                  setSearchTerm('');
                  setIsDropdownOpen(false);
                }}
              >
                {t.name}
              </div>
            ))
          ) : (
            <div className="combo-no-results">{t('No matches found')}</div>
          )}
        </div>
      )}
    </div>
  );
}
