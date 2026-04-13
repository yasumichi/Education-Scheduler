import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { 
  format, startOfDay, parseISO, isSameDay, isAfter, isBefore, addDays, addMonths, getYear, differenceInDays,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth
} from 'date-fns';
import { TimePeriod, Resource, Lesson, ScheduleEvent, ResourceLabels, SystemSetting, ViewType, ResourceType, Holiday } from '../types';

interface ExportParams {
  periods: TimePeriod[];
  resources: Resource[];
  lessons: Lesson[];
  events: ScheduleEvent[];
  viewMode: ResourceType;
  viewType: ViewType;
  baseDate: Date;
  holidays: Holiday[];
  labels: ResourceLabels;
  systemSettings: SystemSetting | null;
  t: (key: string, options?: any) => string;
}

// Helper to convert hex to ARGB
const hexToARGB = (hex?: string) => {
  if (!hex) return 'FFFFFFFF';
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    const r = cleanHex[0] + cleanHex[0];
    const g = cleanHex[1] + cleanHex[1];
    const b = cleanHex[2] + cleanHex[2];
    return `FF${r}${g}${b}`.toUpperCase();
  }
  return `FF${cleanHex}`.toUpperCase();
};

export async function exportTimetableToExcel({
  periods, resources, lessons, events, viewMode, viewType, baseDate, holidays, labels, systemSettings, t
}: ExportParams) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Timetable');

  const currentViewStart = startOfDay(baseDate);
  const isCourseTimeline = viewType === 'course_timeline';
  const effectivePeriods = isCourseTimeline ? [{ id: 'p-all', name: '', startTime: '', endTime: '', order: 0 }] : periods;

  const weekendDayIndices = (systemSettings?.weekendDays || "0,6").split(',').map(Number);
  const isWeekend = (date: Date) => weekendDayIndices.includes(date.getDay());
  const holidayTheme = systemSettings?.holidayTheme || 'default';
  
  const getDayCount = () => {
    if (viewType === 'day') return 1;
    if (viewType === 'week') return 7;
    if (viewType === 'month') {
      return differenceInDays(addMonths(currentViewStart, 1), currentViewStart);
    }
    if (viewType === '3month' || viewType === '6month') {
      const months = viewType === '3month' ? 3 : 6;
      return differenceInDays(addMonths(currentViewStart, months), currentViewStart);
    }
    if (viewType === 'year' || viewType === 'course_timeline') {
      const month = systemSettings?.yearViewStartMonth ?? 4;
      const day = systemSettings?.yearViewStartDay ?? 1;
      const start = new Date(getYear(baseDate), month - 1, day);
      const end = new Date(getYear(baseDate) + 1, month - 1, day);
      return differenceInDays(end, start);
    }
    return 1;
  };

  const dayCount = getDayCount();
  const displayDates = Array.from({ length: dayCount }).map((_, i) => addDays(currentViewStart, i));
  const currentViewEnd = startOfDay(displayDates[displayDates.length - 1]);

  const filteredResources = resources
    .filter(r => r.type === viewMode)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const getHoliday = (date: Date) => {
    const target = startOfDay(date);
    return holidays.find(h => {
      if (h.date) return isSameDay(target, startOfDay(parseISO(h.date)));
      if (h.start && h.end) {
        const start = startOfDay(parseISO(h.start));
        const end = startOfDay(parseISO(h.end));
        return (isSameDay(target, start) || isAfter(target, start)) && 
               (isSameDay(target, end) || isBefore(target, end));
      }
      return false;
    });
  };

  // Header Setup
  worksheet.getColumn(1).width = 25;
  for (let i = 0; i < displayDates.length * effectivePeriods.length; i++) {
    worksheet.getColumn(i + 2).width = isCourseTimeline ? 4 : 12;
  }

  const locale = navigator.language;
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' });
  const dayFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric' });
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', weekday: 'short' });

  let headerRowsCount = isCourseTimeline ? 3 : 2;

  if (isCourseTimeline) {
    // Row 1: Months
    const monthRow = worksheet.getRow(1);
    monthRow.height = 20;
    let currentMonth: string | null = null;
    let startCol = 2;
    let colCount = 0;

    displayDates.forEach((date, dIdx) => {
      const monthLabel = monthFormatter.format(date);
      if (monthLabel !== currentMonth) {
        if (currentMonth !== null && colCount > 0) {
          worksheet.mergeCells(1, startCol, 1, startCol + colCount - 1);
          const cell = worksheet.getCell(1, startCol);
          cell.value = currentMonth;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.font = { bold: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
        }
        currentMonth = monthLabel;
        startCol = dIdx + 2;
        colCount = 1;
      } else {
        colCount++;
      }
    });
    // Last month
    if (currentMonth !== null && colCount > 0) {
      worksheet.mergeCells(1, startCol, 1, startCol + colCount - 1);
      const cell = worksheet.getCell(1, startCol);
      cell.value = currentMonth;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    }

    // Row 2 & 3: Day and Weekday
    const dayRow = worksheet.getRow(2);
    const wkdayRow = worksheet.getRow(3);
    dayRow.height = 20;
    wkdayRow.height = 20;

    displayDates.forEach((date, dIdx) => {
      const col = dIdx + 2;
      const dCell = worksheet.getCell(2, col);
      const wCell = worksheet.getCell(3, col);
      dCell.value = dayFormatter.format(date);
      wCell.value = weekdayFormatter.format(date);
      [dCell, wCell].forEach(c => {
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.font = { size: 9 };
        const holiday = getHoliday(date);
        const isWknd = isWeekend(date);
        let bgColor = 'FFFFFFFF';
        if (holidayTheme === 'vivid') {
          if (holiday) bgColor = 'FFFEEFC3';
          else if (isWknd) bgColor = 'FFE8F0FE';
        } else {
          if (holiday || isWknd) bgColor = 'FFFFE4E1';
        }
        if (bgColor !== 'FFFFFFFF') {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        }
        c.border = { bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' } };
      });
    });
  } else {
    // Normal Header (Row 1: Date, Row 2: Period)
    const dateRow = worksheet.getRow(1);
    dateRow.height = 25;
    displayDates.forEach((date, dIdx) => {
      const startCol = dIdx * periods.length + 2;
      const endCol = startCol + periods.length - 1;
      const cell = worksheet.getCell(1, startCol);
      cell.value = dateFormatter.format(date);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { bold: true };
      const holiday = getHoliday(date);
      const isWknd = isWeekend(date);

      let bgColor = 'FFFFFFFF';
      if (holidayTheme === 'vivid') {
        if (holiday) bgColor = 'FFFEEFC3';
        else if (isWknd) bgColor = 'FFE8F0FE';
      } else {
        if (holiday || isWknd) bgColor = 'FFFFE4E1';
      }

      if (bgColor !== 'FFFFFFFF') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      }
      if (periods.length > 1) {
        worksheet.mergeCells(1, startCol, 1, endCol);
      }
    });

    const periodRow = worksheet.getRow(2);
    periodRow.height = 20;
    displayDates.forEach((_, dIdx) => {
      periods.forEach((p, pIdx) => {
        const cell = worksheet.getCell(2, dIdx * periods.length + pIdx + 2);
        cell.value = p.name;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' } };
      });
    });
  }

  // Layout function
  const calculateLayout = (items: { id: string, start: number, end: number }[]) => {
    if (items.length === 0) return [];
    const placements: { id: string, start: number, end: number, level: number, maxLevelInGroup: number }[] = [];
    const sortedItems = [...items].sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    sortedItems.forEach(item => {
      let level = 0;
      while (placements.some(p => p.level === level && !(item.end < p.start || item.start > p.end))) {
        level++;
      }
      placements.push({ ...item, level, maxLevelInGroup: 0 });
    });
    placements.forEach(p => {
      const overlapping = placements.filter(other => !(p.end < other.start || p.start > other.end));
      p.maxLevelInGroup = Math.max(...overlapping.map(o => o.level)) + 1;
    });
    return placements;
  };

  let currentRow = headerRowsCount + 1;

  // --- Process Global Events ---
  const row3Items: { id: string, start: number, end: number, type: 'holiday' | 'event', data: any }[] = [];
  displayDates.forEach((date, dIdx) => {
    const holiday = getHoliday(date);
    if (!holiday) return;
    if (holiday.date && isSameDay(date, startOfDay(parseISO(holiday.date)))) {
      const startCol = dIdx * effectivePeriods.length + 2;
      const endCol = dIdx * effectivePeriods.length + effectivePeriods.length + 1;
      row3Items.push({ id: `holiday-${date.toISOString()}`, start: startCol, end: endCol, type: 'holiday', data: holiday });
    } else if (holiday.start && holiday.end) {
      const hStart = startOfDay(parseISO(holiday.start));
      const hEnd = startOfDay(parseISO(holiday.end));
      if (isSameDay(date, hStart) || (isSameDay(date, displayDates[0]) && isAfter(date, hStart) && isBefore(date, hEnd))) {
        const actualStart = isAfter(hStart, displayDates[0]) ? hStart : displayDates[0];
        const actualEnd = isBefore(hEnd, displayDates[displayDates.length - 1]) ? hEnd : displayDates[displayDates.length - 1];
        const sIdx = displayDates.findIndex(d => isSameDay(d, actualStart));
        const eIdx = displayDates.findIndex(d => isSameDay(d, actualEnd));
        if (sIdx !== -1 && eIdx !== -1 && isSameDay(date, actualStart)) {
          const startCol = sIdx * effectivePeriods.length + 2;
          const endCol = eIdx * effectivePeriods.length + effectivePeriods.length + 1;
          row3Items.push({ id: `holiday-range-${holiday.name}-${date.toISOString()}`, start: startCol, end: endCol, type: 'holiday', data: holiday });
        }
      }
    }
  });

  events.forEach(e => {
    const eStart = startOfDay(parseISO(e.startDate));
    const eEnd = startOfDay(parseISO(e.endDate));
    if (isAfter(eStart, currentViewEnd) || isBefore(eEnd, currentViewStart)) return;
    const resourceIdList = [...(e.resourceIds || []), ...(e.resources || []).map(r => r.id)];
    if (e.showInEventRow !== false || resourceIdList.length === 0) {
      const startDayIdx = displayDates.findIndex(d => isSameDay(d, eStart));
      const endDayIdx = displayDates.findIndex(d => isSameDay(d, eEnd));
      
      const sCol = (startDayIdx === -1) ? 2 : startDayIdx * effectivePeriods.length + 2;
      const eCol = (endDayIdx === -1) ? (displayDates.length * effectivePeriods.length + 1) : endDayIdx * effectivePeriods.length + effectivePeriods.length + 1;
      row3Items.push({ id: `event-${e.id}`, start: sCol, end: eCol, type: 'event', data: e });
    }
  });

  const row3Layouts = calculateLayout(row3Items);
  const row3MaxLevel = row3Layouts.length > 0 ? Math.max(...row3Layouts.map(l => l.level)) + 1 : 1;

  // Global Event Label
  const eventLabelCell = worksheet.getCell(currentRow, 1);
  eventLabelCell.value = labels.event;
  eventLabelCell.alignment = { vertical: 'middle', horizontal: 'left' };
  eventLabelCell.font = { bold: true };
  if (row3MaxLevel > 1) {
    worksheet.mergeCells(currentRow, 1, currentRow + row3MaxLevel - 1, 1);
  }

  // Fill background grid
  for (let l = 0; l < row3MaxLevel; l++) {
    const row = worksheet.getRow(currentRow + l);
    row.height = 35;
    displayDates.forEach((date, dIdx) => {
      const isWknd = isWeekend(date);
      const holiday = getHoliday(date);
      let bgColor = 'FFFFFFFF';
      if (holidayTheme === 'vivid') {
        if (holiday) bgColor = 'FFFFF7E0';
        else if (isWknd) bgColor = 'FFF8FBFF';
      } else {
        if (holiday || isWknd) bgColor = 'FFFFF0F0';
      }
      effectivePeriods.forEach((_, pIdx) => {
        const cell = worksheet.getCell(currentRow + l, dIdx * effectivePeriods.length + pIdx + 2);
        cell.border = { bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' } };
        if (bgColor !== 'FFFFFFFF') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        }
      });
    });
  }

  // Place Global items
  row3Layouts.forEach(layout => {
    const item = row3Items.find(i => i.id === layout.id)!;
    const targetRow = currentRow + layout.level;
    const startCol = layout.start;
    const endCol = layout.end;
    const cell = worksheet.getCell(targetRow, startCol);
    if (item.type === 'holiday') {
      const h = item.data;
      cell.value = h.name;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B0000' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    } else {
      const e = item.data as ScheduleEvent;
      cell.value = e.name + (e.location ? ` (${e.location})` : '');
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(e.color || '#fef3c7') } };
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' }, top: { style: 'medium' } };
    if (endCol > startCol) worksheet.mergeCells(targetRow, startCol, targetRow, endCol);
  });

  currentRow += row3MaxLevel;

  // Process Resources
  for (const res of filteredResources) {
    const resItems: { id: string, start: number, end: number, type: 'event' | 'lesson' | 'course', data: any }[] = [];
    
    if (isCourseTimeline) {
      const allCourses = resources.filter(r => r.type === 'course' && r.startDate && r.endDate);
      let relatedCourses: Resource[] = [];
      if (viewMode === 'course') relatedCourses = [res];
      else if (viewMode === 'teacher') relatedCourses = allCourses.filter(c => c.chiefTeacherId === res.id || c.assistantTeacherIds?.includes(res.id) || (c as any).assistantTeachers?.some((at: any) => at.id === res.id));
      else if (viewMode === 'room') relatedCourses = allCourses.filter(c => c.mainRoomId === res.id);

      relatedCourses.forEach(c => {
        const cStart = startOfDay(parseISO(c.startDate!));
        const cEnd = startOfDay(parseISO(c.endDate!));
        if (isAfter(cStart, currentViewEnd) || isBefore(cEnd, currentViewStart)) return;
        const sIdx = displayDates.findIndex(d => isSameDay(d, cStart));
        const eIdx = displayDates.findIndex(d => isSameDay(d, cEnd));
        const sCol = (sIdx === -1) ? 2 : sIdx + 2;
        const eCol = (eIdx === -1) ? (displayDates.length + 1) : eIdx + 2;
        resItems.push({ id: `c-${c.id}`, start: sCol, end: eCol, type: 'course', data: c });
      });
    } else {
      events.forEach(e => {
        const resourceIdList = [...(e.resourceIds || []), ...(e.resources || []).map(r => r.id)];
        if (resourceIdList.includes(res.id)) {
          const eStart = startOfDay(parseISO(e.startDate));
          const eEnd = startOfDay(parseISO(e.endDate));
          if (isAfter(eStart, currentViewEnd) || isBefore(eEnd, currentViewStart)) return;
          const startDayIdx = displayDates.findIndex(d => isSameDay(d, eStart));
          const endDayIdx = displayDates.findIndex(d => isSameDay(d, eEnd));
          const startPeriodIdx = periods.findIndex(p => p.id === e.startPeriodId);
          const endPeriodIdx = periods.findIndex(p => p.id === e.endPeriodId);
          const sCol = (startDayIdx === -1) ? 2 : startDayIdx * periods.length + startPeriodIdx + 2;
          const eCol = (endDayIdx === -1) ? (displayDates.length * periods.length + 1) : endDayIdx * periods.length + endPeriodIdx + 2;
          resItems.push({ id: `e-${e.id}`, start: sCol, end: eCol, type: 'event', data: e });
        }
      });

      lessons.forEach(l => {
        const lStart = startOfDay(parseISO(l.startDate));
        const lEnd = startOfDay(parseISO(l.endDate));
        if (isAfter(lStart, currentViewEnd) || isBefore(lEnd, currentViewStart)) return;
        const subIds = [...(l.subTeacherIds || []), ...(l.subTeachers || []).map(t => t.id)];
        let isTarget = false;
        if (viewMode === 'room' && l.roomId === res.id) isTarget = true;
        else if (viewMode === 'teacher' && (l.teacherId === res.id || subIds.includes(res.id))) isTarget = true;
        else if (viewMode === 'course' && l.courseId === res.id) isTarget = true;
        if (isTarget) {
          const startDayIdx = displayDates.findIndex(d => isSameDay(d, lStart));
          const endDayIdx = displayDates.findIndex(d => isSameDay(d, lEnd));
          const startPeriodIdx = periods.findIndex(p => p.id === l.startPeriodId);
          const endPeriodIdx = periods.findIndex(p => p.id === l.endPeriodId);
          const sCol = (startDayIdx === -1) ? 2 : startDayIdx * periods.length + startPeriodIdx + 2;
          const eCol = (endDayIdx === -1) ? (displayDates.length * periods.length + 1) : endDayIdx * periods.length + endPeriodIdx + 2;
          resItems.push({ id: `l-${l.id}`, start: sCol, end: eCol, type: 'lesson', data: l });
        }
      });
    }

    const layouts = calculateLayout(resItems);
    const maxLevel = layouts.length > 0 ? Math.max(...layouts.map(l => l.level)) + 1 : 1;

    // Resource name
    const resCell = worksheet.getCell(currentRow, 1);
    resCell.value = t(res.name);
    resCell.alignment = { vertical: 'middle', horizontal: 'left' };
    resCell.font = { bold: true };
    if (maxLevel > 1) worksheet.mergeCells(currentRow, 1, currentRow + maxLevel - 1, 1);

    // Fill background grid
    for (let l = 0; l < maxLevel; l++) {
      const row = worksheet.getRow(currentRow + l);
      row.height = isCourseTimeline ? 60 : 35;
      displayDates.forEach((date, dIdx) => {
        const isWknd = isWeekend(date);
        const holiday = getHoliday(date);
        let bgColor = 'FFFFFFFF';
        if (holidayTheme === 'vivid') {
          if (holiday) bgColor = 'FFFFF7E0';
          else if (isWknd) bgColor = 'FFF8FBFF';
        } else {
          if (holiday || isWknd) bgColor = 'FFFFF0F0';
        }
        effectivePeriods.forEach((_, pIdx) => {
          const cell = worksheet.getCell(currentRow + l, dIdx * effectivePeriods.length + pIdx + 2);
          cell.border = { bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' } };
          if (bgColor !== 'FFFFFFFF') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        });
      });
    }

    // Place items
    layouts.forEach(layout => {
      const item = resItems.find(i => i.id === layout.id)!;
      const targetRow = currentRow + layout.level;
      const startCol = layout.start;
      const endCol = layout.end;
      const cell = worksheet.getCell(targetRow, startCol);
      
      if (item.type === 'course') {
        const c = item.data as Resource;
        const days = eachDayOfInterval({ start: parseISO(c.startDate!), end: parseISO(c.endDate!) });
        const workDays = days.filter(d => !isWeekend(d) && !getHoliday(d)).length;
        const chiefTeacher = resources.find(r => r.id === c.chiefTeacherId);
        const subIds = [...(c.assistantTeacherIds || []), ...(c.assistantTeachers || []).map((at: any) => at.id)];
        const assistantNames = subIds.map(id => resources.find(r => r.id === id)?.name).filter(Boolean).map(name => t(name!)).join(', ');
        
        cell.value = `${t(c.name)}\n` +
                     `${labels.mainTeacher}: ${chiefTeacher ? t(chiefTeacher.name) : '-'}\n` +
                     (assistantNames ? `${labels.subTeacher}: ${assistantNames}\n` : '') +
                     `${c.startDate} ～ ${c.endDate} (${workDays}${t('days')} / ${workDays * periods.length}${t('periods')})`;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0E0FF' } }; // LightBlue equivalent
      } else if (item.type === 'event') {
        const e = item.data as ScheduleEvent;
        cell.value = e.name + (e.location ? ` (${e.location})` : '');
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(e.color || '#fef3c7') } };
      } else {
        const l = item.data as Lesson;
        const mainTeacherName = l.teacherId ? (resources.find(r => r.id === l.teacherId)?.name || '') : (l.externalTeacher || '');
        const roomName = l.roomId ? (resources.find(r => r.id === l.roomId)?.name || '') : (l.location || '');
        cell.value = `${t(l.subject)}\n${mainTeacherName} / ${roomName}`;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB((!l.teacherId && !l.externalTeacher) ? '#e884fa' : (l.deliveryMethods?.[0]?.color || '#646cff')) } };
      }

      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'medium' }, left: { style: 'medium' }, right: { style: 'medium' }, top: { style: 'medium' } };
      if (endCol > startCol) worksheet.mergeCells(targetRow, startCol, targetRow, endCol);
    });

    currentRow += maxLevel;
  }

  worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: headerRowsCount }];

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `ScholaTile_${viewMode}_${format(baseDate, 'yyyyMMdd')}.xlsx`;
  saveAs(new Blob([buffer]), fileName);
}

