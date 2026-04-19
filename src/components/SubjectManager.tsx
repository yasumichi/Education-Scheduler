import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { CourseType, Subject, ResourceLabels } from '../types';
import './SubjectManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  labels: ResourceLabels;
}

export function SubjectManager({ backendUrl, onClose, labels }: Props) {
  const { t } = useTranslation();
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<Partial<CourseType> | null>(null);
  const [editingSubject, setEditingSubject] = useState<Partial<Subject> | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [typesRes, subjectsRes] = await Promise.all([
        fetch(`${backendUrl}/course-types`, { credentials: 'include' }),
        fetch(`${backendUrl}/subjects`, { credentials: 'include' })
      ]);
      if (typesRes.ok && subjectsRes.ok) {
        const types = await typesRes.json();
        const subs = await subjectsRes.json();
        setCourseTypes(types);
        setSubjects(subs);
        if (types.length > 0 && !selectedTypeId) {
          setSelectedTypeId(types[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  };

  const toggleNode = (id: string) => {
    const next = new Set(expandedNodes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedNodes(next);
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

    return (
      <div key={subject.id} className={`tree-node node-level-${level}`}>
        <div className="node-content">
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
          <h2>{t('Manage Subjects')}</h2>
          <button className="icon-btn" style={{ fontSize: '1.5rem' }} onClick={onClose}>×</button>
        </div>

        <div className="subject-manager-content">
          {/* CourseType Section */}
          <div className="type-section">
            <div className="section-header">
              <h3>{labels.courseType}</h3>
              <button className="add-btn" onClick={() => setEditingType({ name: '', order: courseTypes.length + 1 })}>{t('Add')}</button>
            </div>
            <div className="item-list">
              {courseTypes.map(type => (
                <div key={type.id} className={`manager-item ${selectedTypeId === type.id ? 'active' : ''}`} onClick={() => setSelectedTypeId(type.id)}>
                  <span className="item-name">{type.name}</span>
                  <div className="item-actions">
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
