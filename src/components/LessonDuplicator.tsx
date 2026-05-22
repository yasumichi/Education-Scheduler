import { useState, useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Resource, ResourceLabels, CourseType } from '../types';
import './LessonDuplicator.css';

interface Props {
  backendUrl: string;
  onClose: () => void;
  onUpdate: () => void;
  resources: Resource[];
  labels: ResourceLabels;
}

export function LessonDuplicator({ backendUrl, onClose, onUpdate, resources, labels }: Props) {
  const { t } = useTranslation();
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [sourceCourseId, setSourceCourseId] = useState<string>('');
  const [destinationCourseIds, setDestinationCourseIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const courses = resources.filter(r => r.type === 'course');

  useEffect(() => {
    const fetchCourseTypes = async () => {
      try {
        const res = await fetch(`${backendUrl}/course-types`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setCourseTypes(data);
        }
      } catch (err) {
        console.error('Failed to fetch course types:', err);
      }
    };
    fetchCourseTypes();
  }, [backendUrl]);

  const handleSourceChange = (courseId: string) => {
    setSourceCourseId(courseId);
    const sourceCourse = courses.find(c => c.id === courseId);
    if (sourceCourse) {
      setStartDate(sourceCourse.startDate || '');
      setEndDate(sourceCourse.endDate || '');
      // When source changes, reset destinations because they must have same CourseType
      setDestinationCourseIds([]);
    }
  };

  const toggleDestination = (courseId: string) => {
    setDestinationCourseIds(prev => 
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    );
  };

  const handleDuplicate = async () => {
    if (!sourceCourseId || destinationCourseIds.length === 0 || !startDate || !endDate) {
      alert(t('Please select source, destination {{resource}} and date range', { resource: labels.course }));
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch(`${backendUrl}/courses/duplicate-lessons-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sourceCourseId,
          destinationCourseIds,
          startDate,
          endDate
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert(t('Successfully duplicated {{count}} lessons', { count: data.count }));
        onUpdate();
        onClose();
      } else {
        const errData = await res.json();
        alert(errData.error || t('Failed to duplicate lessons'));
      }
    } catch (err) {
      console.error('Error duplicating lessons:', err);
      alert(t('Error duplicating lessons'));
    } finally {
      setIsProcessing(false);
    }
  };

  const sourceCourse = courses.find(c => c.id === sourceCourseId);
  const sourceTypeId = sourceCourse?.courseTypeId;

  const filteredCourses = selectedTypeId 
    ? courses.filter(c => c.courseTypeId === selectedTypeId)
    : courses;

  const destinationOptions = sourceTypeId
    ? courses.filter(c => c.courseTypeId === sourceTypeId && c.id !== sourceCourseId)
    : [];

  return (
    <div className="dialog-overlay">
      <div className="dialog-box lesson-duplicator-box">
        <div className="dialog-header">
          <h2>{t('Duplicate Lessons')}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        <div className="dialog-content">
          <div className="form-group">
            <label>{labels.courseType} ({t('Filter')})</label>
            <select value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.currentTarget.value)}>
              <option value="">{t('All')}</option>
              {courseTypes.map(ct => (
                <option key={ct.id} value={ct.id}>{ct.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>{t('Source {{resource}}', { resource: labels.course })}</label>
            <select value={sourceCourseId} onChange={(e) => handleSourceChange(e.currentTarget.value)}>
              <option value="">{t('Select {{resource}}', { resource: labels.course })}</option>
              {filteredCourses.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>{t('Start Date')}</label>
              <input type="date" value={startDate} onInput={(e) => setStartDate(e.currentTarget.value)} />
            </div>
            <div className="form-group">
              <label>{t('End Date')}</label>
              <input type="date" value={endDate} onInput={(e) => setEndDate(e.currentTarget.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>{t('Destination {{resource}}s', { resource: labels.course })} ({t('Multi-select')})</label>
            <div className="destination-list">
              {destinationOptions.length === 0 && (
                <div className="empty-message">
                  {sourceCourseId ? t('No other courses with the same {{resource}}', { resource: labels.courseType }) : t('Select source course first')}
                </div>
              )}
              {destinationOptions.map(c => (
                <label key={c.id} className="destination-item">
                  <input 
                    type="checkbox" 
                    checked={destinationCourseIds.includes(c.id)}
                    onChange={() => toggleDestination(c.id)}
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="dialog-footer footer-right">
          <button className="cancel-button" onClick={onClose} disabled={isProcessing}>{t('Cancel')}</button>
          <button 
            className="confirm-button" 
            onClick={handleDuplicate} 
            disabled={isProcessing || !sourceCourseId || destinationCourseIds.length === 0}
          >
            {isProcessing ? t('Processing...') : t('Duplicate Now')}
          </button>
        </div>
      </div>
    </div>
  );
}
