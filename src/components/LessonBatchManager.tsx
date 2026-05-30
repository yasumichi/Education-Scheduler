import { useState, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../utils/api';
import { Lesson, TimePeriod, Resource, Subject, Holiday, ResourceLabels } from '../types';
import { parseISO, format, addDays, getDay, isAfter, isBefore } from 'date-fns';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  course: Resource;
  periods: TimePeriod[];
  resources: Resource[];
  subjects: Subject[];
  labels: ResourceLabels;
  holidays: Holiday[];
}

export function LessonBatchManager({ backendUrl, onClose, onUpdate, course, periods, resources, subjects, labels, holidays }: Props) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    subjectId: '',
    startDate: course.startDate || '',
    endDate: course.endDate || '',
    daysOfWeek: [] as number[],
    startPeriodId: periods[0]?.id || '',
    endPeriodId: periods[0]?.id || '',
    teacherId: course.chiefTeacherId || '',
    subTeacherIds: course.assistantTeacherIds || [],
  });

  const subjectOptions = useMemo(() => {
    const courseSubjects = course.subjects || [];
    
    // 1. Identify all subject IDs that are explicitly linked to this course
    const linkedSubjectIds = new Set(courseSubjects.map(cs => cs.subjectId).filter(Boolean));
    
    // 2. Identify all relevant subject IDs (linked subjects + their ancestors)
    const relevantSubjectIds = new Set<string>();
    linkedSubjectIds.forEach(id => {
      let currentId: string | undefined | null = id;
      while (currentId) {
        relevantSubjectIds.add(currentId);
        const sub = subjects.find(s => s.id === currentId);
        currentId = sub?.parentId;
      }
    });

    // 3. Build hierarchy of relevant subjects only
    const hierarchicalList: any[] = [];
    const addChildren = (parentId: string | null) => {
      subjects
        .filter(s => (s.parentId || null) === parentId && relevantSubjectIds.has(s.id))
        .sort((a, b) => a.order - b.order)
        .forEach(s => {
          const cs = courseSubjects.find(cs => cs.subjectId === s.id);
          hierarchicalList.push({
            id: s.id,
            name: s.name,
            level: s.level,
            parentId: s.parentId,
            order: s.order,
            total: cs ? (cs.totalPeriods || 0) : 0,
            isSelectable: !!cs
          });
          addChildren(s.id);
        });
    };
    addChildren(null);
    return hierarchicalList;
  }, [course, subjects]);

  const filteredSubjects = useMemo(() => {
    if (!searchTerm) return subjectOptions;
    return subjectOptions.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm, subjectOptions]);

  const isHoliday = (date: Date) => {
    const d = format(date, 'yyyy-MM-dd');
    if (date.getDay() === 0 || date.getDay() === 6) return true;
    return holidays.some(h => h.date === d);
  };

  const handleBatchCreate = async () => {
    const lessons: any[] = [];
    let current = parseISO(formData.startDate);
    const end = parseISO(formData.endDate);

    while (!isAfter(current, end)) {
      if (formData.daysOfWeek.includes(getDay(current)) && !isHoliday(current)) {
        lessons.push({
          courseId: course.id,
          subjectId: formData.subjectId,
          startDate: format(current, 'yyyy-MM-dd'),
          endDate: format(current, 'yyyy-MM-dd'),
          startPeriodId: formData.startPeriodId,
          endPeriodId: formData.endPeriodId,
          teacherId: formData.teacherId,
          subTeacherIds: formData.subTeacherIds,
        });
      }
      current = addDays(current, 1);
    }

    try {
      const res = await apiFetch(`${backendUrl}/lessons/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessons }),
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to create lessons'));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-box" style="width: 500px;">
        <div className="dialog-header">
          <h2>{t('Bulk Create Lessons')}</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="dialog-content">
          <div className="form-group searchable-combo-container">
            <label>{labels.subject}</label>
            <input 
              type="text"
              value={searchTerm}
              onFocus={() => setIsDropdownOpen(true)}
              onInput={e => { setSearchTerm(e.currentTarget.value); setIsDropdownOpen(true); }}
              placeholder={t('Search or enter {{resource}}', { resource: labels.subject })}
            />
            {isDropdownOpen && (
              <div className="combo-dropdown">
                {filteredSubjects.length > 0 ? (
                  filteredSubjects.map(opt => (
                    <div key={opt.id || opt.name}
                         className={`combo-item level-${opt.level}`}
                         onClick={() => {
                           setFormData({...formData, subject: opt.name, subjectId: opt.id});
                           setSearchTerm(opt.name);
                           setIsDropdownOpen(false);
                         }}>
                      {opt.name}
                    </div>
                  ))
                ) : (
                  <div className="combo-no-results">{t('No matches found')}</div>
                )}
              </div>
            )}
          </div>
          <div className="form-group">
            <label>{t('Days of Week')}</label>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              {[0, 1, 2, 3, 4, 5, 6].map(d => (
                <label key={d}>
                  <input type="checkbox" checked={formData.daysOfWeek.includes(d)} onChange={e => {
                    const days = e.currentTarget.checked ? [...formData.daysOfWeek, d] : formData.daysOfWeek.filter(x => x !== d);
                    setFormData({...formData, daysOfWeek: days});
                  }} />
                  {t(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])}
                </label>
              ))}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t('Start Date')}</label>
              <input type="date" value={formData.startDate} onInput={e => setFormData({...formData, startDate: e.currentTarget.value})} />
            </div>
            <div className="form-group">
              <label>{t('End Date')}</label>
              <input type="date" value={formData.endDate} onInput={e => setFormData({...formData, endDate: e.currentTarget.value})} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t('Start Period')}</label>
              <select value={formData.startPeriodId} onChange={e => setFormData({...formData, startPeriodId: e.currentTarget.value})}>
                {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>{t('End Period')}</label>
              <select value={formData.endPeriodId} onChange={e => setFormData({...formData, endPeriodId: e.currentTarget.value})}>
                {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <button className="save-button" onClick={handleBatchCreate}>{t('Create')}</button>
        </div>
      </div>
    </div>
  );
}
