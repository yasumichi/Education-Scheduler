import { useState, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Resource, ResourceLabels, SystemSetting } from '../types';
import './CourseManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => Promise<void> | void;
  resources: Resource[];
  labels: ResourceLabels;
  systemSettings: SystemSetting | null;
  initialCourseId?: string | null;
}

export function CourseManager({ backendUrl, onClose, onUpdate, resources, labels, systemSettings, initialCourseId }: Props) {
  const { t } = useTranslation();
  const [editingCourseId, setEditingCourseId] = useState<string | null>(initialCourseId || null);
  const [coursesList, setCoursesList] = useState<Resource[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showDuplicateLessons, setShowDuplicateLessons] = useState(false);
  
  // システム設定から開始月日を取得
  const startMonth = systemSettings?.yearViewStartMonth ?? 4;
  const startDay = systemSettings?.yearViewStartDay ?? 1;

  // 年度期間を計算 (YYYY-MM-DD 形式)
  const getYearRange = (year: number) => {
    const start = new Date(year, startMonth - 1, startDay);
    const end = new Date(year + 1, startMonth - 1, startDay);
    end.setDate(end.getDate() - 1);
    
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      start: `${year}-${pad(startMonth)}-${pad(startDay)}`,
      end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
    };
  };

  // 指定された日付がどの年度に属するか計算
  const getAcademicYear = (dateStr: string) => {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const threshold = new Date(y, startMonth - 1, startDay);
    return d < threshold ? y - 1 : y;
  };

  const getInitialYear = () => {
    const now = new Date();
    const y = now.getFullYear();
    const threshold = new Date(y, startMonth - 1, startDay);
    return now < threshold ? y - 1 : y;
  };

  const [selectedYear, setSelectedYear] = useState<number>(getInitialYear());
  const [duplicationData, setDuplicationData] = useState({
    sourceCourseId: '',
    startDate: '',
    endDate: ''
  });
  const [formData, setFormData] = useState<{
    name: string;
    order: number;
    startDate: string;
    endDate: string;
    mainRoomId: string;
    chiefTeacherId: string;
    assistantTeacherIds: string[];
    mainTeacherLabel: string;
    subTeacherLabel: string;
    subjects: { name: string; totalPeriods: number }[];
  }>({
    name: '',
    order: 0,
    startDate: '',
    endDate: '',
    mainRoomId: '',
    chiefTeacherId: '',
    assistantTeacherIds: [],
    mainTeacherLabel: '',
    subTeacherLabel: '',
    subjects: []
  });

  // ドラッグ&ドロップ用の参照
  const dragItemRef = useRef<number | null>(null);
  const dragOverItemRef = useRef<number | null>(null);

  const courses = resources.filter(r => r.type === 'course').sort((a, b) => (a.order || 0) - (b.order || 0));
  const rooms = resources.filter(r => r.type === 'room');
  const teachers = resources.filter(r => r.type === 'teacher');

  useEffect(() => {
    setCoursesList(courses);
  }, [resources]);

  useEffect(() => {
    if (editingCourseId && editingCourseId !== 'new') {
      const course = courses.find(c => c.id === editingCourseId);
      if (course) {
        setFormData({
          name: course.name,
          order: course.order || 0,
          startDate: course.startDate || '',
          endDate: course.endDate || '',
          mainRoomId: course.mainRoomId || '',
          chiefTeacherId: course.chiefTeacherId || '',
          assistantTeacherIds: course.assistantTeacherIds || (course.assistantTeachers || []).map(t => t.id),
          mainTeacherLabel: course.mainTeacherLabel || '',
          subTeacherLabel: course.subTeacherLabel || '',
          subjects: course.subjects?.map(s => ({ name: s.name, totalPeriods: s.totalPeriods })) || []
        });
      }
    } else if (editingCourseId === 'new') {
      setFormData({
        name: '',
        order: (courses.length + 1),
        startDate: '',
        endDate: '',
        mainRoomId: '',
        chiefTeacherId: '',
        assistantTeacherIds: [],
        mainTeacherLabel: '',
        subTeacherLabel: '',
        subjects: []
      });
    }
  }, [editingCourseId, resources]);

  // 年度の選択肢を生成
  const availableYears = Array.from(new Set(courses.flatMap(c => {
    const years: number[] = [];
    if (c.startDate) years.push(getAcademicYear(c.startDate));
    if (c.endDate) years.push(getAcademicYear(c.endDate));
    return years;
  }))).sort((a, b) => b - a);

  const initialYear = getInitialYear();
  if (!availableYears.includes(initialYear)) {
    availableYears.push(initialYear);
    availableYears.sort((a, b) => b - a);
  }

  // 表示する講座のフィルタリング (選択された年度に重なるもの)
  const filteredCourses = coursesList.filter(c => {
    if (!c.startDate || !c.endDate) return true;
    const range = getYearRange(selectedYear);
    return c.startDate <= range.end && c.endDate >= range.start;
  });

  const handleAddSubject = () => {
    setFormData({
      ...formData,
      subjects: [...formData.subjects, { name: '', totalPeriods: 0 }]
    });
  };

  const handleRemoveSubject = (index: number) => {
    setFormData({
      ...formData,
      subjects: formData.subjects.filter((_, i) => i !== index)
    });
  };

  const handleSubjectChange = (index: number, field: 'name' | 'totalPeriods', value: string | number) => {
    const newSubjects = [...formData.subjects];
    newSubjects[index] = { ...newSubjects[index], [field]: value };
    setFormData({ ...formData, subjects: newSubjects });
  };

  const toggleAssistantTeacher = (id: string) => {
    const newIds = formData.assistantTeacherIds.includes(id)
      ? formData.assistantTeacherIds.filter(tid => tid !== id)
      : [...formData.assistantTeacherIds, id];
    setFormData({ ...formData, assistantTeacherIds: newIds });
  };

  const handleImportCSV = (e: any) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      let text = event.target?.result as string;
      if (!text) return;

      if (text.charCodeAt(0) === 0xFEFF) {
        text = text.substring(1);
      }

      try {
        const lines = text.split(/\r?\n/);
        const importedSubjects: { name: string; totalPeriods: number }[] = [];
        
        lines.forEach((line, index) => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;

          const parts = trimmedLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => {
            let val = s.trim();
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.substring(1, val.length - 1).replace(/""/g, '"');
            }
            return val;
          });

          if (parts.length < 2) return;

          const [name, totalPeriodsStr] = parts;
          const totalPeriods = parseInt(totalPeriodsStr);
          
          if (index === 0 && isNaN(totalPeriods)) return;

          if (name && !isNaN(totalPeriods)) {
            importedSubjects.push({ name, totalPeriods });
          }
        });

        if (importedSubjects.length > 0) {
          setFormData({ ...formData, subjects: [...formData.subjects, ...importedSubjects] });
        }
      } catch (err) {
        console.error('Error parsing CSV:', err);
        alert(t('Failed to parse CSV file'));
      }
    };
    reader.readAsText(file);
    e.currentTarget.value = '';
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert(t('Please enter a name'));
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          id: editingCourseId === 'new' ? null : editingCourseId,
          ...formData
        })
      });
      if (res.ok) {
        await onUpdate();
        setEditingCourseId(null);
      } else {
        alert(t('Failed to save course'));
      }
    } catch (err) {
      console.error('Error saving course:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('Are you sure you want to delete this {{resource}}?', { resource: labels.course }))) return;

    try {
      const res = await fetch(`${backendUrl}/courses/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        await onUpdate();
        if (editingCourseId === id) setEditingCourseId(null);
      } else {
        alert(t('Failed to delete course'));
      }
    } catch (err) {
      console.error('Error deleting course:', err);
    }
  };

  const handleDuplicate = async () => {
    if (!editingCourseId || editingCourseId === 'new') return;
    try {
      const res = await fetch(`${backendUrl}/courses/${editingCourseId}/duplicate`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        await onUpdate();
        setEditingCourseId(data.id);
        setStatusMessage(t('Course duplicated successfully'));
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        alert(t('Failed to duplicate {{resource}}', { resource: labels.course }));
      }
    } catch (err) {
      console.error('Error duplicating course:', err);
    }
  };

  const handleDuplicateLessons = async () => {
    if (!editingCourseId || !duplicationData.sourceCourseId || !duplicationData.startDate || !duplicationData.endDate) {
      alert(t('Please select source course and date range'));
      return;
    }

    const destinationCourse = courses.find(c => c.id === editingCourseId);
    if (destinationCourse) {
      if (destinationCourse.startDate && duplicationData.startDate < destinationCourse.startDate) {
        alert(`${t('Start date cannot be before')} ${destinationCourse.startDate}`);
        return;
      }
      if (destinationCourse.endDate && duplicationData.endDate > destinationCourse.endDate) {
        alert(`${t('End date cannot be after')} ${destinationCourse.endDate}`);
        return;
      }
    }

    try {
      const res = await fetch(`${backendUrl}/courses/${editingCourseId}/duplicate-lessons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(duplicationData)
      });
      if (res.ok) {
        const data = await res.json();
        setStatusMessage(t('Successfully duplicated {{count}} lessons', { count: data.count }));
        setShowDuplicateLessons(false);
        setDuplicationData({ sourceCourseId: '', startDate: '', endDate: '' });
        await onUpdate();
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        const errData = await res.json();
        alert(errData.error || t('Failed to duplicate lessons'));
      }
    } catch (err) {
      console.error('Error duplicating lessons:', err);
      alert(t('Error duplicating lessons'));
    }
  };

  // 順序変更ロジック
  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newCourses = [...coursesList];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newCourses.length) return;

    const [movedItem] = newCourses.splice(index, 1);
    newCourses.splice(targetIndex, 0, movedItem);
    setCoursesList(newCourses);
  };

  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItemRef.current = index;
  };

  const handleDragEnd = () => {
    if (dragItemRef.current === null || dragOverItemRef.current === null) return;
    const newCourses = [...coursesList];
    const [movedItem] = newCourses.splice(dragItemRef.current, 1);
    newCourses.splice(dragOverItemRef.current, 0, movedItem);
    dragItemRef.current = null;
    dragOverItemRef.current = null;
    setCoursesList(newCourses);
  };

  const handleSaveOrder = async () => {
    try {
      const res = await fetch(`${backendUrl}/courses/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orders: coursesList.map((c, idx) => ({ id: c.id, order: idx + 1 }))
        })
      });
      if (res.ok) {
        await onUpdate();
        alert(t('Settings saved successfully'));
      } else {
        alert(t('Failed to save settings'));
      }
    } catch (err) {
      console.error('Error saving course order:', err);
    }
  };

  const getTeacherName = (id: string) => teachers.find(t => t.id === id)?.name || id;

  return (
    <div className="course-manager-overlay">
      <div className="course-manager-box">
        <div className="dialog-header">
          <h2>{t('Manage {{resource}}', { resource: labels.course })}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {statusMessage && (
          <div className="status-message-banner">
            {statusMessage}
          </div>
        )}

        <div className="course-manager-content">
          {!editingCourseId ? (
            <>
              <div className="header-actions">
                <button className="add-button" onClick={() => setEditingCourseId('new')}>
                  {t('Add New {{resource}}', { resource: labels.course })}
                </button>
                <div className="year-filter">
                  <label>{t('Year')}:</label>
                  <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.currentTarget.value))}>
                    {availableYears.map(y => {
                      const range = getYearRange(y);
                      const startLabel = range.start.replace(/-/g, '/');
                      const endLabel = range.end.replace(/-/g, '/');
                      return (
                        <option key={y} value={y}>
                          {y} ({startLabel} ~ {endLabel})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div className="course-list">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '30px' }}></th>
                      <th style={{ width: '70px' }}>{t('Move')}</th>
                      <th>{t('Name')}</th>
                      <th>{t('Period')}</th>
                      <th>{labels.mainTeacher}</th>
                      <th>{labels.subTeacher}</th>
                      <th style={{ width: '120px' }}>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCourses.map((c, idx) => {
                      const listIdx = coursesList.findIndex(item => item.id === c.id);
                      return (
                        <tr key={c.id}
                            draggable
                            onDragStart={() => handleDragStart(listIdx)}
                            onDragEnter={() => handleDragEnter(listIdx)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => e.preventDefault()}
                            className="draggable-row"
                        >
                          <td className="drag-handle">⋮⋮</td>
                          <td>
                            <div className="move-buttons">
                              <button className="move-btn" onClick={() => moveItem(listIdx, 'up')} disabled={listIdx === 0}>↑</button>
                              <button className="move-btn" onClick={() => moveItem(listIdx, 'down')} disabled={listIdx === coursesList.length - 1}>↓</button>
                            </div>
                          </td>
                          <td style={{ fontWeight: 'bold' }}>{c.name}</td>
                          <td>{c.startDate && c.endDate ? `${c.startDate} ~ ${c.endDate}` : '-'}</td>
                          <td>{c.chiefTeacherId ? getTeacherName(c.chiefTeacherId) : '-'}</td>
                          <td>
                            {(c.assistantTeacherIds || (c.assistantTeachers || []).map(t => t.id))
                              .map(tid => getTeacherName(tid)).join(', ') || '-'}
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button className="edit-btn" onClick={() => setEditingCourseId(c.id)}>{t('Edit')}</button>
                              <button className="delete-btn" onClick={() => handleDelete(c.id)}>{t('Delete')}</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="hint-text">{t('Drag and drop rows or use arrows to change order')}</p>
              <div className="list-footer">
                <button className="save-order-button" onClick={handleSaveOrder}>{t('Save Order')}</button>
              </div>
            </>
          ) : (
            <div className="course-form">
              <h3>{editingCourseId === 'new' ? t('Add New {{resource}}', { resource: labels.course }) : t('Edit')}</h3>
              
              {showDuplicateLessons && (
                <div className="duplicate-lessons-dialog">
                  <h3>{t('Duplicate Lessons from Another Course')}</h3>
                  <div className="form-group">
                    <label>{t('Source Course')}</label>
                    <select 
                      value={duplicationData.sourceCourseId}
                      onChange={(e) => setDuplicationData({ ...duplicationData, sourceCourseId: e.currentTarget.value })}
                    >
                      <option value="">{t('Select Course')}</option>
                      {courses.filter(c => c.id !== editingCourseId).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>{t('Start Date')}</label>
                      <input 
                        type="date" 
                        value={duplicationData.startDate}
                        onInput={(e) => setDuplicationData({ ...duplicationData, startDate: e.currentTarget.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t('End Date')}</label>
                      <input 
                        type="date" 
                        value={duplicationData.endDate}
                        onInput={(e) => setDuplicationData({ ...duplicationData, endDate: e.currentTarget.value })}
                      />
                    </div>
                  </div>
                  <div className="dialog-actions">
                    <button className="cancel-button" onClick={() => setShowDuplicateLessons(false)}>{t('Cancel')}</button>
                    <button className="confirm-button" onClick={handleDuplicateLessons}>{t('Duplicate Now')}</button>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>{t('{{resource}} Name', { resource: labels.course })}</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onInput={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{t('Start Date')}</label>
                  <input 
                    type="date" 
                    value={formData.startDate} 
                    onInput={(e) => setFormData({ ...formData, startDate: e.currentTarget.value })}
                  />
                </div>
                <div className="form-group">
                  <label>{t('End Date')}</label>
                  <input 
                    type="date" 
                    value={formData.endDate} 
                    onInput={(e) => setFormData({ ...formData, endDate: e.currentTarget.value })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>{t('Order')}</label>
                <input 
                  type="number" 
                  value={formData.order} 
                  onInput={(e) => setFormData({ ...formData, order: parseInt(e.currentTarget.value) || 0 })}
                />
              </div>

              <div className="form-group">
                <label>{labels.mainRoom}</label>
                <select 
                  value={formData.mainRoomId} 
                  onChange={(e) => setFormData({ ...formData, mainRoomId: e.currentTarget.value })}
                >
                  <option value="">{t('Select Room')}</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>{labels.mainTeacher}</label>
                  <select 
                    value={formData.chiefTeacherId} 
                    onChange={(e) => setFormData({ ...formData, chiefTeacherId: e.currentTarget.value })}
                  >
                    <option value="">{t('Select Teacher')}</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('Instructor Label (Main)')}</label>
                  <input 
                    type="text" 
                    value={formData.mainTeacherLabel} 
                    onInput={(e) => setFormData({ ...formData, mainTeacherLabel: e.currentTarget.value })}
                    placeholder={labels.mainTeacher}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>{labels.subTeacher}</label>
                  <div className="sub-teacher-list" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                    {(() => {
                      const list = teachers.filter(t => t.id !== formData.chiefTeacherId);
                      const selected = list.filter(t => formData.assistantTeacherIds.includes(t.id));
                      const unselected = list.filter(t => !formData.assistantTeacherIds.includes(t.id));
                      return [...selected, ...unselected].map(t => (
                        <label key={t.id} className={`sub-teacher-item ${formData.assistantTeacherIds.includes(t.id) ? 'selected' : ''}`}>
                          <input 
                            type="checkbox" 
                            checked={formData.assistantTeacherIds.includes(t.id)}
                            onChange={() => toggleAssistantTeacher(t.id)}
                          />
                          {t.name}
                        </label>
                      ));
                    })()}
                  </div>
                </div>
                <div className="form-group">
                  <label>{t('Instructor Label (Sub)')}</label>
                  <input 
                    type="text" 
                    value={formData.subTeacherLabel} 
                    onInput={(e) => setFormData({ ...formData, subTeacherLabel: e.currentTarget.value })}
                    placeholder={labels.subTeacher}
                  />
                </div>
              </div>

              <div className="subjects-section">
                <h3>{labels.subject}</h3>
                {formData.subjects.map((s, index) => (
                  <div key={index} className="subject-row">
                    <input 
                      type="text" 
                      placeholder={t('{{resource}} Name', { resource: labels.subject })}
                      value={s.name}
                      onInput={(e) => handleSubjectChange(index, 'name', e.currentTarget.value)}
                    />
                    <input 
                      type="number" 
                      placeholder={t('Total Periods')}
                      value={s.totalPeriods}
                      onInput={(e) => handleSubjectChange(index, 'totalPeriods', parseInt(e.currentTarget.value) || 0)}
                    />
                    <button className="remove-btn" onClick={() => handleRemoveSubject(index)}>×</button>
                  </div>
                ))}
                <div className="subjects-actions">
                  <button className="add-btn" onClick={handleAddSubject}>{t('Add {{resource}}', { resource: labels.subject })}</button>
                  <label className="import-csv-label">
                    <input
                      type="file"
                      accept=".csv"
                      style={{ display: 'none' }}
                      onChange={handleImportCSV}
                    />
                    <span className="import-btn">{t('Import CSV')}</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          {editingCourseId && editingCourseId !== 'new' && (
            <div className="footer-left">
              <button className="delete-button" onClick={() => handleDelete(editingCourseId)}>{t('Delete')}</button>
              <button className="duplicate-button" onClick={handleDuplicate}>{t('Duplicate Course')}</button>
              <button className="duplicate-lessons-btn" onClick={() => setShowDuplicateLessons(true)}>{t('Duplicate Lessons')}</button>
            </div>
          )}
          <div className="footer-right">
            <button className="cancel-button" onClick={() => setEditingCourseId(null)}>{t('Cancel')}</button>
            {editingCourseId && (
              <button className="save-button" onClick={handleSave}>{t('Save Changes')}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
