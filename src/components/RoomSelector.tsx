import { useState, useMemo, useRef, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Resource } from '../types';
import './LessonManager.css';

interface Props {
  label: string;
  rooms: Resource[];
  valueId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function RoomSelector({ label, rooms, valueId, onChange, disabled }: Props) {
  const { t: translate } = useTranslation();
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

  const filteredRooms = useMemo(() => {
    if (!searchTerm) return rooms;
    const lowerSearch = searchTerm.toLowerCase();
    return rooms.filter(r => r.name.toLowerCase().includes(lowerSearch));
  }, [searchTerm, rooms]);

  return (
    <div className="form-group searchable-combo-container" ref={dropdownRef}>
      <label>{label}</label>
      <input 
        type="text"
        className="combo-input"
        value={searchTerm || rooms.find(r => r.id === valueId)?.name || ''}
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
        placeholder={translate('Search or enter {{resource}}', { resource: label })}
        disabled={disabled}
      />
      {isDropdownOpen && !disabled && (
        <div className="combo-dropdown">
          {filteredRooms.length > 0 ? (
            filteredRooms.map(room => (
              <div 
                key={room.id} 
                className="combo-item"
                onClick={() => {
                  onChange(room.id);
                  setSearchTerm('');
                  setIsDropdownOpen(false);
                }}
              >
                {room.name}
              </div>
            ))
          ) : (
            <div className="combo-no-results">{translate('No matches found')}</div>
          )}
        </div>
      )}
    </div>
  );
}
