import { useState, useMemo, useRef, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import './LessonManager.css';

export interface SubjectOption {
  id: string;
  name: string;
  level: number;
  total?: number;
  remaining?: number;
  isSelectable?: boolean;
}

interface Props {
  label: string;
  options: SubjectOption[];
  valueId: string;
  valueName: string;
  onChange: (id: string, name: string) => void;
  disabled?: boolean;
}

export function SubjectSelector({ label, options, valueId, valueName, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState(valueName);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(valueName);
  }, [valueName]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const lowerSearch = searchTerm.toLowerCase();
    return options.filter(opt => opt.name.toLowerCase().includes(lowerSearch));
  }, [searchTerm, options]);

  return (
    <div className="form-group searchable-combo-container" ref={dropdownRef}>
      <label>{label}</label>
      <input
        type="text"
        className="combo-input"
        value={searchTerm}
        onInput={(e) => {
          const val = e.currentTarget.value;
          setSearchTerm(val);
        }}
        onFocus={() => setIsDropdownOpen(true)}
        placeholder={t('Search or enter {{resource}}', { resource: label })}
        disabled={disabled}
      />
      {isDropdownOpen && !disabled && (
        <div className="combo-dropdown">
          {filteredOptions.length > 0 ? (
            filteredOptions.map(opt => (
              <div
                key={opt.id || opt.name}
                className={`combo-item level-${opt.level} ${!opt.isSelectable ? 'not-selectable' : ''} ${opt.remaining !== undefined && opt.remaining <= 0 && opt.isSelectable ? 'no-remaining' : ''}`}
                onClick={() => {
                  if (opt.isSelectable) {
                    onChange(opt.id, opt.name);
                    setSearchTerm(opt.name);
                    setIsDropdownOpen(false);
                  }
                }}
              >
                <span className="item-name">{opt.name}</span>
                {opt.isSelectable && opt.remaining !== undefined && (
                  <span className="item-stats">({t('Remaining')}: {opt.remaining}/{opt.total})</span>
                )}
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
