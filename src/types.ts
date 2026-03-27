export interface TimePeriod {
  id: string;
  name: string;
}

export type ResourceType = 'room' | 'teacher' | 'course';
export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

export interface User {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ResourceLabels {
  room: string;
  teacher: string;
  course: string;
  event: string;
}

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  order?: number;
}

export interface ScheduleEvent {
  id: string;
  name: string;
  startDate: string;
  startPeriodId: string;
  endDate: string;
  endPeriodId: string;
  color?: string;
}

export interface Lesson {
  id: string;
  subject: string;
  teacherId: string;
  roomId: string;
  courseId: string;
  startDate: string;   // 開始日 "2026-03-26"
  startPeriodId: string; // 開始時限 "p1"
  endDate: string;     // 終了日 "2026-03-27"
  endPeriodId: string;   // 終了時限 "p4"
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

const generateResources = (): Resource[] => {
  const resources: Resource[] = [];
  for (let i = 1; i <= 20; i++) {
    resources.push({ id: `r${i}`, name: `${100 + i}号室`, type: 'room', order: i });
  }
  const surnames = ['佐藤', '鈴木', '高橋', '田中', '渡辺', '伊藤', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水'];
  for (let i = 1; i <= 20; i++) {
    resources.push({ id: `t${i}`, name: `${surnames[i-1]} 先生`, type: 'teacher', order: i });
  }
  const courseNames = ['特進数学', '実用英語', '物理探究', '日本史B', '現代文演習', '化学基礎', '世界史A', '地理B', '生物特講', '政治経済', '古典特講', '情報I', '芸術基礎', '体育特論', '英語表現', '数学IIB', '論理国語', '科学人間学', 'キャリア探究', '多文化理解'];
  for (let i = 1; i <= 20; i++) {
    resources.push({ id: `c${i}`, name: `${courseNames[i-1]}講座`, type: 'course', order: i });
  }
  return resources;
};

export const MOCK_RESOURCES = generateResources();

const generateLessons = (): Lesson[] => {
  const lessons: Lesson[] = [];
  const subjects = ['数学', '英語', '物理', '国語', '化学', '歴史', '地理', '生物', '社会', '情報', '芸術', '体育'];
  const baseDate = '2026-03-26';

  // 基本的な単発の授業
  for (let i = 1; i <= 30; i++) {
    const periodNum = (i % 8) + 1;
    lessons.push({
      id: `l${i}`,
      subject: subjects[i % subjects.length],
      teacherId: `t${(i % 20) + 1}`,
      roomId: `r${(i % 20) + 1}`,
      courseId: `c${(i % 20) + 1}`,
      startDate: baseDate,
      startPeriodId: `p${periodNum}`,
      endDate: baseDate,
      endPeriodId: `p${periodNum}`
    });
  }

  // 日を跨ぐ集中講義 (2026-03-26 1限 〜 2026-03-27 4限)
  lessons.push({
    id: 'l-special',
    subject: '集中講義:多文化共生',
    teacherId: 't5',
    roomId: 'r5',
    courseId: 'c20',
    startDate: '2026-03-26',
    startPeriodId: 'p1',
    endDate: '2026-03-27',
    endPeriodId: 'p4'
  });

  // 2026年4月のテストデータ
  const aprilDate = '2026-04-06';
  for (let i = 1; i <= 10; i++) {
    lessons.push({
      id: `l-apr-${i}`,
      subject: subjects[i % subjects.length],
      teacherId: `t${i}`,
      roomId: `r${i}`,
      courseId: `c${i}`,
      startDate: aprilDate,
      startPeriodId: `p${i % 8 + 1}`,
      endDate: aprilDate,
      endPeriodId: `p${i % 8 + 1}`
    });
  }

  return lessons;
};

export const MOCK_LESSONS = generateLessons();

export const MOCK_EVENTS: ScheduleEvent[] = [
  {
    id: 'e1',
    name: '校内清掃',
    startDate: '2026-03-26',
    startPeriodId: 'p7',
    endDate: '2026-03-26',
    endPeriodId: 'p8',
    color: '#e2e8f0'
  },
  {
    id: 'e2',
    name: '三者面談期間',
    startDate: '2026-03-24',
    startPeriodId: 'p1',
    endDate: '2026-03-26',
    endPeriodId: 'p8',
    color: '#fef3c7'
  },
  {
    id: 'e-apr-1',
    name: '入学式',
    startDate: '2026-04-06',
    startPeriodId: 'p1',
    endDate: '2026-04-06',
    endPeriodId: 'p8',
    color: '#fee2e2'
  },
  {
    id: 'e-apr-2',
    name: 'オリエンテーション期間',
    startDate: '2026-04-07',
    startPeriodId: 'p1',
    endDate: '2026-04-10',
    endPeriodId: 'p8',
    color: '#f0f9ff'
  }
];

export const MOCK_HOLIDAYS: Holiday[] = [
  { date: '2026-01-01', name: '元日' },
  { date: '2026-02-11', name: '建国記念の日' },
  { date: '2026-02-23', name: '天皇誕生日' },
  { date: '2026-03-20', name: '春分の日' },
  { date: '2026-04-29', name: '昭和の日' },
  { start: '2026-12-29', end: '2027-01-03', name: '年末年始休暇' }
];
