// Assuming TimePeriod and Lesson are available from Prisma, or using any if types aren't easily reachable locally.
export const getAbsTime = (date: string, pId: string, periods: any[]) => {
  const pIdx = periods.findIndex((p: any) => p.id === pId);
  return `${date}-${pIdx.toString().padStart(3, '0')}`;
};

export const checkCollision = (
  newLessonStart: string,
  newLessonEnd: string,
  existingLessons: any[],
  periods: any[]
) => {
  return existingLessons.some(eL => {
    const eStart = getAbsTime(eL.startDate, eL.startPeriodId, periods);
    const eEnd = getAbsTime(eL.endDate, eL.endPeriodId, periods);
    return newLessonStart <= eEnd && eStart <= newLessonEnd;
  });
};
