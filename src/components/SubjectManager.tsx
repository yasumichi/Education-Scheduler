import { useState, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { CourseType, Subject, ResourceLabels } from '../types';
import './SubjectManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  labels: ResourceLabels;
}

export function SubjectManager({ backendUrl, onClose, onUpdate, labels }: Props) {
  const { t } = useTranslation();
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<Partial<CourseType> | null>(null);
  const [editingSubject, setEditingSubject] = useState<Partial<Subject> | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [isModified, setIsModified] = useState(false);
  const [systemSettings, setSystemSettings] = useState<any>(null);

  // Filters for CourseType
  const [typeFilters, setTypeFilters] = useState({
    name: '',
    startDate: '',
    endDate: ''
  });

  // For Drag and Drop
  const dragItemRef = useRef<{ id: string, parentId: string | null, level: number } | null>(null);
  const dragOverItemRef = useRef<{ id: string, parentId: string | null, level: number } | null>(null);

  useEffect(() => {
    fetchData();
    fetchSettings();
  }, []);

  // Filter application
  useEffect(() => {
    fetchCourseTypes();
  }, [typeFilters]);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${backendUrl}/settings`, { credentials: 'include' });
      if (res.ok) setSystemSettings(await res.json());
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  const fetchData = async () => {
    try {
      const subjectsRes = await fetch(`${backendUrl}/subjects`, { credentials: 'include' });
      if (subjectsRes.ok) {
        const subs = await subjectsRes.json();
        setSubjects(subs.sort((a: Subject, b: Subject) => (a.order || 0) - (b.order || 0)));
      }
      await fetchCourseTypes();
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
    setIsModified(false);
  };

  const fetchCourseTypes = async () => {
    try {
      const params = new URLSearchParams();
      if (typeFilters.name) params.append('name', typeFilters.name);
      if (typeFilters.startDate) params.append('startDate', typeFilters.startDate);
      if (typeFilters.endDate) params.append('endDate', typeFilters.endDate);

      const res = await fetch(`${backendUrl}/course-types?${params.toString()}`, { credentials: 'include' });
      if (res.ok) {
        const types = await res.json();
        setCourseTypes(types);
        if (types.length > 0 && !selectedTypeId) {
          setSelectedTypeId(types[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch course types:', err);
    }
  };

  const getDefaultDates = () => {
    if (!systemSettings) return { start: '', end: '' };
    const now = new Date();
    let year = now.getFullYear();
    const threshold = new Date(year, systemSettings.yearViewStartMonth - 1, systemSettings.yearViewStartDay);
    if (now < threshold) year -= 1;

    const start = new Date(year, systemSettings.yearViewStartMonth - 1, systemSettings.yearViewStartDay);
    const end = new Date(year + 1, systemSettings.yearViewStartMonth - 1, systemSettings.yearViewStartDay);
    end.setDate(end.getDate() - 1);

    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      start: `${year}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
      end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
    };
  };

  const handleDuplicateType = async (id: string) => {
    if (!confirm(t('Are you sure you want to duplicate this course type and all its subjects?'))) return;
    try {
      const res = await fetch(`${backendUrl}/course-types/${id}/duplicate`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const newType = await res.json();
        await fetchData();
        setSelectedTypeId(newType.id);
      } else {
        alert(t('Failed to duplicate course type'));
      }
    } catch (err) {
      console.error('Failed to duplicate course type:', err);
    }
  };

  const toggleNode = (id: string) => {
    const next = new Set(expandedNodes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedNodes(next);
  };

  const handleMoveSubject = (subjectId: string, direction: 'up' | 'down') => {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;

    const siblings = subjects
      .filter(s => (s.parentId ?? null) === (subject.parentId ?? null) && s.courseTypeId === subject.courseTypeId && s.level === subject.level)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const index = siblings.findIndex(s => s.id === subjectId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    const newSubjects = [...subjects];
    const targetSubject = siblings[targetIndex];
    
    // Swap orders
    const tempOrder = subject.order;
    const s1 = newSubjects.find(s => s.id === subject.id)!;
    const s2 = newSubjects.find(s => s.id === targetSubject.id)!;
    s1.order = targetSubject.order;
    s2.order = tempOrder;

    setSubjects(newSubjects.sort((a, b) => (a.order || 0) - (b.order || 0)));
    setIsModified(true);
  };

  const handleDragStart = (subject: Subject) => {
    dragItemRef.current = { id: subject.id, parentId: subject.parentId ?? null, level: subject.level };
  };

  const handleDragEnter = (subject: Subject) => {
    if (dragItemRef.current && 
        dragItemRef.current.parentId === (subject.parentId ?? null) && 
        dragItemRef.current.level === subject.level &&
        dragItemRef.current.id !== subject.id) {
      dragOverItemRef.current = { id: subject.id, parentId: subject.parentId ?? null, level: subject.level };
    } else {
      dragOverItemRef.current = null;
    }
  };

  const handleDragEnd = () => {
    if (!dragItemRef.current || !dragOverItemRef.current) {
      dragItemRef.current = null;
      dragOverItemRef.current = null;
      return;
    }

    const newSubjects = [...subjects];
    const siblings = newSubjects
      .filter(s => (s.parentId ?? null) === dragItemRef.current!.parentId && s.courseTypeId === selectedTypeId && s.level === dragItemRef.current!.level)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const fromIdx = siblings.findIndex(s => s.id === dragItemRef.current!.id);
    const toIdx = siblings.findIndex(s => s.id === dragOverItemRef.current!.id);

    const [movedItem] = siblings.splice(fromIdx, 1);
    siblings.splice(toIdx, 0, movedItem);

    // Re-assign orders based on new sequence
    siblings.forEach((s, idx) => {
      const original = newSubjects.find(ns => ns.id === s.id)!;
      original.order = idx + 1;
    });

    setSubjects(newSubjects.sort((a, b) => (a.order || 0) - (b.order || 0)));
    setIsModified(true);
    dragItemRef.current = null;
    dragOverItemRef.current = null;
  };

  const handleSaveOrder = async () => {
    try {
      const res = await fetch(`${backendUrl}/subjects/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orders: subjects.map(s => ({ id: s.id, order: s.order }))
        })
      });
      if (res.ok) {
        alert(t('Order saved successfully'));
        setIsModified(false);
        onUpdate();
      } else {
        alert(t('Failed to save order'));
      }
    } catch (err) {
      console.error('Error saving subject order:', err);
    }
  };

  // --- CourseType Handlers ---
  const handleSaveType = async () => {
    if (!editingType?.name) return;
    try {
      const res = await fetch(`${backendUrl}/course-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editingType)
      });
      if (res.ok) {
        setEditingType(null);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to save course type:', err);
    }
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm(t('Are you sure?'))) return;
    try {
      const res = await fetch(`${backendUrl}/course-types/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to delete course type:', err);
    }
  };

  // --- Subject Handlers ---
  const handleSaveSubject = async () => {
    if (!editingSubject?.name) return;
    try {
      const res = await fetch(`${backendUrl}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...editingSubject, courseTypeId: selectedTypeId })
      });
      if (res.ok) {
        setEditingSubject(null);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to save subject:', err);
    }
  };

  const handleDeleteSubject = async (id: string) => {
    if (!confirm(t('Are you sure?'))) return;
    try {
      const res = await fetch(`${backendUrl}/subjects/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to delete subject:', err);
    }
  };

  const handleImportCSV = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(line => line.trim());
      // Skip header if it exists (e.g., if first line contains "Large" or "大課目")
      const startIdx = (lines[0].includes('Large') || lines[0].includes('Subject') || lines[0].includes('課目')) ? 1 : 0;
      
      const rows = lines.slice(startIdx).map(line => {
        const [large, middle, small, totalPeriods, order] = line.split(',').map(s => s.trim());
        return { 
          large: large || '', 
          middle: middle || '', 
          small: small || '', 
          totalPeriods: totalPeriods ? parseInt(totalPeriods) : null,
          order: order ? parseInt(order) : 0
        };
      });

      // Front-end pre-processing to fill in omissions (optional as backend also handles it, but good for clarity)
      let currentLarge = '';
      let currentMiddle = '';
      const processedRows = rows.map(row => {
        if (row.large) {
          currentLarge = row.large;
          currentMiddle = '';
        }
        if (row.middle) {
          currentMiddle = row.middle;
        }
        return {
          ...row,
          large: row.large || currentLarge,
          middle: row.middle || (row.large ? '' : currentMiddle)
        };
      });

      try {
        const res = await fetch(`${backendUrl}/course-types/${selectedTypeId}/import-subjects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ rows: processedRows })
        });
        if (res.ok) {
          alert(t('Import successful'));
          fetchData();
        } else {
          const errData = await res.json();
          alert(`${t('Import failed')}: ${errData.error}`);
        }
      } catch (err) {
        console.error('Failed to import subjects:', err);
        alert(t('Import failed'));
      }
    };
    reader.readAsText(file);
  };

  const renderSubjectNode = (subject: Subject, level: number) => {
    const children = subjects.filter(s => s.parentId === subject.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(subject.id);

    const siblings = subjects
      .filter(s => (s.parentId ?? null) === (subject.parentId ?? null) && s.courseTypeId === subject.courseTypeId && s.level === subject.level)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const index = siblings.findIndex(s => s.id === subject.id);

    return (
      <div key={subject.id} 
           className={`tree-node node-level-${level} draggable-node`}
           draggable
           onDragStart={() => handleDragStart(subject)}
           onDragEnter={() => handleDragEnter(subject)}
           onDragEnd={handleDragEnd}
           onDragOver={(e) => e.preventDefault()}
      >
        <div className="node-content">
          <div className="drag-handle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
              <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
            </svg>
          </div>
          <div className="node-toggle" onClick={() => toggleNode(subject.id)}>
            {level < 3 && (hasChildren ? (isExpanded ? '▼' : '▶') : '○')}
          </div>
          <div className="node-main">
            <span className="item-name">{subject.name}</span>
            {(!hasChildren || level === 3) && subject.totalPeriods !== null && (
              <span className="node-periods">{subject.totalPeriods} {t('periods')}</span>
            )}
          </div>
          <div className="item-actions">
            <div className="move-buttons">
              <button className="icon-btn move-btn" onClick={() => handleMoveSubject(subject.id, 'up')} disabled={index === 0}>↑</button>
              <button className="icon-btn move-btn" onClick={() => handleMoveSubject(subject.id, 'down')} disabled={index === siblings.length - 1}>↓</button>
            </div>
            <button className="icon-btn" onClick={() => setEditingSubject(subject)}>✎</button>
            {level < 3 && (
              <button className="icon-btn" onClick={() => setEditingSubject({ level: level + 1, parentId: subject.id })}>＋</button>
            )}
            <button className="icon-btn" onClick={() => handleDeleteSubject(subject.id)}>×</button>
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div className="children-container">
            {children.map(child => renderSubjectNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredSubjects = subjects.filter(s => s.courseTypeId === selectedTypeId && !s.parentId);

  return (
    <div className="subject-manager-overlay">
      <div className="subject-manager-box">
        <div className="subject-manager-header">
          <h2>{t('Manage {{resource}}', { resource: labels.subject })}</h2>
          <button className="icon-btn" style={{ fontSize: '1.5rem' }} onClick={onClose}>×</button>
        </div>

        <div className="subject-manager-content">
          {/* CourseType Section */}
          <div className="type-section">
            <div className="section-header">
              <h3>{labels.courseType}</h3>
              <button className="add-btn" onClick={() => {
                const dates = getDefaultDates();
                setEditingType({ name: '', order: courseTypes.length + 1, startDate: dates.start, endDate: dates.end });
              }}>{t('Add')}</button>
            </div>

            <div className="type-filters">
              <input 
                type="text" 
                placeholder={t('Filter by name')} 
                value={typeFilters.name}
                onInput={(e) => setTypeFilters({ ...typeFilters, name: e.currentTarget.value })}
              />
              <div className="date-filters">
                <input 
                  type="date" 
                  value={typeFilters.startDate}
                  onInput={(e) => setTypeFilters({ ...typeFilters, startDate: e.currentTarget.value })}
                  title={t('Start Date')}
                />
                <span>~</span>
                <input 
                  type="date" 
                  value={typeFilters.endDate}
                  onInput={(e) => setTypeFilters({ ...typeFilters, endDate: e.currentTarget.value })}
                  title={t('End Date')}
                />
              </div>
            </div>

            <div className="item-list">
              {courseTypes.map(type => (
                <div key={type.id} className={`manager-item ${selectedTypeId === type.id ? 'active' : ''}`} onClick={() => setSelectedTypeId(type.id)}>
                  <div className="item-main">
                    <span className="item-name">{type.name}</span>
                    <span className="item-period">{type.startDate && type.endDate ? `${type.startDate} ~ ${type.endDate}` : t('No period')}</span>
                  </div>
                  <div className="item-actions">
                    <button className="icon-btn" title={t('Duplicate')} onClick={(e) => { e.stopPropagation(); handleDuplicateType(type.id); }}>⧉</button>
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setEditingType(type); }}>✎</button>
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleDeleteType(type.id); }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subject Section */}
          <div className="hierarchy-section">
            <div className="section-header">
              <h3>{labels.subject}</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="add-btn" onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.csv';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleImportCSV(file);
                  };
                  input.click();
                }}>{t('Import CSV')}</button>
                <button className="add-btn" onClick={() => setEditingSubject({ level: 1, parentId: null, name: '' })}>{t('Add')}</button>
              </div>
            </div>
            <div className="subject-tree">
              {filteredSubjects.map(s => renderSubjectNode(s, 1))}
            </div>
            {isModified && (
              <div className="save-order-container">
                <button className="save-order-btn" onClick={handleSaveOrder}>{t('Save Order')}</button>
              </div>
            )}
            <p className="hint-text">{t('Drag and drop rows or use arrows to change order')}</p>
          </div>
        </div>

        <div className="subject-manager-footer">
          <button className="close-btn" onClick={onClose}>{t('Close')}</button>
        </div>
      </div>

      {/* Edit CourseType Modal */}
      {editingType && (
        <div className="edit-modal-overlay">
          <div className="edit-modal">
            <h3>{editingType.id ? t('Edit') : t('Add')} {labels.courseType}</h3>
            <div className="form-group">
              <label>{t('Name')}</label>
              <input type="text" value={editingType.name} onInput={(e) => setEditingType({ ...editingType, name: e.currentTarget.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t('Start Date')}</label>
                <input type="date" value={editingType.startDate || ''} onInput={(e) => setEditingType({ ...editingType, startDate: e.currentTarget.value })} />
              </div>
              <div className="form-group">
                <label>{t('End Date')}</label>
                <input type="date" value={editingType.endDate || ''} onInput={(e) => setEditingType({ ...editingType, endDate: e.currentTarget.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>{t('Order')}</label>
              <input type="number" value={editingType.order} onInput={(e) => setEditingType({ ...editingType, order: parseInt(e.currentTarget.value) })} />
            </div>
            <div className="modal-actions">
              <button className="close-btn" onClick={() => setEditingType(null)}>{t('Cancel')}</button>
              <button className="add-btn" onClick={handleSaveType}>{t('Save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Subject Modal */}
      {editingSubject && (
        <div className="edit-modal-overlay">
          <div className="edit-modal">
            <h3>{editingSubject.id ? t('Edit') : t('Add')} {
              editingSubject.level === 1 ? labels.subjectLarge :
              editingSubject.level === 2 ? labels.subjectMiddle :
              labels.subjectSmall
            }</h3>
            <div className="form-group">
              <label>{t('Name')}</label>
              <input type="text" value={editingSubject.name} onInput={(e) => setEditingSubject({ ...editingSubject, name: e.currentTarget.value })} />
            </div>
            {(() => {
              const hasChildren = subjects.some(s => s.parentId === editingSubject.id);
              if (!hasChildren || editingSubject.level === 3) {
                return (
                  <div className="form-group">
                    <label>{t('Total Periods')}</label>
                    <input type="number" value={editingSubject.totalPeriods || 0} onInput={(e) => setEditingSubject({ ...editingSubject, totalPeriods: parseInt(e.currentTarget.value) })} />
                  </div>
                );
              }
              return null;
            })()}
            <div className="form-group">
              <label>{t('Order')}</label>
              <input type="number" value={editingSubject.order || 0} onInput={(e) => setEditingSubject({ ...editingSubject, order: parseInt(e.currentTarget.value) })} />
            </div>
            <div className="modal-actions">
              <button className="close-btn" onClick={() => setEditingSubject(null)}>{t('Cancel')}</button>
              <button className="add-btn" onClick={handleSaveSubject}>{t('Save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
