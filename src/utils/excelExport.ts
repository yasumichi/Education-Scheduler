import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { 
  format, startOfDay, parseISO, isSameDay, isAfter, isBefore, addDays, addMonths, getYear, differenceInDays,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { TimePeriod, Resource, Lesson, ScheduleEvent, ResourceLabels, SystemSetting, ViewType, ResourceType, Holiday, ColorTheme, ColorCategory } from '../types';

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
  colorThemes: ColorTheme[];
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

// Helper to get theme color
const getThemeColor = (themes: ColorTheme[], category: ColorCategory, keyOrId: string) => {
  const theme = themes.find(t => t.category === category && (t.key === keyOrId || t.id === keyOrId));
  if (theme) return theme;
  return themes.find(t => t.category === category && t.key === 'default');
};

export async function exportTimetableToExcel({
  periods, resources, lessons, events, viewMode, viewType, baseDate, holidays, labels, systemSettings, colorThemes, t
}: ExportParams) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Timetable');

  const currentViewStart = startOfDay(baseDate);
  const isCourseTimeline = viewType === 'course_timeline';
  const effectivePeriods = isCourseTimeline ? [{ id: 'p-all', name: '', startTime: '', endTime: '', order: 0 }] : periods;

  const getDayInfo = (day: number) => {
    const weekendDaysStr = systemSettings?.weekendDays || "0:default:true,1:default:false,2:default:false,3:default:false,4:default:false,5:default:false,6:vivid:true";
    const parts = weekendDaysStr.split(',').filter(p => p !== '');
    const part = parts.find(p => p.startsWith(`${day}:`));
    if (part) {
      const bits = part.split(':');
      if (bits.length >= 3) {
        return { themeId: bits[1], isWeekend: bits[2] === 'true' };
      }
      if (bits.length === 2) {
        return { themeId: bits[1], isWeekend: true };
      }
    }
    const simpleIndices = weekendDaysStr.split(',').filter(p => !p.includes(':'));
    if (simpleIndices.includes(day.toString())) {
      return { themeId: 'default', isWeekend: true };
    }
    return { themeId: 'default', isWeekend: false };
  };

  const isWeekend = (date: Date) => getDayInfo(date.getDay()).isWeekend;
  const holidayTheme = systemSettings?.holidayTheme || 'default';

  const getHolidayOrWeekendTheme = (date: Date) => {
    const holiday = getHoliday(date);
    const dayInfo = getDayInfo(date.getDay());
    
    // 週末設定がある場合は、休日であっても週末のテーマを優先する
    if (dayInfo.isWeekend) {
      return getThemeColor(colorThemes, 'HOLIDAY', dayInfo.themeId);
    }
    
    // 週末でない平日の休日の場合は、holidayTheme を使用する
    if (holiday) {
      return getThemeColor(colorThemes, 'HOLIDAY', holidayTheme);
    }
    
    return null;
  };
  
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
    const targetStr = format(date, 'yyyy-MM-dd');
    return holidays.find(h => {
      if (h.date) return h.date === targetStr;
      if (h.start && h.end) {
        return targetStr >= h.start && targetStr <= h.end;
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
      
      const hTheme = getHolidayOrWeekendTheme(date);
      
      [dCell, wCell].forEach(c => {
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.font = { size: 9 };
        
        if (hTheme) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(hTheme.background) } };
          c.font = { ...c.font, color: { argb: hexToARGB(hTheme.foreground) } };
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

      const hTheme = getHolidayOrWeekendTheme(date);
      if (hTheme) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(hTheme.background) } };
        cell.font = { ...cell.font, color: { argb: hexToARGB(hTheme.foreground) } };
      }

      if (periods.length > 1) {
        worksheet.mergeCells(1, startCol, 1, endCol);
      }
    });

    const periodRow = worksheet.getRow(2);
    periodRow.height = 20;
    displayDates.forEach((date, dIdx) => {
      const hTheme = getHolidayOrWeekendTheme(date);

      periods.forEach((p, pIdx) => {
        const cell = worksheet.getCell(2, dIdx * periods.length + pIdx + 2);
        cell.value = p.name;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        
        if (hTheme) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(hTheme.background) } };
          cell.font = { color: { argb: hexToARGB(hTheme.foreground) } };
        }
        
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
      const hTheme = getHolidayOrWeekendTheme(date);
      
      let bgColor = 'FFFFFFFF';
      if (hTheme) {
        bgColor = hexToARGB(hTheme.background);
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
      // Get theme for the holiday. If it's a multi-day holiday, we use the theme of its first day.
      const hDate = h.date ? parseISO(h.date) : (h.start ? parseISO(h.start) : new Date());
      const hTheme = getHolidayOrWeekendTheme(hDate);
      if (hTheme) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(hTheme.background) } };
        cell.font = { color: { argb: hexToARGB(hTheme.foreground) }, bold: true };
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B0000' } };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }
    } else {
      const e = item.data as ScheduleEvent;
      cell.value = e.name + (e.location ? ` (${e.location})` : '');
      const theme = getThemeColor(colorThemes, 'EVENT', e.name);
      const bgColor = e.color || theme?.background || '#fef3c7';
      const textColor = theme?.foreground || '#000000';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(bgColor) } };
      cell.font = { color: { argb: hexToARGB(textColor) } };
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
        const hTheme = getHolidayOrWeekendTheme(date);
        let bgColor = 'FFFFFFFF';
        if (hTheme) {
          bgColor = hexToARGB(hTheme.background);
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
        
        const mLabel = c.mainTeacherLabel || labels.mainTeacher;
        const sLabel = c.subTeacherLabel || labels.subTeacher;

        cell.value = `${t(c.name)}\n` +
                     `${mLabel}: ${chiefTeacher ? t(chiefTeacher.name) : '-'}\n` +
                     (assistantNames ? `${sLabel}: ${assistantNames}\n` : '') +
                     `${c.startDate} ～ ${c.endDate} (${workDays}${t('days')} / ${workDays * periods.length}${t('periods')})`;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0E0FF' } }; // LightBlue equivalent
      } else if (item.type === 'event') {
        const e = item.data as ScheduleEvent;
        cell.value = e.name + (e.location ? ` (${e.location})` : '');
        const theme = getThemeColor(colorThemes, 'EVENT', e.name);
        const bgColor = e.color || theme?.background || '#fef3c7';
        const textColor = theme?.foreground || '#000000';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(bgColor) } };
        cell.font = { color: { argb: hexToARGB(textColor) } };
      } else {
        const l = item.data as Lesson;
        const mainTeacherName = l.teacherId ? (resources.find(r => r.id === l.teacherId)?.name || '') : (l.externalTeacher || '');
        const roomName = l.roomId ? (resources.find(r => r.id === l.roomId)?.name || '') : (l.location || '');
        cell.value = `${t(l.subject)}\n${mainTeacherName} / ${roomName}`;
        
        const hasTeacher = !!(l.teacherId || l.externalTeacher);
        const theme = getThemeColor(colorThemes, 'LESSON', hasTeacher ? 'with-teacher' : 'no-teacher');
        const bgColor = theme?.background || (hasTeacher ? '#646cff' : '#e884fa');
        const textColor = theme?.foreground || '#ffffff';
        
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(bgColor) } };
        cell.font = { color: { argb: hexToARGB(textColor) } };
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
  colorThemes: ColorTheme[];
  t: (key: string, options?: any) => string;
}

