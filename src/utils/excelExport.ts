import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format, startOfDay, parseISO, isSameDay, isAfter, isBefore, addDays, getYear, differenceInDays } from 'date-fns';
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

export async function exportTimetableToExcel({
  periods, resources, lessons, events, viewMode, viewType, baseDate, holidays, labels, systemSettings, t
}: ExportParams) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Timetable');

  const currentViewStart = startOfDay(baseDate);
  
  const getDayCount = () => {
    if (viewType === 'day') return 1;
    if (viewType === 'week') return 7;
    if (viewType === 'month') return 30;
    if (viewType === 'year') {
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
  for (let i = 0; i < displayDates.length * periods.length; i++) {
    worksheet.getColumn(i + 2).width = 12;
  }

  // Row 1: Dates
  const dateRow = worksheet.getRow(1);
  dateRow.height = 25;
  displayDates.forEach((date, dIdx) => {
    const startCol = dIdx * periods.length + 2;
    const endCol = startCol + periods.length - 1;
    const cell = worksheet.getCell(1, startCol);
    cell.value = format(date, 'MMM d (eee)');
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.font = { bold: true };
    const holiday = getHoliday(date);
    const isSun = date.getDay() === 0;
    const isSat = date.getDay() === 6;
    if (holiday || isSun) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E1' } }; // MistyRose
    } else if (isSat) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3FF' } }; // LightBlue
    }
    if (periods.length > 1) {
      worksheet.mergeCells(1, startCol, 1, endCol);
    }
  });

  // Row 2: Periods
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

  let currentRow = 3;

  // Process Resources
  for (const res of filteredResources) {
    const resItems: { id: string, start: number, end: number, type: 'event' | 'lesson', data: any }[] = [];
    
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

    const layouts = calculateLayout(resItems);
    const maxLevel = layouts.length > 0 ? Math.max(...layouts.map(l => l.level)) + 1 : 1;

    // Merge resource name cell across sub-rows
    const resCell = worksheet.getCell(currentRow, 1);
    resCell.value = t(res.name);
    resCell.alignment = { vertical: 'middle', horizontal: 'left' };
    resCell.font = { bold: true };
    if (maxLevel > 1) {
      worksheet.mergeCells(currentRow, 1, currentRow + maxLevel - 1, 1);
    }

    // Fill background grid
    for (let l = 0; l < maxLevel; l++) {
      const row = worksheet.getRow(currentRow + l);
      row.height = 35;
      displayDates.forEach((date, dIdx) => {
        const isSun = date.getDay() === 0;
        const isSat = date.getDay() === 6;
        const holiday = getHoliday(date);
        periods.forEach((_, pIdx) => {
          const cell = worksheet.getCell(currentRow + l, dIdx * periods.length + pIdx + 2);
          cell.border = { bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' } };
          if (holiday || isSun) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F0' } };
          else if (isSat) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F8FF' } };
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
      
      if (item.type === 'event') {
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
      
      if (endCol > startCol) {
        worksheet.mergeCells(targetRow, startCol, targetRow, endCol);
      }
    });

    currentRow += maxLevel;
  }

  // Final touches
  worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `ScholaTile_${viewMode}_${format(baseDate, 'yyyyMMdd')}.xlsx`;
  saveAs(new Blob([buffer]), fileName);
}
