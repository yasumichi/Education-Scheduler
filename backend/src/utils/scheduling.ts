import { TimePeriod, Lesson } from '../types';

export const getAbsTime = (date: string, pId: string, periods: TimePeriod[]) => {
  const pIdx = periods.findIndex(p => p.id === pId);
  return `${date}-${pIdx.toString().padStart(3, '0')}`;
};

export const checkCollision = (
  newLessonStart: string,
  newLessonEnd: string,
  existingLessons: Lesson[],
  periods: TimePeriod[]
) => {
  return existingLessons.some(eL => {
    const eStart = getAbsTime(eL.startDate, eL.startPeriodId, periods);
    const eEnd = getAbsTime(eL.endDate, eL.endPeriodId, periods);
    return newLessonStart <= eEnd && eStart <= newLessonEnd;
  });
};