export async function exportPersonalMonthlyToExcel({
  userResourceId, periods, resources, lessons, events, baseDate, holidays, labels, systemSettings, colorThemes, t
}: PersonalExportParams) {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('My Schedule');

    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const totalPeriods = periods.length || 8;
    
    const getDayInfo = (day: number) => {
      const weekendDaysStr = systemSettings?.weekendDays || "0:default:true,1:default:false,2:default:false,3:default:false,4:default:false,5:default:false,6:vivid:true";
      const parts = weekendDaysStr.split(',').filter(p => p !== '');
      const part = parts.find(p => p.startsWith(`${day}:`));
      if (part) {
        const bits = part.split(':');
        if (bits.length >= 3) {
          return { themeId: bits[1], isWeekend: bits[2] === 'true' };
        }
        if (bits.length === 2) {
          return { themeId: bits[1], isWeekend: true };
        }
      }
      const simpleIndices = weekendDaysStr.split(',').filter(p => !p.includes(':'));
      if (simpleIndices.includes(day.toString())) {
        return { themeId: 'default', isWeekend: true };
      }
      return { themeId: 'default', isWeekend: false };
    };

    const isWeekend = (date: Date) => getDayInfo(date.getDay()).isWeekend;
    const holidayTheme = systemSettings?.holidayTheme || 'default';

    const getHolidayOrWeekendTheme = (date: Date) => {
      const holiday = getHoliday(date);
      const dayInfo = getDayInfo(date.getDay());
      
      // 週末設定がある場合は、休日であっても週末のテーマを優先する
      if (dayInfo.isWeekend) {
        return getThemeColor(colorThemes, 'HOLIDAY', dayInfo.themeId);
      }
      
      // 週末でない平日の休日の場合は、holidayTheme を使用する
      if (holiday) {
        return getThemeColor(colorThemes, 'HOLIDAY', holidayTheme);
      }
      
      return null;
    };

    const getHoliday = (date: Date) => {
      if (!date) return null;
      const targetStr = format(date, 'yyyy-MM-dd');
      return holidays.find(h => {
        if (h.date) return h.date === targetStr;
        if (h.start && h.end) {
          return targetStr >= h.start && targetStr <= h.end;
        }
        return false;
      });
    };

    // --- Pre-calculate overlaps for column structure ---
    let maxOverlaps = 1;
    const dayPlacementsMap = new Map<number, any[]>();

    days.forEach((day, dayIdx) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayLessons = lessons.filter(l => {
        const subIds = [...(l.subTeacherIds || []), ...(l.subTeachers || []).map(t => t.id)];
        return (l.teacherId === userResourceId || subIds.includes(userResourceId)) && 
               dateStr >= l.startDate && dateStr <= l.endDate;
      });
      const dayEvents = events.filter(e => {
        const resourceIdList = [...(e.resourceIds || []), ...(e.resources || []).map(r => r.id)];
        return resourceIdList.includes(userResourceId) && dateStr >= e.startDate && dateStr <= e.endDate;
      });

      const dayItems = [
        ...dayLessons.map(l => {
          let startIdx = 0, endIdx = totalPeriods - 1;
          if (dateStr === l.startDate) {
            const pIdx = periods.findIndex(p => p.id === l.startPeriodId);
            startIdx = pIdx !== -1 ? pIdx : 0;
          }
          if (dateStr === l.endDate) {
            const pIdx = periods.findIndex(p => p.id === l.endPeriodId);
            endIdx = pIdx !== -1 ? pIdx : totalPeriods - 1;
          }
          return { type: 'lesson', data: l, startIdx, endIdx };
        }),
        ...dayEvents.map(e => {
          let startIdx = 0, endIdx = totalPeriods - 1;
          if (dateStr === e.startDate) {
            const pIdx = periods.findIndex(p => p.id === e.startPeriodId);
            startIdx = pIdx !== -1 ? pIdx : 0;
          }
          if (dateStr === e.endDate) {
            const pIdx = periods.findIndex(p => p.id === e.endPeriodId);
            endIdx = pIdx !== -1 ? pIdx : totalPeriods - 1;
          }
          return { type: 'event', data: e, startIdx, endIdx };
        })
      ];

      if (dayItems.length > 0) {
        const placements: any[] = [];
        const sortedItems = [...dayItems].sort((a, b) => a.startIdx - b.startIdx || (b.endIdx - b.startIdx) - (a.endIdx - a.startIdx));
        sortedItems.forEach(item => {
          let level = 0;
          while (placements.some(p => p.level === level && !(item.endIdx < p.startIdx || item.startIdx > p.endIdx))) {
            level++;
          }
          placements.push({ ...item, level });
        });
        
        placements.forEach(p => {
          const overlapping = placements.filter(other => !(p.endIdx < other.startIdx || p.startIdx > other.endIdx));
          p.maxLevelInGroup = Math.max(...overlapping.map(o => o.level)) + 1;
        });

        const dayMaxLevel = placements.length > 0 ? Math.max(...placements.map(p => p.level)) + 1 : 1;
        if (dayMaxLevel > maxOverlaps) maxOverlaps = dayMaxLevel;
        dayPlacementsMap.set(dayIdx, placements);
      }
    });

    // Columns Width
    const baseColumnWidth = 30;
    for (let i = 1; i <= 7 * maxOverlaps; i++) {
      worksheet.getColumn(i).width = baseColumnWidth / maxOverlaps;
    }

    // Weekday Header
    const weekdayFormatter = new Intl.DateTimeFormat(navigator.language, { weekday: 'short' });
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30;
    for (let i = 0; i < 7; i++) {
      const d = new Date(2021, 0, 3 + i);
      const startCol = i * maxOverlaps + 1;
      const endCol = startCol + maxOverlaps - 1;
      const cell = worksheet.getCell(1, startCol);
      cell.value = weekdayFormatter.format(d);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      cell.border = { bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' } };
      if (endCol > startCol) worksheet.mergeCells(1, startCol, 1, endCol);
    }

    const weeksCount = Math.ceil(days.length / 7);
    for (let w = 0; w < weeksCount; w++) {
      const baseRow = 2 + w * (totalPeriods + 1);
      
      for (let d = 0; d < 7; d++) {
        const dayIdx = w * 7 + d;
        const day = days[dayIdx];
        if (!day) continue;

        const colStart = (d * maxOverlaps) + 1;
        const colEnd = colStart + maxOverlaps - 1;
        const cell = worksheet.getCell(baseRow, colStart);
        
        const isCurrMonth = isSameMonth(day, monthStart);
        const holiday = getHoliday(day);
        const hTheme = getHolidayOrWeekendTheme(day);

        cell.value = `${format(day, 'd')}${holiday ? ` (${holiday.name})` : ''}`;
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };

        let bgColor = 'FFFFFFFF';
        let textColor = 'FF000000';
        
        if (hTheme) {
          bgColor = hexToARGB(hTheme.background);
          textColor = hexToARGB(hTheme.foreground);
        } else if (!isCurrMonth) {
          bgColor = 'FFF0F0F0';
        }

        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.font = { ...cell.font, color: { argb: textColor } };
        cell.border = { left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' }, bottom: { style: 'thin' } };
        if (colEnd > colStart) worksheet.mergeCells(baseRow, colStart, baseRow, colEnd);

        for (let p = 1; p <= totalPeriods; p++) {
          for (let sc = 0; sc < maxOverlaps; sc++) {
            const pCell = worksheet.getCell(baseRow + p, colStart + sc);
            pCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            pCell.border = { 
              left: sc === 0 ? { style: 'thin' } : undefined, 
              right: sc === maxOverlaps - 1 ? { style: 'thin' } : undefined, 
              bottom: p === totalPeriods ? { style: 'thin' } : undefined 
            };
          }
          worksheet.getRow(baseRow + p).height = 30;
        }

        const placements = dayPlacementsMap.get(dayIdx) || [];
        placements.forEach(placement => {
          const { type, data, startIdx, endIdx, level, maxLevelInGroup } = placement;
          
          const colsPerLevel = maxOverlaps / maxLevelInGroup;
          const itemColStart = colStart + Math.floor(level * colsPerLevel);
          const itemColEnd = colStart + Math.floor((level + 1) * colsPerLevel) - 1;
          
          const startRow = baseRow + 1 + startIdx;
          const span = endIdx - startIdx + 1;
          const endRow = startRow + span - 1;
          
          const cell = worksheet.getCell(startRow, itemColStart);
          const periodLabel = span > 1 ? `${startIdx + 1}-${endIdx + 1}` : `${startIdx + 1}`;

          if (type === 'event') {
            const e = data as ScheduleEvent;
            cell.value = `[${periodLabel}] ${e.name}${e.location ? ` (${e.location})` : ''}`;
            const theme = getThemeColor(colorThemes, 'EVENT', e.name);
            const bgColor = e.color || theme?.background || '#fef3c7';
            const textColor = theme?.foreground || '#000000';
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(bgColor) } };
            cell.font = { color: { argb: hexToARGB(textColor) } };
          } else {
            const l = data as Lesson;
            const room = resources.find(r => r.id === l.roomId);
            const roomLabel = room?.name || l.location || '';
            cell.value = `[${periodLabel}] ${l.subject}${roomLabel ? ` (${roomLabel})` : ''}`;
            
            const hasTeacher = !!(l.teacherId || l.externalTeacher);
            const theme = getThemeColor(colorThemes, 'LESSON', hasTeacher ? 'with-teacher' : 'no-teacher');
            const bgColor = theme?.background || (hasTeacher ? '#646cff' : '#e884fa');
            const textColor = theme?.foreground || '#ffffff';
            
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToARGB(bgColor) } };
            cell.font = { color: { argb: hexToARGB(textColor) } };
          }

          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = { bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' } };

          if (endRow > startRow || itemColEnd > itemColStart) {
            try {
              worksheet.mergeCells(startRow, itemColStart, endRow, itemColEnd);
            } catch (e) {
              console.warn('Merge failed in Personal Export:', e);
            }
          }
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

export async function exportCourseWeeklyToExcel({
  courseId, periods, resources, lessons, baseDate, labels, t
}: {
  courseId: string;
  periods: TimePeriod[];
  resources: Resource[];
  lessons: Lesson[];
  baseDate: Date;
  labels: ResourceLabels;
  t: (key: string, options?: any) => string;
}) {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Weekly Schedule');

    const course = resources.find(r => r.id === courseId);
    if (!course) return;

    // 1. Course Name in Row 1
    worksheet.mergeCells(1, 1, 1, 7);
    const titleCell = worksheet.getCell(1, 1);
    titleCell.value = t(course.name);
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    // Row 2, 3 are empty

    // 4. Headers in Row 4
    const headers = [
      t('Date'),
      t('Period'),
      labels.subject,
      labels.deliveryMethod,
      labels.room,
      labels.mainTeacher,
      t('Remarks')
    ];
    const headerRow = worksheet.getRow(4);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Columns width
    worksheet.getColumn(1).width = 15; // Date
    worksheet.getColumn(2).width = 10; // Period
    worksheet.getColumn(3).width = 50; // Subject
    worksheet.getColumn(4).width = 20; // Delivery Method
    worksheet.getColumn(5).width = 20; // Room
    worksheet.getColumn(6).width = 20; // Main Teacher
    worksheet.getColumn(7).width = 15; // Remarks

    // 5. Data from Row 5
    const weekStart = startOfWeek(baseDate, { weekStartsOn: 0 });
    const weekEnd = addDays(weekStart, 6);
    const displayDates = eachDayOfInterval({ start: weekStart, end: weekEnd });

    let currentRowIdx = 5;

    displayDates.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayLessons = lessons.filter(l => l.courseId === courseId && dateStr >= l.startDate && dateStr <= l.endDate);
      
      const startRowForDay = currentRowIdx;
      const processedLessonIds = new Set<string>();
      const processedEmptyStartIndices = new Set<number>();

      periods.forEach((period, pIdx) => {
        const row = worksheet.getRow(currentRowIdx);
        
        // Date
        row.getCell(1).value = format(date, t('date_format'), { locale: t('locale') === 'ja' ? ja : undefined });
        
        // Period (Numeric only)
        row.getCell(2).value = period.name.replace(/\D/g, '');
        
        const l = dayLessons.find(dl => {
          if (dateStr === dl.startDate && dateStr === dl.endDate) {
            return period.id >= dl.startPeriodId && period.id <= dl.endPeriodId;
          }
          if (dateStr === dl.startDate) return period.id >= dl.startPeriodId;
          if (dateStr === dl.endDate) return period.id <= dl.endPeriodId;
          return dateStr > dl.startDate && dateStr < dl.endDate;
        });

        if (l) {
          if (!processedLessonIds.has(l.id)) {
            processedLessonIds.add(l.id);
            
            // Calculate span for this lesson today
            let span = 1;
            for (let nextPIdx = pIdx + 1; nextPIdx < periods.length; nextPIdx++) {
              const nextPeriod = periods[nextPIdx];
              const isSame = dayLessons.some(dl => dl.id === l.id && (() => {
                if (dateStr === dl.startDate && dateStr === dl.endDate) {
                  return nextPeriod.id >= dl.startPeriodId && nextPeriod.id <= dl.endPeriodId;
                }
                if (dateStr === dl.startDate) return nextPeriod.id >= dl.startPeriodId;
                if (dateStr === dl.endDate) return nextPeriod.id <= dl.endPeriodId;
                return dateStr > dl.startDate && dateStr < dl.endDate;
              })());
              if (isSame) span++;
              else break;
            }

            // Subject, Method, Room, Teacher, Remarks
            row.getCell(3).value = t(l.subject);
            row.getCell(4).value = (l.deliveryMethods || []).map(m => m.name).join(', ');
            row.getCell(5).value = l.roomId ? (resources.find(r => r.id === l.roomId)?.name || '') : (l.location || '');
            row.getCell(6).value = l.teacherId ? (resources.find(r => r.id === l.teacherId)?.name || '') : (l.externalTeacher || '');
            row.getCell(7).value = l.remarks || '';

            if (span > 1) {
              for (let col = 3; col <= 7; col++) {
                worksheet.mergeCells(currentRowIdx, col, currentRowIdx + span - 1, col);
              }
            }
          }
        } else {
          // Empty period merging
          const isAlreadyProcessed = Array.from(processedEmptyStartIndices).some(startIdx => {
            // Find the span of the empty block starting at startIdx
            let emptySpan = 0;
            for (let i = startIdx; i < periods.length; i++) {
              const hasLesson = dayLessons.some(dl => {
                const p = periods[i];
                if (dateStr === dl.startDate && dateStr === dl.endDate) return p.id >= dl.startPeriodId && p.id <= dl.endPeriodId;
                if (dateStr === dl.startDate) return p.id >= dl.startPeriodId;
                if (dateStr === dl.endDate) return p.id <= dl.endPeriodId;
                return dateStr > dl.startDate && dateStr < dl.endDate;
              });
              if (!hasLesson) emptySpan++;
              else break;
            }
            return pIdx >= startIdx && pIdx < startIdx + emptySpan;
          });

          if (!isAlreadyProcessed) {
            let emptySpan = 1;
            for (let nextPIdx = pIdx + 1; nextPIdx < periods.length; nextPIdx++) {
              const nextPeriod = periods[nextPIdx];
              const nextLesson = dayLessons.find(dl => {
                if (dateStr === dl.startDate && dateStr === dl.endDate) return nextPeriod.id >= dl.startPeriodId && nextPeriod.id <= dl.endPeriodId;
                if (dateStr === dl.startDate) return nextPeriod.id >= dl.startPeriodId;
                if (dateStr === dl.endDate) return nextPeriod.id <= dl.endPeriodId;
                return dateStr > dl.startDate && dateStr < dl.endDate;
              });
              if (!nextLesson) emptySpan++;
              else break;
            }

            for (let i = 3; i <= 7; i++) row.getCell(i).value = '';
            
            if (emptySpan > 1) {
              for (let col = 3; col <= 7; col++) {
                worksheet.mergeCells(currentRowIdx, col, currentRowIdx + emptySpan - 1, col);
              }
            }
            processedEmptyStartIndices.add(pIdx);
          }
        }

        // Alignment and Borders
        for (let i = 1; i <= 7; i++) {
          const cell = row.getCell(i);
          cell.alignment = { vertical: 'middle', horizontal: i <= 2 ? 'center' : 'left', wrapText: true };
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        }

        currentRowIdx++;
      });

      // Merge Date cells for the day
      if (periods.length > 1) {
        worksheet.mergeCells(startRowForDay, 1, currentRowIdx - 1, 1);
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `WeeklySchedule_${t(course.name)}_${format(weekStart, 'yyyyMMdd')}.xlsx`;
    saveAs(new Blob([buffer]), fileName);
  } catch (err) {
    console.error('Course Weekly Export Error:', err);
  }
}
