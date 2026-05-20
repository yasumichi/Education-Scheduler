import { useState, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { CourseType, Subject, ResourceLabels, SystemSetting, Resource } from '../types';
import './CourseManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => Promise<void> | void;
  resources: Resource[];
  labels: ResourceLabels;
  systemSettings: SystemSetting | null;
  initialCourseId?: string | null;
  isAdmin?: boolean;
}

export function CourseManager({ backendUrl, onClose, onUpdate, resources, labels, systemSettings, initialCourseId, isAdmin = true }: Props) {
  const { t } = useTranslation();
  const [editingCourseId, setEditingCourseId] = useState<string | null>(initialCourseId || null);
  const [activeTab, setActiveTab] = useState<'basic' | 'subjects'>('basic');
  const [coursesList, setCoursesList] = useState<Resource[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showDuplicateLessons, setShowDuplicateLessons] = useState(false);
  
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  
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
    courseTypeId: string;
    subjects: { name: string; totalPeriods: number; subjectId: string | null }[];
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
    courseTypeId: '',
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
    fetchMasterData();
  }, [resources]);

  const fetchMasterData = async () => {
    try {
      const [typesRes, subjectsRes] = await Promise.all([
        fetch(`${backendUrl}/course-types`, { credentials: 'include' }),
        fetch(`${backendUrl}/subjects`, { credentials: 'include' })
      ]);
      if (typesRes.ok && subjectsRes.ok) {
        setCourseTypes(await typesRes.json());
        setAllSubjects(await subjectsRes.json());
      }
    } catch (err) {
      console.error('Failed to fetch master data:', err);
    }
  };

  useEffect(() => {
    setActiveTab('basic');
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
          courseTypeId: course.courseTypeId || '',
          subjects: course.subjects?.map(s => ({ 
            name: s.name || (s.subject?.name || ''), 
            totalPeriods: s.totalPeriods || (s.subject?.totalPeriods || 0),
            subjectId: s.subjectId || null
          })) || []
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
        courseTypeId: '',
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

  const handleBulkAddSubjects = () => {
    if (!formData.courseTypeId) {
      alert(t('Please select a {{resource}} first', { resource: labels.courseType }));
      return;
    }
    
    // Get master subjects for selected course type
    const typeSubjects = allSubjects.filter(s => s.courseTypeId === formData.courseTypeId);
    const sortedSubjects: Subject[] = [];
    
    const addChildren = (parentId: string | null) => {
      const children = typeSubjects
        .filter(s => s.parentId === parentId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      children.forEach(child => {
        sortedSubjects.push(child);
        addChildren(child.id);
      });
    };
    addChildren(null);

    // Filter only leaf subjects from the sorted list
    const leafSubjects = sortedSubjects.filter(s => !typeSubjects.some(child => child.parentId === s.id));
    
    // Check if current subjects are from the same CourseType
    const currentSubjects = formData.subjects;
    const isSameType = currentSubjects.length > 0 && currentSubjects.every(s => {
      const masterSub = allSubjects.find(ms => ms.id === s.subjectId);
      return masterSub && masterSub.courseTypeId === formData.courseTypeId;
    });

    if (isSameType) {
      // Reset totalPeriods for existing and find missing subjects
      const currentSubjectIds = new Set(currentSubjects.map(s => s.subjectId));
      const missingLeafSubjects = leafSubjects.filter(ls => !currentSubjectIds.has(ls.id));

      const updatedSubjects = currentSubjects.map(s => {
        const masterSub = allSubjects.find(ms => ms.id === s.subjectId);
        return {
          ...s,
          totalPeriods: masterSub ? (masterSub.totalPeriods || 0) : s.totalPeriods
        };
      });

      const addedSubjects = missingLeafSubjects.map(s => ({
        name: s.name,
        totalPeriods: s.totalPeriods || 0,
        subjectId: s.id
      }));

      setFormData({ ...formData, subjects: [...updatedSubjects, ...addedSubjects] });
    } else {
      // Replace with new subjects
      const newSubjects = leafSubjects.map(s => ({
        name: s.name,
        totalPeriods: s.totalPeriods || 0,
        subjectId: s.id
      }));
      setFormData({ ...formData, subjects: newSubjects });
    }
  };

  const handleSubjectChange = (index: number, field: 'name' | 'totalPeriods' | 'subjectId', value: any) => {
    const newSubjects = [...formData.subjects];
    if (field === 'subjectId') {
      const sub = allSubjects.find(s => s.id === value);
      newSubjects[index] = { 
        ...newSubjects[index], 
        subjectId: value,
        name: sub ? sub.name : newSubjects[index].name,
        totalPeriods: sub ? (sub.totalPeriods || 0) : newSubjects[index].totalPeriods
      };
    } else {
      newSubjects[index] = { ...newSubjects[index], [field]: value };
    }
    setFormData({ ...formData, subjects: newSubjects });
  };

  const toggleAssistantTeacher = (id: string) => {
    const newIds = formData.assistantTeacherIds.includes(id)
      ? formData.assistantTeacherIds.filter(tid => tid !== id)
      : [...formData.assistantTeacherIds, id];
    setFormData({ ...formData, assistantTeacherIds: newIds });
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
        alert(t('Failed to save {{resource}}', { resource: labels.course }));
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
        alert(t('Failed to delete {{resource}}', { resource: labels.course }));
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
        setStatusMessage(t('{{resource}} duplicated successfully', { resource: labels.course }));
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
      alert(t('Please select source {{resource}} and date range', { resource: labels.course }));
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

  const getSortedSubjects = () => {
    const typeSubjects = allSubjects.filter(sub => sub.courseTypeId === formData.courseTypeId);
    const sorted: Subject[] = [];

    const addChildren = (parentId: string | null, level: number) => {
      const children = typeSubjects
        .filter(s => s.parentId === parentId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      children.forEach(child => {
        sorted.push(child);
        addChildren(child.id, level + 1);
      });
    };

    addChildren(null, 1);
    return sorted;
  };

  const getSubjectHierarchy = (subjectId: string | null, defaultName: string) => {
    if (!subjectId) return { large: '', middle: '', small: defaultName, level: 3 };
    const sub = allSubjects.find(s => s.id === subjectId);
    if (!sub) return { large: '', middle: '', small: defaultName, level: 3 };

    let large = '';
    let middle = '';
    let small = '';
    const level = sub.level;

    if (level === 1) {
      large = sub.name;
    } else if (level === 2) {
      const parent = allSubjects.find(s => s.id === sub.parentId);
      large = parent?.name || '';
      middle = sub.name;
    } else if (level === 3) {
      const parent = allSubjects.find(s => s.id === sub.parentId);
      const grandparent = parent ? allSubjects.find(s => s.id === parent.parentId) : null;
      large = grandparent?.name || '';
      middle = parent?.name || '';
      small = sub.name;
    } else {
      small = sub.name;
    }

    return { large, middle, small, level };
  };

  const getEnrichedSubjects = () => {
    const sortedAll = getSortedSubjects();
    const enriched = formData.subjects.map((s, idx) => {
      const hierarchy = getSubjectHierarchy(s.subjectId, s.name || '');
      const masterSub = allSubjects.find(ms => ms.id === s.subjectId);
      return {
        ...s,
        ...hierarchy,
        originalIndex: idx,
        masterOrder: masterSub ? sortedAll.indexOf(masterSub) : 999999 + idx
      };
    });

    enriched.sort((a, b) => a.masterOrder - b.masterOrder);

    const rows = enriched.map((r, i) => {
      let largeSpan = 1;
      let middleSpan = 1;

      // Only merge rows that have the same level for large and middle
      if (i > 0 && enriched[i - 1].large === r.large && enriched[i - 1].level === r.level && r.large !== '') {
        largeSpan = 0;
      } else if (r.large !== '') {
        for (let j = i + 1; j < enriched.length; j++) {
          if (enriched[j].large === r.large && enriched[j].level === r.level) largeSpan++;
          else break;
        }
      }

      if (i > 0 && enriched[i - 1].large === r.large && enriched[i - 1].middle === r.middle && enriched[i - 1].level === r.level && r.middle !== '') {
        middleSpan = 0;
      } else if (r.middle !== '') {
        for (let j = i + 1; j < enriched.length; j++) {
          if (enriched[j].large === r.large && enriched[j].middle === r.middle && enriched[j].level === r.level) middleSpan++;
          else break;
        }
      }

      return { ...r, largeSpan, middleSpan };
    });

    return rows;
  };
  return (
    <div className="dialog-overlay">
      <div className="dialog-box course-manager-box">
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
                {isAdmin && (
                  <button className="add-button" onClick={() => setEditingCourseId('new')}>
                    {t('Add New {{resource}}', { resource: labels.course })}
                  </button>
                )}
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
              <div className="manager-list">
                <table>
                  <thead>
                    <tr>
                      {isAdmin && <th style={{ width: '30px' }}></th>}
                      {isAdmin && <th style={{ width: '70px' }}>{t('Move')}</th>}
                      <th>{t('Name')}</th>
                      <th>{t('Period')}</th>
                      <th>{labels.mainTeacher}</th>
                      <th>{labels.subTeacher}</th>
                      <th style={{ width: '120px' }}>{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCourses.map((c) => {
                      const listIdx = coursesList.findIndex(item => item.id === c.id);
                      return (
                        <tr key={c.id}
                            draggable={isAdmin}
                            onDragStart={() => isAdmin && handleDragStart(listIdx)}
                            onDragEnter={() => isAdmin && handleDragEnter(listIdx)}
                            onDragEnd={() => isAdmin && handleDragEnd()}
                            onDragOver={(e) => isAdmin && e.preventDefault()}
                            className={`draggable-row ${!isAdmin ? 'non-draggable' : ''}`}
                        >
                          {isAdmin && (
                            <td className="drag-handle">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
                                <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
                              </svg>
                            </td>
                          )}                          {isAdmin && (
                            <td>
                              <div className="move-buttons">
                                <button className="move-btn" onClick={() => moveItem(listIdx, 'up')} disabled={listIdx === 0}>↑</button>
                                <button className="move-btn" onClick={() => moveItem(listIdx, 'down')} disabled={listIdx === coursesList.length - 1}>↓</button>
                              </div>
                            </td>
                          )}
                          <td style={{ fontWeight: 'bold' }}>{c.name}</td>
                          <td>{c.startDate && c.endDate ? `${c.startDate} ~ ${c.endDate}` : '-'}</td>
                          <td>{c.chiefTeacherId ? getTeacherName(c.chiefTeacherId) : '-'}</td>
                          <td>
                            {(c.assistantTeacherIds || (c.assistantTeachers || []).map(t => t.id))
                              .map(tid => getTeacherName(tid)).join(', ') || '-'}
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button className="edit-btn" onClick={() => setEditingCourseId(c.id)}>{isAdmin ? t('Edit') : t('View')}</button>
                              {isAdmin && <button className="delete-btn" onClick={() => handleDelete(c.id)}>{t('Delete')}</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {isAdmin && <p className="hint-text">{t('Drag and drop rows or use arrows to change order')}</p>}
              </div>
            </>
          ) : (
            <div className="course-form">
              <h3>{editingCourseId === 'new' ? t('Add New {{resource}}', { resource: labels.course }) : (isAdmin ? t('Edit') : t('View'))}</h3>
              
              <div className="course-tabs">
                <button 
                  className={`course-tab ${activeTab === 'basic' ? 'active' : ''}`}
                  onClick={() => setActiveTab('basic')}
                >
                  {t('Basic Info')}
                </button>
                <button 
                  className={`course-tab ${activeTab === 'subjects' ? 'active' : ''}`}
                  onClick={() => setActiveTab('subjects')}
                >
                  {labels.subject}
                </button>
              </div>

              {activeTab === 'basic' && (
                <>
                  {showDuplicateLessons && isAdmin && (
                    <div className="duplicate-lessons-dialog">
                      <h3>{t('Duplicate Lessons from Another {{resource}}', { resource: labels.course })}</h3>
                      <div className="form-group">
                        <label>{t('Source {{resource}}', { resource: labels.course })}</label>
                        <select 
                          value={duplicationData.sourceCourseId}
                          onChange={(e) => setDuplicationData({ ...duplicationData, sourceCourseId: e.currentTarget.value })}
                        >
                          <option value="">{t('Select {{resource}}', { resource: labels.course })}</option>
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
                      <div className="footer-right">
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
                      readOnly={!isAdmin}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>{t('Start Date')}</label>
                      <input 
                        type="date" 
                        value={formData.startDate} 
                        onInput={(e) => setFormData({ ...formData, startDate: e.currentTarget.value })}
                        readOnly={!isAdmin}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t('End Date')}</label>
                      <input 
                        type="date" 
                        value={formData.endDate} 
                        onInput={(e) => setFormData({ ...formData, endDate: e.currentTarget.value })}
                        readOnly={!isAdmin}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t('Order')}</label>
                    <input 
                      type="number" 
                      value={formData.order} 
                      onInput={(e) => setFormData({ ...formData, order: parseInt(e.currentTarget.value) || 0 })}
                      readOnly={!isAdmin}
                    />
                  </div>

                  <div className="form-group">
                    <label>{labels.courseType}</label>
                    <select 
                      value={formData.courseTypeId} 
                      onChange={(e) => setFormData({ ...formData, courseTypeId: e.currentTarget.value })}
                      disabled={!isAdmin}
                    >
                      <option value="">{t('Select {{resource}}', { resource: labels.courseType })}</option>
                      {courseTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>{labels.mainRoom}</label>
                    <select 
                      value={formData.mainRoomId} 
                      onChange={(e) => setFormData({ ...formData, mainRoomId: e.currentTarget.value })}
                      disabled={!isAdmin}
                    >
                      <option value="">{t('Select {{resource}}', { resource: labels.room })}</option>
                      {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>{labels.mainTeacher}</label>
                      <select 
                        value={formData.chiefTeacherId} 
                        onChange={(e) => setFormData({ ...formData, chiefTeacherId: e.currentTarget.value })}
                        disabled={!isAdmin}
                      >
                        <option value="">{t('Select {{resource}}', { resource: labels.teacher })}</option>
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
                        readOnly={!isAdmin}
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
                                onChange={() => isAdmin && toggleAssistantTeacher(t.id)}
                                disabled={!isAdmin}
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
                        readOnly={!isAdmin}
                      />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'subjects' && (
                <div className="subjects-section" style={{ marginTop: 0 }}>
                  {isAdmin && (
                    <div className="subjects-actions" style={{ marginBottom: '10px' }}>
                      <button className="add-btn" onClick={handleBulkAddSubjects} style={{ backgroundColor: '#4a90e2' }}>
                        {t('Apply {{resource}}', { resource: labels.courseType })}
                      </button>
                    </div>
                  )}
                  <div className="subjects-table-container">
                    <table className="subjects-table">
                      <thead>
                        <tr>
                          <th>{labels.subjectLarge}</th>
                          <th>{labels.subjectMiddle}</th>
                          <th>{labels.subjectSmall}</th>
                          <th style={{ width: '100px' }}>{t('Total Periods')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getEnrichedSubjects().map((s, index) => (
                          <tr key={index}>
                            {s.largeSpan > 0 && (
                              <td rowSpan={s.largeSpan} colSpan={s.level === 1 ? 3 : 1}>
                                {s.large}
                              </td>
                            )}
                            {s.level >= 2 && s.middleSpan > 0 && (
                              <td rowSpan={s.middleSpan} colSpan={s.level === 2 ? 2 : 1}>
                                {s.middle}
                              </td>
                            )}
                            {s.level === 3 && (
                              <td>{s.small}</td>
                            )}
                            <td>
                              <input 
                                type="number" 
                                value={s.totalPeriods}
                                onInput={(e) => handleSubjectChange(s.originalIndex, 'totalPeriods', parseInt(e.currentTarget.value) || 0)}
                                readOnly={!isAdmin}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="dialog-footer">
          {editingCourseId ? (
            <>
              {isAdmin && editingCourseId !== 'new' && (
                <div className="footer-left">
                  <button className="delete-button" onClick={() => handleDelete(editingCourseId)}>{t('Delete')}</button>
                  <button className="duplicate-button" onClick={handleDuplicate}>{t('Duplicate {{resource}}', { resource: labels.course })}</button>
                  <button className="duplicate-lessons-btn" onClick={() => setShowDuplicateLessons(true)}>{t('Duplicate Lessons')}</button>
                </div>
              )}
              <div className="footer-right">
                <button className="cancel-button" onClick={() => isAdmin ? setEditingCourseId(null) : onClose()}>
                  {isAdmin ? t('Cancel') : t('Close')}
                </button>
                {isAdmin && <button className="save-button" onClick={handleSave}>{t('Save')}</button>}
              </div>
            </>
          ) : (
            <div className="footer-right">
              {isAdmin && <button className="save-order-button" onClick={handleSaveOrder}>{t('Save Order')}</button>}
              <button className="cancel-button" onClick={onClose}>{t('Close')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