interface PersonalExportParams {
  userResourceId: string;
  periods: TimePeriod[];
  resources: Resource[];
  lessons: Lesson[];
  events: ScheduleEvent[];
  baseDate: Date;
  holidays: Holiday[];
  labels: ResourceLabels;
  systemSettings: SystemSetting | null;
  t: (key: string, options?: any) => string;
}

export async function exportPersonalMonthlyToExcel({
  userResourceId, periods, resources, lessons, events, baseDate, holidays, labels, systemSettings, t
}: PersonalExportParams) {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('My Schedule');

    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const weekendDayIndices = (systemSettings?.weekendDays || "0,6").split(',').map(Number);
    const isWeekend = (date: Date) => weekendDayIndices.includes(date.getDay());
    const holidayTheme = systemSettings?.holidayTheme || 'default';

    const getHoliday = (date: Date) => {
      if (!date) return null;
      const dateStr = format(date, 'yyyy-MM-dd');
      return holidays.find(h => {
        if (h.date === dateStr) return true;
        if (h.start && h.end) return dateStr >= h.start && dateStr <= h.end;
        return false;
      });
    };

    // Columns Width
    for (let i = 1; i <= 7; i++) {
      worksheet.getColumn(i).width = 25;
    }

    // Weekday Header
    const weekdayFormatter = new Intl.DateTimeFormat(navigator.language, { weekday: 'short' });
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30;
    for (let i = 0; i < 7; i++) {
      const d = new Date(2021, 0, 3 + i);
      const cell = worksheet.getCell(1, i + 1);
      cell.value = weekdayFormatter.format(d);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      cell.border = { bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' } };
    }

    const mergedRanges = new Set<string>();
    const isMerged = (row: number, col: number) => mergedRanges.has(`${row},${col}`);

    const weeksCount = Math.ceil(days.length / 7);
    for (let w = 0; w < weeksCount; w++) {
      const baseRow = 2 + w * 9;
      
      for (let d = 0; d < 7; d++) {
        const dayIdx = w * 7 + d;
        const day = days[dayIdx];
        if (!day) continue;

        const colIdx = d + 1;
        const cell = worksheet.getCell(baseRow, colIdx);
        
        const holiday = getHoliday(day);
        const isWknd = isWeekend(day);
        const isCurrMonth = isSameMonth(day, monthStart);

        cell.value = `${format(day, 'd')}${holiday ? ` (${holiday.name})` : ''}`;
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };

        let bgColor = 'FFFFFFFF';
        if (holidayTheme === 'vivid') {
          if (holiday) bgColor = 'FFFEEFC3';
          else if (isWknd) bgColor = 'FFE8F0FE';
        } else {
          if (holiday || isWknd) bgColor = 'FFFFE4E1';
        }
        if (!isCurrMonth) bgColor = 'FFF0F0F0';

        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.border = { left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' }, bottom: { style: 'thin' } };

        for (let p = 1; p <= 8; p++) {
          const pCell = worksheet.getCell(baseRow + p, colIdx);
          pCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          pCell.border = { left: { style: 'thin' }, right: { style: 'thin' }, bottom: p === 8 ? { style: 'thin' } : undefined };
          worksheet.getRow(baseRow + p).height = 25;
        }

        const dateStr = format(day, 'yyyy-MM-dd');
        const dayLessons = lessons.filter(l => {
          const subIds = [...(l.subTeacherIds || []), ...(l.subTeachers || []).map(t => t.id)];
          const isTeacher = l.teacherId === userResourceId || subIds.includes(userResourceId);
          return isTeacher && dateStr >= l.startDate && dateStr <= l.endDate;
        });
        const dayEvents = events.filter(e => {
          const resourceIdList = [...(e.resourceIds || []), ...(e.resources || []).map(r => r.id)];
          const isAssigned = resourceIdList.includes(userResourceId);
          const isGlobal = e.showInEventRow !== false || resourceIdList.length === 0;
          return (isAssigned || isGlobal) && dateStr >= e.startDate && dateStr <= e.endDate;
        });

        const processedItemIds = new Set<string>();

        periods.slice(0, 8).forEach((period, pIdx) => {
          const pEvents = dayEvents.filter(e => {
            if (e.startDate === e.endDate) return (period.id || '') >= e.startPeriodId && (period.id || '') <= e.endPeriodId;
            if (dateStr === e.startDate) return (period.id || '') >= e.startPeriodId;
            if (dateStr === e.endDate) return (period.id || '') <= e.endPeriodId;
            return true;
          });
          const pLessons = dayLessons.filter(l => {
            if (l.startDate === l.endDate) return (period.id || '') >= l.startPeriodId && (period.id || '') <= l.endPeriodId;
            if (dateStr === l.startDate) return (period.id || '') >= l.startPeriodId;
            if (dateStr === l.endDate) return (period.id || '') <= l.endPeriodId;
            return true;
          });

          const allItems = [
            ...pEvents.map(e => ({ type: 'event', data: e })),
            ...pLessons.map(l => ({ type: 'lesson', data: l }))
          ];

          allItems.forEach(item => {
            const id = `${item.type}-${item.data.id}`;
            if (processedItemIds.has(id)) return;
            
            const startRow = baseRow + 1 + pIdx;
            if (isMerged(startRow, colIdx)) return;

            processedItemIds.add(id);

            let endIdx = pIdx;
            if (item.type === 'event') {
              const e = item.data as ScheduleEvent;
              const eEndId = e.endPeriodId || 'p1';
              const eEnd = parseInt(eEndId.replace('p', '')) - 1;
              if (dateStr === e.endDate) endIdx = eEnd;
              else if (dateStr < e.endDate) endIdx = 7;
            } else {
              const l = item.data as Lesson;
              const lEndId = l.endPeriodId || 'p1';
              const lEnd = parseInt(lEndId.replace('p', '')) - 1;
              if (dateStr === l.endDate) endIdx = lEnd;
              else if (dateStr < l.endDate) endIdx = 7;
            }
            const span = Math.max(1, endIdx - pIdx + 1);
            const endRow = baseRow + 1 + pIdx + span - 1;

            const periodLabel = span > 1 ? `${pIdx + 1}-${endIdx + 1}` : `${pIdx + 1}`;
            const cell = worksheet.getCell(startRow, colIdx);

            if (item.type === 'event') {
              const e = item.data as ScheduleEvent;
              cell.value = `[${periodLabel}] ${e.name}${e.location ? ` (${e.location})` : ''}`;
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(e.color || '#fef3c7') } };
            } else {
              const l = item.data as Lesson;
              const room = resources.find(r => r.id === l.roomId);
              const roomLabel = room?.name || l.location || '';
              cell.value = `[${periodLabel}] ${l.subject}${roomLabel ? ` (${roomLabel})` : ''}`;
              const color = (!l.teacherId && !l.externalTeacher) ? '#e884fa' : (l.deliveryMethods?.[0]?.color || '#646cff');
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(color) } };
              cell.font = { color: { argb: 'FFFFFFFF' } };
            }

            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = { bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' } };

            if (endRow > startRow) {
              try {
                worksheet.mergeCells(startRow, colIdx, endRow, colIdx);
                for (let r = startRow; r <= endRow; r++) mergedRanges.add(`${r},${colIdx}`);
              } catch (e) {
                console.warn('Merge failed:', e);
              }
            } else {
              mergedRanges.add(`${startRow},${colIdx}`);
            }
          });
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `PersonalSchedule_${format(baseDate, 'yyyyMM')}.xlsx`;
    saveAs(new Blob([buffer]), fileName);
  } catch (err) {
    console.error('Personal Export Error:', err);
  }
}
