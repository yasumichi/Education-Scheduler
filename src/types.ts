export interface TimePeriod {
  id: string;
  name: string;
}

export type ResourceType = 'room' | 'teacher' | 'course';

export interface ResourceLabels {
  room: string;
  teacher: string;
  course: string;
}

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
}

export interface Lesson {
  id: string;
  subject: string;
  teacherId: string;
  roomId: string;
  courseId: string;
  date: string;
  startPeriodId: string;
  duration: number;
}

export type ViewType = 'day' | 'week' | 'month' | 'year';

export interface Holiday {
  date?: string;
  start?: string;
  end?: string;
  name: string;
}

export const DEFAULT_PERIODS: TimePeriod[] = [
  { id: 'p1', name: '1限' },
  { id: 'p2', name: '2限' },
  { id: 'p3', name: '3限' },
  { id: 'p4', name: '4限' },
  { id: 'p5', name: '5限' },
  { id: 'p6', name: '6限' },
  { id: 'p7', name: '7限' },
  { id: 'p8', name: '8限' },
];

// Generate 20 Resources for each type
const generateResources = (): Resource[] => {
  const resources: Resource[] = [];
  
  // 20 Rooms
  for (let i = 1; i <= 20; i++) {
    const id = `r${i}`;
    let name = `${100 + i}号室`;
    if (i > 15) name = `特別教室${i - 15}`;
    if (i === 19) name = '体育館';
    if (i === 20) name = '視聴覚室';
    resources.push({ id, name, type: 'room' });
  }

  // 20 Teachers
  const surnames = ['佐藤', '鈴木', '高橋', '田中', '渡辺', '伊藤', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水'];
  for (let i = 1; i <= 20; i++) {
    resources.push({ id: `t${i}`, name: `${surnames[i-1]} 先生`, type: 'teacher' });
  }

  // 20 Courses
  const courseNames = ['特進数学', '実用英語', '物理探究', '日本史B', '現代文演習', '化学基礎', '世界史A', '地理B', '生物特講', '政治経済', '古典特講', '情報I', '芸術基礎', '体育特論', '英語表現', '数学IIB', '論理国語', '科学人間学', 'キャリア探究', '多文化理解'];
  for (let i = 1; i <= 20; i++) {
    resources.push({ id: `c${i}`, name: `${courseNames[i-1]}講座`, type: 'course' });
  }

  return resources;
};

export const MOCK_RESOURCES = generateResources();

// Generate more Mock Lessons for testing
const generateLessons = (): Lesson[] => {
  const lessons: Lesson[] = [];
  const subjects = ['数学', '英語', '物理', '国語', '化学', '歴史', '地理', '生物', '社会', '情報', '芸術', '体育'];
  const baseDate = '2026-03-26';

  // Add 40 lessons for the base date to populate the grid
  for (let i = 1; i <= 40; i++) {
    const periodNum = (i % 8) + 1;
    const duration = (i % 3 === 0) ? 2 : 1;
    const roomNum = (i % 20) + 1;
    const teacherNum = ((i + 5) % 20) + 1;
    const courseNum = ((i + 10) % 20) + 1;

    lessons.push({
      id: `l${i}`,
      subject: subjects[i % subjects.length],
      teacherId: `t${teacherNum}`,
      roomId: `r${roomNum}`,
      courseId: `c${courseNum}`,
      date: baseDate,
      startPeriodId: `p${periodNum}`,
      duration: Math.min(duration, 9 - periodNum) // Ensure it doesn't exceed 8th period
    });
  }

  // Add some lessons for the next day
  for (let i = 41; i <= 60; i++) {
    lessons.push({
      id: `l${i}`,
      subject: subjects[i % subjects.length],
      teacherId: `t${(i % 20) + 1}`,
      roomId: `r${((i + 3) % 20) + 1}`,
      courseId: `c${((i + 7) % 20) + 1}`,
      date: '2026-03-27',
      startPeriodId: `p${(i % 5) + 1}`,
      duration: 1
    });
  }

  return lessons;
};

export const MOCK_LESSONS = generateLessons();

export const MOCK_HOLIDAYS: Holiday[] = [
  { date: '2026-01-01', name: '元日' },
];
