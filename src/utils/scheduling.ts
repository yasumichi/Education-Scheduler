import { Lesson, TimePeriod } from '../types';
import { parseISO } from 'date-fns';

export const getAbsTime = (date: string, pId: string, periods: TimePeriod[]) => {
  const pIdx = periods.findIndex(p => p.id === pId);
  return `${date}-${pIdx.toString().padStart(3, '0')}`;
};

export const getBookedTeacherIds = (
  startDate: string,
  startPeriodId: string,
  endDate: string,
  endPeriodId: string,
  currentLessonId: string | undefined,
  lessons: Lesson[],
  periods: TimePeriod[]
) => {
  if (!startDate || !startPeriodId || !endDate || !endPeriodId) return [];

  const formStart = getAbsTime(startDate, startPeriodId, periods);
  const formEnd = getAbsTime(endDate, endPeriodId, periods);

  const bookedIds = new Set<string>();
  
  lessons.filter(l => l.id !== currentLessonId).forEach(l => {
    const lStart = getAbsTime(l.startDate, l.startPeriodId, periods);
    const lEnd = getAbsTime(l.endDate, l.endPeriodId, periods);

    if (formStart <= lEnd && lStart <= formEnd) {
      if (l.teacherId) bookedIds.add(l.teacherId);
      l.subTeacherIds?.forEach(id => bookedIds.add(id));
    }
  });
  
  return Array.from(bookedIds);
};
