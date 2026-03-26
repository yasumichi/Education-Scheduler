export interface TimePeriod {
  id: string;
  name: string;
}

export type ResourceType = 'room' | 'teacher' | 'course';

// リソースの表示名をカスタマイズするための型
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
  date: string; // ISO形式 "2026-03-26"
  startPeriodId: string; // "p1"〜"p8"
  duration: number; // 連続コマ数
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

export const MOCK_RESOURCES: Resource[] = [
  { id: 'r1', name: '101号室', type: 'room' },
  { id: 'r2', name: '102号室', type: 'room' },
  { id: 'r8', name: '実験室A', type: 'room' },
  { id: 'r10', name: '体育館', type: 'room' },
  { id: 't1', name: '佐藤 先生', type: 'teacher' },
  { id: 't2', name: '鈴木 先生', type: 'teacher' },
  { id: 'c1', name: '特進数学コース', type: 'course' },
  { id: 'c2', name: '英語基礎講座', type: 'course' },
  { id: 'c3', name: '理科実験クラブ', type: 'course' },
];

export const MOCK_LESSONS: Lesson[] = [
  { id: 'l1', subject: '数学I', teacherId: 't1', roomId: 'r1', courseId: 'c1', date: '2026-03-26', startPeriodId: 'p1', duration: 2 },
  { id: 'l2', subject: '英語A', teacherId: 't2', roomId: 'r2', courseId: 'c2', date: '2026-03-26', startPeriodId: 'p1', duration: 1 },
  { id: 'l3', subject: '物理基礎', teacherId: 't3', roomId: 'r8', courseId: 'c3', date: '2026-03-26', startPeriodId: 'p1', duration: 3 },
];

export const MOCK_HOLIDAYS: Holiday[] = [
  { date: '2026-01-01', name: '元日' },
];
