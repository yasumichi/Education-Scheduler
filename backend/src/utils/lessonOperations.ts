import { PrismaClient } from '@prisma/client';

/**
 * Calculates remaining time for a subject in a course
 */
export const getRemainingTime = async (prisma: PrismaClient, courseId: string, subjectId: string, totalPeriods: number) => {
  const lessons = await prisma.lesson.findMany({ where: { courseId, subjectId } });
  const usedPeriods = lessons.reduce((acc, l) => {
    return acc + 1; 
  }, 0);
  return totalPeriods - usedPeriods;
};

/**
 * Move a lesson to a new date/period, shifting subsequent lessons if necessary.
 */
export const performMove = async (
  prisma: PrismaClient,
  lessonId: string,
  newDate: string,
  newPeriodId: string,
  periods: any[]
) => {
  return await prisma.$transaction(async (tx) => {
    const lesson = await tx.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new Error('Lesson not found');

    // 1. Validate destination
    const course = await tx.resource.findUnique({ where: { id: lesson.courseId } });
    if (course?.endDate && newDate > course.endDate) throw new Error('Cannot move beyond course end date');

    // 2. Find existing lesson at destination
    const target = await tx.lesson.findFirst({
      where: {
        courseId: lesson.courseId,
        startDate: newDate,
        startPeriodId: newPeriodId
      }
    });

    // 3. If target exists, perform shift/split
    if (target) {
      // Simple shift
      await tx.lesson.update({
        where: { id: target.id },
        data: { startPeriodId: getNextPeriodId(target.startPeriodId, periods) }
      });
    }

    // 4. Update the target lesson
    return await tx.lesson.update({
      where: { id: lessonId },
      data: { startDate: newDate, startPeriodId: newPeriodId, endDate: newDate, endPeriodId: newPeriodId }
    });
  });
};

const getNextPeriodId = (currentId: string, periods: any[]) => {
  const idx = periods.findIndex((p: any) => p.id === currentId);
  return idx < periods.length - 1 ? periods[idx + 1].id : currentId;
};
