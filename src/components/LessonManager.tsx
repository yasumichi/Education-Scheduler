import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Lesson, TimePeriod, Resource, ResourceLabels, DeliveryMethod, User, Subject } from '../types';
import { parseISO, differenceInDays } from 'date-fns';
import './LessonManager.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  periods: TimePeriod[];
  resources: Resource[];
  lessons: Lesson[];
  subjects: Subject[];
  labels: ResourceLabels;
  initialLesson?: Partial<Lesson>;
  user: User;
}

export function LessonManager({ backendUrl, onClose, onUpdate, periods, resources, lessons, subjects, labels, initialLesson, user }: Props) {
  const { t } = useTranslation();
  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethod[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [formData, setFormData] = useState<{
    id?: string;
    subject: string;
    subjectId: string;
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
    subjectId: initialLesson?.subjectId || '',
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

  const [searchTerm, setSearchTerm] = useState(formData.subject);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

    // Course has associated subjects, which are usually leaf nodes.
    // We want to reconstruct the tree based on master subjects.
    
    const courseSubjects = course.subjects;
    const hierarchicalList: { 
      id: string; 
      name: string; 
      level: number; 
      parentId?: string | null;
      order: number;
      total: number; 
      remaining: number;
      isSelectable: boolean;
    }[] = [];

    // 1. Identify all master subjects involved (including parents)
    const involvedSubjectIds = new Set<string>();
    courseSubjects.forEach(cs => {
      if (cs.subjectId) {
        let currentId: string | undefined | null = cs.subjectId;
        while (currentId) {
          involvedSubjectIds.add(currentId);
          const sub = subjects.find(s => s.id === currentId);
          currentId = sub?.parentId;
        }
      }
    });

    // 2. Filter and sort master subjects
    const filteredMasterSubjects = subjects
      .filter(s => involvedSubjectIds.has(s.id))
      .sort((a, b) => a.level - b.level || a.order - b.order);

    // 3. Build a helper map for scheduling calculations
    const scheduledPeriodsMap: Record<string, number> = {};
    courseSubjects.forEach(cs => {
      const scheduled = lessons
        .filter(l => l.courseId === formData.courseId && (l.subjectId ? l.subjectId === cs.subjectId : l.subject === cs.name) && l.id !== formData.id)
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
      
      if (cs.subjectId) scheduledPeriodsMap[cs.subjectId] = scheduled;
    });

    // 4. Recursive build
    const addChildren = (parentId: string | null) => {
      const children = filteredMasterSubjects
        .filter(s => (s.parentId || null) === parentId)
        .sort((a, b) => a.order - b.order);

      children.forEach(s => {
        const cs = courseSubjects.find(cs => cs.subjectId === s.id);
        const scheduled = scheduledPeriodsMap[s.id] || 0;
        const total = cs ? (cs.totalPeriods || 0) : (s.totalPeriods || 0);
        
        hierarchicalList.push({
          id: s.id,
          name: s.name,
          level: s.level,
          parentId: s.parentId,
          order: s.order,
          total: cs ? total : 0,
          remaining: cs ? (total - scheduled) : 0,
          isSelectable: !!cs
        });
        addChildren(s.id);
      });
    };

    addChildren(null);

    // Also add any subjects that were manually added and NOT in master list
    courseSubjects.forEach(cs => {
      if (!cs.subjectId && !hierarchicalList.some(h => h.name === cs.name)) {
        const scheduled = lessons
          .filter(l => l.courseId === formData.courseId && l.subject === cs.name && l.id !== formData.id)
          .reduce((sum, l) => {
            const sIdx = periods.findIndex(p => p.id === l.startPeriodId);
            const eIdx = periods.findIndex(p => p.id === l.endPeriodId);
            if (sIdx === -1 || eIdx === -1) return sum;
            if (l.startDate === l.endDate) return sum + (eIdx - sIdx + 1);
            const numDays = differenceInDays(parseISO(l.endDate), parseISO(l.startDate));
            return sum + (periods.length - sIdx) + (numDays - 1) * periods.length + (eIdx + 1);
          }, 0);

        hierarchicalList.push({
          id: '',
          name: cs.name || '',
          level: 1,
          order: 999,
          total: cs.totalPeriods || 0,
          remaining: (cs.totalPeriods || 0) - scheduled,
          isSelectable: true
        });
      }
    });

    return hierarchicalList;
  }, [formData.courseId, formData.id, lessons, courses, periods, selectedCourse, subjects]);

  const filteredSubjectOptions = useMemo(() => {
    if (!searchTerm) return subjectOptions;
    const lowerSearch = searchTerm.toLowerCase();
    return subjectOptions.filter(opt => opt.name.toLowerCase().includes(lowerSearch));
  }, [searchTerm, subjectOptions]);

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
                onChange={(e) => {
                  setFormData({ ...formData, courseId: e.currentTarget.value, subject: '', subjectId: '' });
                  setSearchTerm('');
                }}
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
              <div className="searchable-combo-container" ref={dropdownRef}>
                <input 
                  type="text"
                  className="combo-input"
                  value={searchTerm}
                  onInput={(e) => {
                    const val = e.currentTarget.value;
                    setSearchTerm(val);
                    setFormData({ ...formData, subject: val, subjectId: '' });
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder={t('Search or enter {{resource}}', { resource: labels.subject })}
                  disabled={!formData.courseId}
                />
                {isDropdownOpen && formData.courseId && (
                  <div className="combo-dropdown">
                    {filteredSubjectOptions.length > 0 ? (
                      filteredSubjectOptions.map(opt => (
                        <div 
                          key={opt.id || opt.name}
                          className={`combo-item level-${opt.level} ${!opt.isSelectable ? 'not-selectable' : ''} ${opt.remaining <= 0 && opt.isSelectable ? 'no-remaining' : ''}`}
                          onClick={() => {
                            if (opt.isSelectable) {
                              setFormData({ ...formData, subject: opt.name, subjectId: opt.id });
                              setSearchTerm(opt.name);
                              setIsDropdownOpen(false);
                            }
                          }}
                        >
                          <span className="item-name">{opt.name}</span>
                          {opt.isSelectable && (
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
              <label>{t('Other locations')}</label>
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
                  placeholder={t('External {{resource}} (if not managed)', { resource: labels.mainTeacher })}
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
                  placeholder={t('External {{resource}} (comma separated)', { resource: labels.subTeacher })}
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
