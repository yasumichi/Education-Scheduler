import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Resource, ResourceLabels } from '../types';
import './CourseManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => Promise<void> | void;
  resources: Resource[];
  labels: ResourceLabels;
  initialCourseId?: string | null;
}

export function CourseManager({ backendUrl, onClose, onUpdate, resources, labels, initialCourseId }: Props) {
  const { t } = useTranslation();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(initialCourseId || null);

  useEffect(() => {
    if (initialCourseId) {
      setSelectedCourseId(initialCourseId);
    }
  }, [initialCourseId]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showDuplicateLessons, setShowDuplicateLessons] = useState(false);
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

  const courses = resources.filter(r => r.type === 'course');
  const rooms = resources.filter(r => r.type === 'room');
  const teachers = resources.filter(r => r.type === 'teacher');

  useEffect(() => {
    if (selectedCourseId) {
      const course = courses.find(c => c.id === selectedCourseId);
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
    } else {
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
  }, [selectedCourseId]);

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

      // Remove BOM if present
      if (text.charCodeAt(0) === 0xFEFF) {
        text = text.substring(1);
      }

      try {
        const lines = text.split(/\r?\n/);
        const importedSubjects: { name: string; totalPeriods: number }[] = [];
        
        lines.forEach((line, index) => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;

          // Simple CSV split that handles quotes
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
          
          // Skip header if it's the first line and totalPeriods is not a number
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
    // Reset input
    e.currentTarget.value = '';
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`${backendUrl}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          id: selectedCourseId,
          ...formData
        })
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to save course'));
      }
    } catch (err) {
      console.error('Error saving course:', err);
    }
  };

  const handleDelete = async () => {
    if (!selectedCourseId) return;
    if (!confirm(t('Are you sure you want to delete this course?'))) return;

    try {
      const res = await fetch(`${backendUrl}/courses/${selectedCourseId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to delete course'));
      }
    } catch (err) {
      console.error('Error deleting course:', err);
    }
  };

  const handleDuplicate = async () => {
    if (!selectedCourseId) return;
    try {
      const res = await fetch(`${backendUrl}/courses/${selectedCourseId}/duplicate`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        // データを再取得
        await onUpdate();
        // 新しい講座を選択状態にする
        setSelectedCourseId(data.id);
        // メッセージを表示
        setStatusMessage(t('Course duplicated successfully'));
        // 数秒後にメッセージを消す
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        alert(t('Failed to duplicate {{resource}}', { resource: labels.course }));
      }
    } catch (err) {
      console.error('Error duplicating course:', err);
    }
  };

  const handleDuplicateLessons = async () => {
    if (!selectedCourseId || !duplicationData.sourceCourseId || !duplicationData.startDate || !duplicationData.endDate) {
      alert(t('Please select source course and date range'));
      return;
    }

    // バリデーション: 複製先の講座の範囲内か
    const destinationCourse = courses.find(c => c.id === selectedCourseId);
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
      const res = await fetch(`${backendUrl}/courses/${selectedCourseId}/duplicate-lessons`, {
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
          <div className="course-selector">
            <label>{t('Select {{resource}} to Edit', { resource: labels.course })}</label>
            <select 
              value={selectedCourseId || ''} 
              onChange={(e) => setSelectedCourseId(e.currentTarget.value || null)}
            >
              <option value="">{t('Add New {{resource}}', { resource: labels.course })}</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

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
                  {courses.filter(c => c.id !== selectedCourseId).map(c => (
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

          <div className="course-form">
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
                <div className="sub-teacher-list" style={{ maxHeight: '100px' }}>
                  {teachers.filter(t => t.id !== formData.chiefTeacherId).map(t => (
                    <label key={t.id} className={`sub-teacher-item ${formData.assistantTeacherIds.includes(t.id) ? 'selected' : ''}`}>
                      <input 
                        type="checkbox" 
                        checked={formData.assistantTeacherIds.includes(t.id)}
                        onChange={() => toggleAssistantTeacher(t.id)}
                      />
                      {t.name}
                    </label>
                  ))}
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
        </div>

        <div className="dialog-footer">
          {selectedCourseId && (
            <div className="footer-left">
              <button className="delete-button" onClick={handleDelete}>{t('Delete')}</button>
              <button className="duplicate-button" onClick={handleDuplicate}>{t('Duplicate Course')}</button>
              <button className="duplicate-lessons-btn" onClick={() => setShowDuplicateLessons(true)}>{t('Duplicate Lessons')}</button>
            </div>
          )}
          <div className="footer-right">
            <button className="cancel-button" onClick={onClose}>{t('Cancel')}</button>
            <button className="save-button" onClick={handleSave}>{t('Save Changes')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
