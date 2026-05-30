import { useState, useEffect, useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../utils/api';
import { Lesson, TimePeriod, Resource, ResourceLabels, DeliveryMethod, User, Subject, AuditLog, Holiday } from '../types';
import { parseISO, differenceInDays, format, addDays } from 'date-fns';
import './LessonManager.css';
import { SubjectSelector } from './SubjectSelector';
import { TeacherSelector } from './TeacherSelector';
import { SubTeacherSelector } from './SubTeacherSelector';
import { RoomSelector } from './RoomSelector';
import { getBookedTeacherIds } from '../utils/scheduling';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  periods: TimePeriod[];
  resources: Resource[];
  lessons: Lesson[];
  subjects: Subject[];
  labels: ResourceLabels;
  holidays: Holiday[];
  initialLesson?: Partial<Lesson>;
  user: User;
}

export function LessonManager({ backendUrl, onClose, onUpdate, periods, resources, lessons, subjects, labels, holidays, initialLesson, user }: Props) {
  const { t } = useTranslation();
  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethod[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<AuditLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasFetchedHistory, setHasFetchedHistory] = useState(false);
  
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

  useEffect(() => {
    // Dropdown handling moved to SubjectSelector
  }, []);

  useEffect(() => {
    const fetchDeliveryMethods = async () => {
      try {
        const res = await apiFetch(`${backendUrl}/delivery-methods`);
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

  useEffect(() => {
    if (showHistory && formData.id && !hasFetchedHistory && !loadingHistory) {
      const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
          const res = await apiFetch(`${backendUrl}/lessons/${formData.id}/history`);
          if (res.ok) {
            const data = await res.json();
            setHistoryLogs(data);
            setHasFetchedHistory(true);
          }
        } catch (err) {
          console.error('Failed to fetch lesson history:', err);
        } finally {
          setLoadingHistory(false);
        }
      };
      fetchHistory();
    }
  }, [showHistory, formData.id, backendUrl, hasFetchedHistory, loadingHistory]);

  const teachers = resources.filter(r => r.type === 'teacher');
  const rooms = resources.filter(r => r.type === 'room');
  const courses = resources.filter(r => r.type === 'course');

  const selectedCourse = useMemo(() => courses.find(c => c.id === formData.courseId), [formData.courseId, courses]);
  
  const bookedTeacherIds = useMemo(() => getBookedTeacherIds(
    formData.startDate, formData.startPeriodId,
    formData.endDate, formData.endPeriodId,
    formData.id, lessons, periods
  ), [formData.startDate, formData.startPeriodId, formData.endDate, formData.endPeriodId, formData.id, lessons, periods]);

  const mainTeacherLabel = labels.mainTeacher;
  const subTeacherLabel = labels.subTeacher;

  const getResourceName = (val: any) => {
    if (!val) return '-';
    const id = typeof val === 'object' ? val.id : val;
    const name = typeof val === 'object' ? val.name : null;
    if (name) return t(name);
    const res = resources.find(r => r.id === id);
    return res ? t(res.name) : id;
  };

  const getDeliveryMethodName = (val: any) => {
    if (!val) return '-';
    const id = typeof val === 'object' ? val.id : val;
    const name = typeof val === 'object' ? val.name : null;
    if (name) return name;
    const m = deliveryMethods.find(m => m.id === id);
    return m ? m.name : id;
  };

  const formatValue = (field: string, value: any) => {
    if (value === null || value === undefined || value === '') return '-';
    if (field === 'teacherId' || field === 'roomId' || field === 'courseId') return getResourceName(value);
    if (field === 'subTeacherIds' || field === 'subTeachers') {
      const items = Array.isArray(value) ? value : [];
      return items.map(getResourceName).join(', ') || '-';
    }
    if (field === 'deliveryMethodIds' || field === 'deliveryMethods') {
      const items = Array.isArray(value) ? value : [];
      return items.map(getDeliveryMethodName).join(', ') || '-';
    }
    if (field === 'startPeriodId' || field === 'endPeriodId') {
      const id = typeof value === 'object' ? value.id : value;
      const name = typeof value === 'object' ? value.name : null;
      if (name) return name;
      return periods.find(p => p.id === id)?.name || id;
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const calculateDiff = (prev: any, current: any) => {
    const changes: { field: string, old: any, new: any }[] = [];
    const keys = new Set([...Object.keys(prev || {}), ...Object.keys(current || {})]);
    
    keys.forEach(key => {
      if (['id', 'updatedAt', 'createdAt', 'subjectRef', 'course', 'room', 'teacher'].includes(key)) return;
      
      let valPrev = prev?.[key];
      let valCurrent = current?.[key];

      // Normalize comparison for arrays (like subTeacherIds)
      const stringifiedPrev = JSON.stringify(valPrev);
      const stringifiedCurrent = JSON.stringify(valCurrent);

      if (stringifiedPrev !== stringifiedCurrent) {
        changes.push({ field: key, old: valPrev, new: valCurrent });
      }
    });
    return changes;
  };

  const getFieldLabel = (field: string) => {
    switch (field) {
      case 'subject':
      case 'subjectId': return labels.subject;
      case 'courseId': return labels.course;
      case 'roomId': return labels.room;
      case 'teacherId': return labels.mainTeacher;
      case 'subTeacherIds':
      case 'subTeachers': return labels.subTeacher;
      case 'deliveryMethodIds':
      case 'deliveryMethods': return labels.deliveryMethod;
      case 'startDate': return t('Start Date');
      case 'endDate': return t('End Date');
      case 'startPeriodId': return t('Start Period');
      case 'endPeriodId': return t('End Period');
      case 'location': return t('Location');
      case 'remarks': return t('Remarks');
      case 'externalTeacher': return t('External {{resource}} (if not managed)', { resource: labels.mainTeacher });
      case 'externalSubTeachers': return t('External {{resource}} (comma separated)', { resource: labels.subTeacher });
      default: return field;
    }
  };

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

  // Auto-fill main room when course is changed
  useEffect(() => {
    if (!formData.id && selectedCourse?.mainRoomId) {
      setFormData(prev => ({
        ...prev,
        roomId: prev.roomId || selectedCourse.mainRoomId || ''
      }));
    }
  }, [formData.courseId, selectedCourse]);

  // Calculate subjects and remaining periods related to the selected course
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

  const activeSubject = useMemo(() => {
    return subjectOptions.find(s => s.id === formData.subjectId || s.name === formData.subject);
  }, [subjectOptions, formData.subjectId, formData.subject]);

  const isHolidayOrWeekend = (date: Date) => {
    const d = format(date, 'yyyy-MM-dd');
    if (date.getDay() === 0 || date.getDay() === 6) return true;
    return holidays.some(h => h.date === d);
  };

  const handleAutoSchedule = (includeHolidays: boolean) => {
    if (!activeSubject || activeSubject.remaining <= 0) return;

    let periodsToFill = activeSubject.remaining;
    let currentDate = parseISO(formData.startDate);
    let startIdx = periods.findIndex(p => p.id === formData.startPeriodId);
    if (startIdx === -1) startIdx = 0;

    let endDate = currentDate;
    let endPeriodId = formData.startPeriodId;

    // Helper to check if a period is occupied
    const isOccupied = (date: Date, periodId: string) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      return lessons.some(l => 
        l.id !== formData.id &&
        l.courseId === formData.courseId &&
        l.startDate === dateStr &&
        l.startPeriodId === periodId
      );
    };

    while (periodsToFill > 0) {
      if (!includeHolidays && isHolidayOrWeekend(currentDate)) {
        currentDate = addDays(currentDate, 1);
        startIdx = 0;
        continue;
      }

      // Check collision for current slot
      const currentPeriodId = periods[startIdx].id;
      if (isOccupied(currentDate, currentPeriodId)) {
        break; // Stop if occupied
      }

      const dailyAvailable = periods.length - startIdx;
      const nextDate = addDays(currentDate, 1);

      if (!includeHolidays && isHolidayOrWeekend(nextDate)) {
        const fillable = Math.min(periodsToFill, dailyAvailable);
        periodsToFill -= fillable;
        endDate = currentDate;
        endPeriodId = periods[startIdx + fillable - 1].id;
        break;
      }

      if (periodsToFill >= dailyAvailable) {
        periodsToFill -= dailyAvailable;
        endDate = currentDate;
        endPeriodId = periods[periods.length - 1].id;
        
        currentDate = nextDate;
        startIdx = 0;
      } else {
        endPeriodId = periods[startIdx + periodsToFill - 1].id;
        endDate = currentDate;
        periodsToFill = 0;
      }
    }
    
    setFormData(prev => ({
      ...prev,
      endDate: format(endDate, 'yyyy-MM-dd'),
      endPeriodId: endPeriodId
    }));
  };

  const filteredSubjectOptions = useMemo(() => {
    return subjectOptions;
  }, [subjectOptions]);

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

    const isDoubleBooked = lessons.filter(l => {
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

    console.log('Debugging Conflict: isDoubleBooked =', isDoubleBooked);

    if (isDoubleBooked.length > 0) {
      console.log('Debugging Conflict: Conflict found, triggering modal');

      const labelCourse = labels.course;
      const labelRoom = labels.room;
      const labelMainTeacher = labels.mainTeacher;
      const labelSubTeacher = labels.subTeacher;

      // Pre-calculate table content to avoid scope issues in template literals
      const tableRows = isDoubleBooked.map(l => {
        const r = resources.find(r => r.id === l.roomId);
        const t_main = resources.find(r => r.id === l.teacherId);
        const t_subs = (l.subTeacherIds || []).map(id => resources.find(r => r.id === id)?.name || id).join(', ');
        const c = resources.find(r => r.id === l.courseId);
        
        const startPeriodName = periods.find(p => p.id === l.startPeriodId)?.name || l.startPeriodId;
        const endPeriodName = periods.find(p => p.id === l.endPeriodId)?.name || l.endPeriodId;

        const isHighlighted = (id: string | null | undefined) => id && checkResources.includes(id);
        const highlightStyle = 'background-color: #8b0000; color: #ffffff;';

        return `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 8px; text-align: center;">${l.startDate} ${startPeriodName} - ${l.endDate} ${endPeriodName}</td>
            <td style="padding: 8px;">${c?.name || ''}</td>
            <td style="padding: 8px;">${l.subject || ''}</td>
            <td style="padding: 8px; ${isHighlighted(l.roomId) ? highlightStyle : ''}">${r?.name || ''}</td>
            <td style="padding: 8px; ${isHighlighted(l.teacherId) ? highlightStyle : ''}">${t_main?.name || ''}</td>
            <td style="padding: 8px; ${isHighlighted(l.subTeacherIds?.join(',')) ? highlightStyle : ''}">${t_subs}</td>
          </tr>
        `;
      }).join('');

      const modalHtml = `
        <div class="dialog-box" style="width: 800px; max-height: 80vh; overflow-y: auto;">
          <div class="dialog-header">
            <h2>${t('Warning: Conflict Detected')}</h2>
            <button class="close-button">×</button>
          </div>
          <div class="dialog-content">
            <p>${t('The following resources are already booked for this time. Do you want to proceed anyway?')}</p>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
              <thead>
                <tr style="border-bottom: 1px solid #ccc;">
                  <th style="padding: 8px;">${t('Period')}</th>
                  <th style="padding: 8px;">${labelCourse}</th>
                  <th style="padding: 8px;">Subject</th>
                  <th style="padding: 8px;">${labelRoom}</th>
                  <th style="padding: 8px;">${labelMainTeacher}</th>
                  <th style="padding: 8px;">${labelSubTeacher}</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
            <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
              <button class="cancel-button">${t('Cancel')}</button>
              <button class="proceed-button">${t('Proceed anyway')}</button>
            </div>
          </div>
        </div>
      `;

      const proceed = await new Promise<boolean>((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'dialog-overlay';
        modal.style.zIndex = '10000';
        modal.innerHTML = modalHtml;
        document.body.appendChild(modal);

        const close = () => { if (modal.parentNode) document.body.removeChild(modal); };
        modal.querySelector('.close-button')?.addEventListener('click', () => { close(); resolve(false); });
        modal.querySelector('.cancel-button')?.addEventListener('click', () => { close(); resolve(false); });
        modal.querySelector('.proceed-button')?.addEventListener('click', () => { close(); resolve(true); });
      });

      if (!proceed) return;
    }

    try {
      const res = await apiFetch(`${backendUrl}/lessons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
      const res = await apiFetch(`${backendUrl}/lessons/${formData.id}`, {
        method: 'DELETE'
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
    <div className="dialog-overlay">
      <div className="dialog-box">
        <div className="dialog-header">
          <h2>
            {showHistory ? t('History') : (formData.id ? t('Edit Lesson') : t('Create Lesson'))}
            {!showHistory && !canManage && canLimitedEdit && <span className="readonly-badge limited"> ({t('Limited Edit')})</span>}
            {!showHistory && !canManage && !canLimitedEdit && <span className="readonly-badge"> ({t('Read-only')})</span>}
          </h2>
          <div className="header-actions">
            {formData.id && (
              <button 
                className={`history-toggle-btn ${showHistory ? 'active' : ''}`}
                onClick={() => setShowHistory(!showHistory)}
                title={t('History')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </button>
            )}
            <button className="close-button" onClick={onClose}>×</button>
          </div>
        </div>

        {showHistory ? (
          <div className="dialog-content history-content">
            {loadingHistory ? (
              <div className="no-history">{t('Loading...')}</div>
            ) : historyLogs.length === 0 ? (
              <div className="no-history">{t('No history found')}</div>
            ) : (
              <div className="history-list">
                {[...historyLogs].reverse().map((log, index, arr) => {
                  const rawData = JSON.parse(log.data);
                  const hasComparison = !!(rawData.old || rawData.new);
                  
                  let actualOld: any;
                  let actualNew: any;
                  
                  if (hasComparison) {
                    actualOld = rawData.old;
                    actualNew = rawData.new;
                  } else {
                    actualNew = rawData;
                    const prevLog = arr[index + 1];
                    if (prevLog) {
                      const prevRawData = JSON.parse(prevLog.data);
                      actualOld = (prevRawData.old || prevRawData.new) ? (prevRawData.new || prevRawData.old) : prevRawData;
                    } else {
                      actualOld = null;
                    }
                  }
                  
                  const changes = calculateDiff(actualOld, actualNew);
                  
                  return (
                    <div key={log.id} className="history-item">
                      <div className="history-meta">
                        <span className="history-date">{format(parseISO(log.createdAt), 'yyyy/MM/dd HH:mm:ss')}</span>
                        <span className="history-user">{log.userEmail}</span>
                        <span className="history-action-label">
                          {log.action === 'CREATE_LESSON' ? t('Created') : (log.action === 'DELETE_LESSON' ? t('Deleted') : t('Updated'))}
                        </span>
                      </div>
                      <div className="history-changes">
                        {log.action === 'CREATE_LESSON' ? (
                          <div className="history-all-fields">{t('Initial registration')}</div>
                        ) : log.action === 'DELETE_LESSON' ? (
                          <div className="history-all-fields">{t('Deleted')}</div>
                        ) : changes.length > 0 ? (
                          changes.map(c => (
                            <div key={c.field} className="change-row">
                              <span className="field-name">{getFieldLabel(c.field)}:</span>
                              <div className="change-values">
                                <span className="field-old">{formatValue(c.field, c.old)}</span>
                                <span className="field-arrow">→</span>
                                <span className="field-new">{formatValue(c.field, c.new)}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="history-no-changes">{t('No visible changes')}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="dialog-content">
          <div className="form-group">
            <label>{labels.course} *</label>
            {canManage ? (
              <select 
                value={formData.courseId} 
                onChange={(e) => {
                  setFormData({ ...formData, courseId: e.currentTarget.value, subject: '', subjectId: '' });
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

          <SubjectSelector
            label={labels.subject}
            options={subjectOptions}
            valueId={formData.subjectId}
            valueName={formData.subject}
            onChange={(id, name) => setFormData({ ...formData, subject: name, subjectId: id })}
            disabled={!canManage || !formData.courseId}
          />

          <div className="form-row">
            <div className="form-group">
              <div className="auto-schedule-wrapper">
                <label>{t('Start Date')} *</label>
              </div>
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
              <div className="auto-schedule-wrapper">
                <label>{t('End Date')} *</label>
                {canManage && activeSubject && (
                  <select 
                    className="auto-schedule-btn"
                    onChange={(e) => {
                      const val = e.currentTarget.value;
                      if (val) {
                        handleAutoSchedule(val === 'include');
                        e.currentTarget.value = '';
                      }
                    }}
                  >
                    <option value="">{t('Apply Remaining Periods')}</option>
                    <option value="exclude">{t('Exclude Holidays')}</option>
                    <option value="include">{t('Include Holidays')}</option>
                  </select>
                )}
              </div>
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
              <small>{t('Lesson Periods')}: {
                (() => {
                  const sIdx = periods.findIndex(p => p.id === formData.startPeriodId);
                  const eIdx = periods.findIndex(p => p.id === formData.endPeriodId);
                  if (sIdx === -1 || eIdx === -1) return 0;
                  if (formData.startDate === formData.endDate) return (eIdx - sIdx + 1);
                  const numDays = differenceInDays(parseISO(formData.endDate), parseISO(formData.startDate));
                  return (periods.length - sIdx) + (numDays - 1) * periods.length + (eIdx + 1);
                })()
              }</small>
            </div>
          </div>


          <div className="form-row">
            <div className="form-group">
              <RoomSelector
                label={labels.room}
                rooms={rooms}
                valueId={formData.roomId}
                onChange={(id: string) => setFormData({ ...formData, roomId: id })}
                disabled={!canManage}
              />

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
            <TeacherSelector
              label={mainTeacherLabel}
              teachers={teachers}
              valueId={formData.teacherId}
              bookedIds={bookedTeacherIds}
              onChange={(id: string) => setFormData({ 
                ...formData, 
                teacherId: id,
                subTeacherIds: formData.subTeacherIds.filter(sid => sid !== id)
              })}
              disabled={!canManage}
            />

            {canManage && (
              <input 
                type="text" 
                value={formData.externalTeacher} 
                onInput={(e) => setFormData({ ...formData, externalTeacher: e.currentTarget.value })}
                placeholder={t('External {{resource}} (if not managed)', { resource: labels.mainTeacher })}
                disabled={!canManage}
                style={{ marginTop: '5px' }}
              />
            )}
            {!canManage && formData.externalTeacher && (
              <span className="readonly-value"> ({formData.externalTeacher})</span>
            )}
          </div>


          <div className="form-group">
            {canManage ? (
              <>
                <SubTeacherSelector
                  label={subTeacherLabel}
                  teachers={teachers.filter(t => t.id !== formData.teacherId)}
                  selectedIds={formData.subTeacherIds}
                  bookedIds={bookedTeacherIds}
                  onChange={(ids: string[]) => setFormData({...formData, subTeacherIds: ids})}
                  disabledId={formData.teacherId}
                  disabled={!canManage}
                />
                <input 
                  type="text" 
                  value={formData.externalSubTeachers} 
                  onInput={(e) => setFormData({ ...formData, externalSubTeachers: e.currentTarget.value })}
                  placeholder={t('External {{resource}} (comma separated)', { resource: labels.subTeacher })}
                  disabled={!canManage}
                  style={{ marginTop: '5px' }}
                />
              </>
            ) : (
              <div className="readonly-sub-teachers">
                <label>{subTeacherLabel}</label>
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
        )}

        <div className="dialog-footer">
          {formData.id && !showHistory ? (
            <div className="footer-left">
              <button className="delete-button" onClick={handleDelete} disabled={!canManage}>{t('Delete')}</button>
            </div>
          ) : <div />}
          <div className="footer-right">
            {showHistory ? (
              <button className="cancel-button" onClick={() => setShowHistory(false)}>{t('Back')}</button>
            ) : (
              <>
                <button className="cancel-button" onClick={onClose}>{t('Cancel')}</button>
                <button className="save-button" onClick={handleSave} disabled={!canLimitedEdit}>{t('Save Changes')}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
