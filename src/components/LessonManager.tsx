import { useState, useEffect, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Lesson, TimePeriod, Resource, ResourceLabels, DeliveryMethod, User } from '../types';
import { parseISO, differenceInDays } from 'date-fns';
import './LessonManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  periods: TimePeriod[];
  resources: Resource[];
  lessons: Lesson[];
  labels: ResourceLabels;
  initialLesson?: Partial<Lesson>;
  user: User;
}

export function LessonManager({ backendUrl, onClose, onUpdate, periods, resources, lessons, labels, initialLesson, user }: Props) {
  const { t } = useTranslation();
  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethod[]>([]);
  
  const [formData, setFormData] = useState<{
    id?: string;
    subject: string;
    teacherId: string;
    subTeacherIds: string[];
    roomId: string;
    courseId: string;
    location: string;
    deliveryMethodIds: string[];
    startDate: string;
    startPeriodId: string;
    endDate: string;
    endPeriodId: string;
    remarks: string;
    externalTeacher: string;
    externalSubTeachers: string;
  }>({
    id: initialLesson?.id,
    subject: initialLesson?.subject || '',
    teacherId: initialLesson?.teacherId || '',
    subTeacherIds: initialLesson?.subTeacherIds || (initialLesson?.subTeachers || []).map(t => t.id),
    roomId: initialLesson?.roomId || '',
    courseId: initialLesson?.courseId || '',
    location: initialLesson?.location || '',
    deliveryMethodIds: initialLesson?.deliveryMethodIds || (initialLesson?.deliveryMethods || []).map(m => m.id),
    startDate: initialLesson?.startDate || '',
    startPeriodId: initialLesson?.startPeriodId || periods[0]?.id || 'p1',
    endDate: initialLesson?.endDate || initialLesson?.startDate || '',
    endPeriodId: initialLesson?.endPeriodId || initialLesson?.startPeriodId || periods[0]?.id || 'p1',
    remarks: initialLesson?.remarks || '',
    externalTeacher: initialLesson?.externalTeacher || '',
    externalSubTeachers: initialLesson?.externalSubTeachers || '',
  });

  useEffect(() => {
    const fetchDeliveryMethods = async () => {
      try {
        const res = await fetch(`${backendUrl}/delivery-methods`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setDeliveryMethods(data);
        }
      } catch (err) {
        console.error('Failed to fetch delivery methods:', err);
      }
    };
    fetchDeliveryMethods();
  }, [backendUrl]);

  const teachers = resources.filter(r => r.type === 'teacher');
  const rooms = resources.filter(r => r.type === 'room');
  const courses = resources.filter(r => r.type === 'course');

  const selectedCourse = useMemo(() => courses.find(c => c.id === formData.courseId), [formData.courseId, courses]);
  const mainTeacherLabel = labels.mainTeacher;
  const subTeacherLabel = labels.subTeacher;

  const canManage = useMemo(() => {
    if (user.role === 'ADMIN') return true;
    if (user.role !== 'TEACHER' || !user.resourceId || !selectedCourse) return false;

    const isChief = selectedCourse.chiefTeacherId === user.resourceId;
    const isAssistant = (selectedCourse.assistantTeachers || []).some(t => t.id === user.resourceId);
    
    return isChief || isAssistant;
  }, [user, selectedCourse]);

  const canLimitedEdit = useMemo(() => {
    if (canManage) return true;
    if (user.role !== 'TEACHER' || !user.resourceId || !formData.id) return false;

    const isLessonMain = formData.teacherId === user.resourceId;
    const isLessonSub = formData.subTeacherIds.includes(user.resourceId);

    return isLessonMain || isLessonSub;
  }, [canManage, user, formData.id, formData.teacherId, formData.subTeacherIds]);

  // 講座が変更された際のメイン教室の自動入力
  useEffect(() => {
    if (!formData.id && selectedCourse?.mainRoomId) {
      setFormData(prev => ({
        ...prev,
        roomId: prev.roomId || selectedCourse.mainRoomId || ''
      }));
    }
  }, [formData.courseId, selectedCourse]);

  // 選択された講座に関連する課目と残り時限の計算
  const subjectOptions = useMemo(() => {
    const course = selectedCourse;
    if (!course || !course.subjects) return [];

    return course.subjects.map(s => {
      // 既存の授業から、この講座・この課目の時限数を合計
      const scheduledPeriods = lessons
        .filter(l => l.courseId === formData.courseId && l.subject === s.name && l.id !== formData.id)
        .reduce((sum, l) => {
          const sIdx = periods.findIndex(p => p.id === l.startPeriodId);
          const eIdx = periods.findIndex(p => p.id === l.endPeriodId);
          if (sIdx === -1 || eIdx === -1) return sum;

          if (l.startDate === l.endDate) {
            return sum + (eIdx - sIdx + 1);
          } else {
            const numDays = differenceInDays(parseISO(l.endDate), parseISO(l.startDate));
            return sum + (periods.length - sIdx) + (numDays - 1) * periods.length + (eIdx + 1);
          }
        }, 0);

      return {
        name: s.name,
        total: s.totalPeriods || 0,
        remaining: (s.totalPeriods || 0) - scheduledPeriods
      };
    });
  }, [formData.courseId, formData.id, lessons, courses, periods, selectedCourse]);

  const handleSave = async () => {
    // Basic validation
    if (!formData.courseId || !formData.subject) {
      alert(t('Please select all required fields ({{course}}, {{subject}})', { 
        course: labels.course, 
        subject: labels.subject 
      }));
      return;
    }

    // Room or Location validation
    if (!formData.roomId && !formData.location) {
      alert(t('Please select a Room or enter a Location'));
      return;
    }

    // Date range validation
    if (formData.endDate < formData.startDate) {
      alert(t('End date cannot be before start date'));
      return;
    }

    // Period order validation (if same day)
    const sPeriodIdx = periods.findIndex(p => p.id === formData.startPeriodId);
    const ePeriodIdx = periods.findIndex(p => p.id === formData.endPeriodId);
    if (formData.startDate === formData.endDate) {
      if (ePeriodIdx < sPeriodIdx) {
        alert(t('End period cannot be before start period'));
        return;
      }
    }

    // Validate date range against course
    const selectedCourseData = selectedCourse;
    if (selectedCourseData && selectedCourseData.startDate && selectedCourseData.endDate) {
      if (formData.startDate < selectedCourseData.startDate || formData.endDate > selectedCourseData.endDate) {
        alert(`${t('Lesson date must be between')} ${selectedCourseData.startDate} ${t('and')} ${selectedCourseData.endDate}`);
        return;
      }
    }

    // Double-booking validation
    const checkResources = [
      formData.roomId,
      formData.teacherId,
      ...formData.subTeacherIds
    ].filter(id => id && id !== '');

    const getAbsTime = (date: string, pId: string) => {
      const pIdx = periods.findIndex(p => p.id === pId);
      return `${date}-${pIdx.toString().padStart(3, '0')}`;
    };

    const formStart = getAbsTime(formData.startDate, formData.startPeriodId);
    const formEnd = getAbsTime(formData.endDate, formData.endPeriodId);

    const isDoubleBooked = lessons.some(l => {
      if (l.id === formData.id) return false;

      // Check time overlap using absolute timestamps (date + period index)
      const lStart = getAbsTime(l.startDate, l.startPeriodId);
      const lEnd = getAbsTime(l.endDate, l.endPeriodId);
      
      const timeOverlap = formStart <= lEnd && lStart <= formEnd;

      if (!timeOverlap) return false;

      // Check resource overlap
      const lResources = [l.roomId, l.teacherId, ...(l.subTeacherIds || [])].filter(id => id && id !== '');
      return checkResources.some(rid => lResources.includes(rid));
    });

    if (isDoubleBooked) {
      if (!confirm(t('Warning: One or more resources are already booked for this time. Do you want to proceed anyway?'))) {
        return;
      }
    }

    try {
      const res = await fetch(`${backendUrl}/lessons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          teacherId: formData.teacherId || null,
          roomId: formData.roomId || null,
          location: formData.location || null,
          remarks: formData.remarks || null,
          externalTeacher: formData.externalTeacher || null,
          externalSubTeachers: formData.externalSubTeachers || null,
          deliveryMethodIds: formData.deliveryMethodIds
        })
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to save lesson'));
      }
    } catch (err) {
      console.error('Error saving lesson:', err);
    }
  };

  const handleDelete = async () => {
    if (!formData.id) return;
    if (!confirm(t('Are you sure you want to delete this lesson?'))) return;

    try {
      const res = await fetch(`${backendUrl}/lessons/${formData.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        onUpdate();
        onClose();
      } else {
        alert(t('Failed to delete lesson'));
      }
    } catch (err) {
      console.error('Error deleting lesson:', err);
    }
  };

  const toggleSubTeacher = (id: string) => {
    const newIds = formData.subTeacherIds.includes(id)
      ? formData.subTeacherIds.filter(tid => tid !== id)
      : [...formData.subTeacherIds, id];
    setFormData({ ...formData, subTeacherIds: newIds });
  };

  const toggleDeliveryMethod = (id: string) => {
    const newIds = formData.deliveryMethodIds.includes(id)
      ? formData.deliveryMethodIds.filter(did => did !== id)
      : [...formData.deliveryMethodIds, id];
    setFormData({ ...formData, deliveryMethodIds: newIds });
  };

  return (
    <div className="lesson-manager-overlay">
      <div className="lesson-manager-box">
        <div className="dialog-header">
          <h2>
            {formData.id ? t('Edit Lesson') : t('Create Lesson')}
            {!canManage && canLimitedEdit && <span className="readonly-badge limited"> ({t('Limited Edit')})</span>}
            {!canManage && !canLimitedEdit && <span className="readonly-badge"> ({t('Read-only')})</span>}
          </h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="lesson-manager-content">
          <div className="form-group">
            <label>{labels.course} *</label>
            {canManage ? (
              <select 
                value={formData.courseId} 
                onChange={(e) => setFormData({ ...formData, courseId: e.currentTarget.value, subject: '' })}
                disabled={!canManage}
              >
                <option value="">{t('Select Course')}</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <span className="readonly-value">{courses.find(c => c.id === formData.courseId)?.name || '-'}</span>
            )}
          </div>

          <div className="form-group">
            <label>{labels.subject} *</label>
            {canManage ? (
              <select 
                value={formData.subject} 
                onChange={(e) => setFormData({ ...formData, subject: e.currentTarget.value })}
                disabled={!canManage || !formData.courseId}
              >
                <option value="">{t('Select {{resource}}', { resource: labels.subject })}</option>
                {subjectOptions.map(s => (
                  <option key={s.name || ''} value={s.name || ''} disabled={s.remaining <= 0}>
                    {s.name} ({t('Remaining')}: {s.remaining}/{s.total})
                  </option>
                ))}
              </select>
            ) : (
              <span className="readonly-value">{formData.subject || '-'}</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('Start Date')} *</label>
              {canManage ? (
                <input 
                  type="date" 
                  value={formData.startDate} 
                  onInput={(e) => setFormData({ ...formData, startDate: e.currentTarget.value })}
                  disabled={!canManage}
                />
              ) : (
                <span className="readonly-value">{formData.startDate || '-'}</span>
              )}
            </div>
            <div className="form-group">
              <label>{t('End Date')} *</label>
              {canManage ? (
                <input 
                  type="date" 
                  value={formData.endDate} 
                  onInput={(e) => setFormData({ ...formData, endDate: e.currentTarget.value })}
                  disabled={!canManage}
                />
              ) : (
                <span className="readonly-value">{formData.endDate || '-'}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('Start Period')}</label>
              {canManage ? (
                <select 
                  value={formData.startPeriodId} 
                  onChange={(e) => setFormData({ ...formData, startPeriodId: e.currentTarget.value })}
                  disabled={!canManage}
                >
                  {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <span className="readonly-value">{periods.find(p => p.id === formData.startPeriodId)?.name || '-'}</span>
              )}
            </div>
            <div className="form-group">
              <label>{t('End Period')}</label>
              {canManage ? (
                <select 
                  value={formData.endPeriodId} 
                  onChange={(e) => setFormData({ ...formData, endPeriodId: e.currentTarget.value })}
                  disabled={!canManage}
                >
                  {periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <span className="readonly-value">{periods.find(p => p.id === formData.endPeriodId)?.name || '-'}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('Room')}</label>
              {canManage ? (
                <select 
                  value={formData.roomId} 
                  onChange={(e) => setFormData({ ...formData, roomId: e.currentTarget.value })}
                  disabled={!canManage}
                >
                  <option value="">{t('Select Room')}</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              ) : (
                <span className="readonly-value">{rooms.find(r => r.id === formData.roomId)?.name || '-'}</span>
              )}
            </div>
            <div className="form-group">
              <label>{t('Location (if no room)')}</label>
              {canManage ? (
                <input 
                  type="text" 
                  value={formData.location} 
                  onInput={(e) => setFormData({ ...formData, location: e.currentTarget.value })}
                  placeholder={t('e.g. Online, Gym')}
                  disabled={!canManage}
                />
              ) : (
                <span className="readonly-value">{formData.location || '-'}</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>{mainTeacherLabel}</label>
            {canManage ? (
              <div className="teacher-selection">
                <select 
                  value={formData.teacherId} 
                  onChange={(e) => {
                    const newTeacherId = e.currentTarget.value;
                    setFormData({ 
                      ...formData, 
                      teacherId: newTeacherId,
                      subTeacherIds: formData.subTeacherIds.filter(id => id !== newTeacherId)
                    });
                  }}
                  disabled={!canManage}
                >
                  <option value="">{t('Select Teacher')}</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input 
                  type="text" 
                  value={formData.externalTeacher} 
                  onInput={(e) => setFormData({ ...formData, externalTeacher: e.currentTarget.value })}
                  placeholder={t('External Teacher (if not managed)')}
                  disabled={!canManage}
                  style={{ marginTop: '5px' }}
                />
              </div>
            ) : (
              <div className="readonly-teacher">
                <span className="readonly-value">{teachers.find(t => t.id === formData.teacherId)?.name || '-'}</span>
                {formData.externalTeacher && <span className="readonly-value"> ({formData.externalTeacher})</span>}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>{subTeacherLabel}</label>
            {canManage ? (
              <div className="sub-teacher-container">
                <div className="sub-teacher-list">
                  {(() => {
                    const list = teachers.filter(t => t.id !== formData.teacherId);
                    const selected = list.filter(t => formData.subTeacherIds.includes(t.id));
                    const unselected = list.filter(t => !formData.subTeacherIds.includes(t.id));
                    return [...selected, ...unselected].map(t => (
                      <label key={t.id} className={`sub-teacher-item ${formData.subTeacherIds.includes(t.id) ? 'selected' : ''} ${!canManage ? 'disabled' : ''}`}>
                        <input 
                          type="checkbox" 
                          checked={formData.subTeacherIds.includes(t.id)}
                          onChange={() => toggleSubTeacher(t.id)}
                          disabled={!canManage}
                        />
                        {t.name}
                      </label>
                    ));
                  })()}
                </div>
                <input 
                  type="text" 
                  value={formData.externalSubTeachers} 
                  onInput={(e) => setFormData({ ...formData, externalSubTeachers: e.currentTarget.value })}
                  placeholder={t('External Sub Teachers (comma separated)')}
                  disabled={!canManage}
                  style={{ marginTop: '5px' }}
                />
              </div>
            ) : (
              <div className="readonly-sub-teachers">
                <span className="readonly-value">
                  {teachers.filter(t => formData.subTeacherIds.includes(t.id)).map(t => t.name).join(', ') || '-'}
                </span>
                {formData.externalSubTeachers && <span className="readonly-value"> ({formData.externalSubTeachers})</span>}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>{t('Remarks')}</label>
            {canLimitedEdit ? (
              <textarea 
                value={formData.remarks} 
                onInput={(e) => setFormData({ ...formData, remarks: e.currentTarget.value })}
                placeholder={t('Notes, special instructions, etc.')}
                disabled={!canLimitedEdit}
                rows={3}
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              />
            ) : (
              <div className="readonly-value remarks-value" style={{ whiteSpace: 'pre-wrap' }}>{formData.remarks || '-'}</div>
            )}
          </div>

          <div className="form-group">
            <label>{labels.deliveryMethod}</label>
            <div className="delivery-method-list">
              {(() => {
                const selected = deliveryMethods.filter(m => formData.deliveryMethodIds.includes(m.id));
                const unselected = deliveryMethods.filter(m => !formData.deliveryMethodIds.includes(m.id));
                return [...selected, ...unselected].map(m => (
                  <label key={m.id} className={`delivery-method-item ${formData.deliveryMethodIds.includes(m.id) ? 'selected' : ''} ${!canLimitedEdit ? 'disabled' : ''}`}>
                    <input 
                      type="checkbox" 
                      checked={formData.deliveryMethodIds.includes(m.id)}
                      onChange={() => toggleDeliveryMethod(m.id)}
                      disabled={!canLimitedEdit}
                    />
                    {m.name}
                  </label>
                ));
              })()}
              {deliveryMethods.length === 0 && (
                <span className="empty-info">{t('No methods defined')}</span>
              )}
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          {formData.id && (
            <button className="delete-button" onClick={handleDelete} disabled={!canManage}>{t('Delete')}</button>
          )}
          <div className="footer-right">
            <button className="cancel-button" onClick={onClose}>{t('Cancel')}</button>
            <button className="save-button" onClick={handleSave} disabled={!canLimitedEdit}>{t('Save Changes')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
