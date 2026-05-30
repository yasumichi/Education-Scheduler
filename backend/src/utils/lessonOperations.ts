import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get absolute time index
const getAbsIdx = (periods: any[], pId: string) => periods.findIndex((p: any) => p.id === pId);

/**
 * Calculates remaining time for a subject in a course
 */
export const getRemainingTime = async (courseId: string, subjectId: string, totalPeriods: number) => {
  const lessons = await prisma.lesson.findMany({ where: { courseId, subjectId } });
  const usedPeriods = lessons.reduce((acc, l) => {
    // Basic assumption: 1 period = 1 unit. Needs adjustment if periods vary in length.
    return acc + 1; 
  }, 0);
  return totalPeriods - usedPeriods;
};

/**
 * Move a lesson to a new date/period, shifting subsequent lessons if necessary.
 */
export const performMove = async (
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
      // Simple shift: move subsequent lessons (if any)
      // For this implementation, we will move the target lesson forward by 1 period
      // and recurse or handle simply for now.
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
