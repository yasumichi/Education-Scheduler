export interface TimePeriod {
  id: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  order: number;
}

export type ResourceType = 'room' | 'teacher' | 'course';
export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  resourceId?: string; // Corresponding teacher resource, etc.
}

export interface AuthResponse {
  token?: string;
  user: User;
}

export type ResourceLabels = {
  room: string;
  teacher: string;
  course: string;
  event: string;
  mainTeacher: string;
  subTeacher: string;
  mainRoom: string;
  deliveryMethod: string;
  subject: string;
  courseType: string;
  subjectLarge: string;
  subjectMiddle: string;
  subjectSmall: string;
}

export type ColorCategory = 'EVENT' | 'LESSON' | 'HOLIDAY';

export interface ColorTheme {
  id: string;
  name: string;
  category: ColorCategory;
  key?: string | null;
  background: string;
  foreground: string;
  order: number;
}

export interface SystemSetting {

  id: string;
  allowPublicSignup: boolean;
  yearViewStartMonth: number;
  yearViewStartDay: number;
  weekendDays: string; // "0,6"
  holidayTheme: string; // "default"
}

export interface CourseType {
  id: string;
  name: string;
  order: number;
  startDate?: string | null;
  endDate?: string | null;
}

export interface Subject {
  id: string;
  name: string;
  level: number;
  parentId?: string | null;
  courseTypeId: string;
  totalPeriods?: number | null;
  order: number;
}

export interface CourseSubject {
  id: string;
  name?: string | null;
  totalPeriods?: number | null;
  subjectId?: string | null;
  subject?: Subject | null;
}

export interface DeliveryMethod {
  id: string;
  name: string;
  color?: string;
  order: number;
}

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  order?: number;
  userId?: string; // Associated user ID
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  subjects?: CourseSubject[];
  mainRoomId?: string;
  chiefTeacherId?: string;
  assistantTeacherIds?: string[];
  assistantTeachers?: { id: string }[];
  mainTeacherLabel?: string;
  subTeacherLabel?: string;
  courseTypeId?: string | null;
}

export interface ScheduleEvent {
  id: string;
  name: string;
  startDate: string;
  startPeriodId: string;
  endDate: string;
  endPeriodId: string;
  color?: string;
  location?: string;
  resourceIds?: string[]; // Associated resource ID (teacher, room, etc.)
  resources?: { id: string }[]; // Relation from backend
  showInEventRow?: boolean; // Whether to show in event row (top)
}

export interface Lesson {
  id: string;
  subject: string;
  subjectId?: string;
  teacherId?: string;
  subTeacherIds?: string[]; // サブ講師
  subTeachers?: { id: string }[]; // Relation from backend
  roomId?: string;
  courseId: string;
  location?: string;
  remarks?: string;
  externalTeacher?: string;
  externalSubTeachers?: string;
  deliveryMethodIds?: string[]; // 授業方式
  deliveryMethods?: { id: string, name: string, color?: string }[]; // Relation from backend
  startDate: string;   // 開始日 "2026-03-26"
  startPeriodId: string; // 開始時限 "p1"
  endDate: string;     // 終了日 "2026-03-27"
  endPeriodId: string;   // 終了時限 "p4"
}

export type ViewType = 'day' | 'week' | 'month' | '3month' | '6month' | 'year' | 'course_timeline';

export interface Holiday {
  id: string;
  date?: string;
  start?: string;
  end?: string;
  name: string;
}

const generateResources = (): Resource[] => {
  const resources: Resource[] = [];
  for (let i = 1; i <= 20; i++) {
    resources.push({ id: `r${i}`, name: `Room ${100 + i}`, type: 'room', order: i });
  }
  const surnames = ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Saito', 'Shimizu'];
  for (let i = 1; i <= 20; i++) {
    resources.push({ id: `t${i}`, name: `Dr. ${surnames[i-1]}`, type: 'teacher', order: i });
  }
  const courseNames = ['Advanced Math', 'Practical English', 'Physics Inquiry', 'Japanese History B', 'Modern Writing', 'Basic Chemistry', 'World History A', 'Geography B', 'Biology Special', 'Politics & Economy', 'Classical Literature', 'Informatics I', 'Basic Arts', 'Physical Education', 'English Expression', 'Math IIB', 'Logical Japanese', 'Human Science', 'Career Inquiry', 'Multiculturalism'];
  for (let i = 1; i <= 20; i++) {
    resources.push({ id: `c${i}`, name: `${courseNames[i-1]} Course`, type: 'course', order: i });
  }
  return resources;
};

export const MOCK_RESOURCES = generateResources();

const generateLessons = (): Lesson[] => {
  const lessons: Lesson[] = [];
  const subjects = ['Math', 'English', 'Physics', 'Japanese', 'Chemistry', 'History', 'Geography', 'Biology', 'Social', 'Info', 'Arts', 'PE'];
  const baseDate = new Date().toISOString().split('T')[0];

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

  // 複数サブ講師のテストデータ
  lessons.push({
    id: 'l-multi-sub',
    subject: 'Team Teaching: Research',
    teacherId: 't1', // Dr. Sato
    subTeacherIds: ['t2', 't3'], // Dr. Suzuki, Dr. Takahashi
    roomId: 'r1',
    courseId: 'c1',
    startDate: '2026-03-26',
    startPeriodId: 'p3',
    endDate: '2026-03-26',
    endPeriodId: 'p4'
  });

  // 日を跨ぐ集中講義
  lessons.push({
    id: 'l-special',
    subject: 'Special: Multiculturalism',
    teacherId: 't5',
    subTeacherIds: ['t1', 't2'],
    roomId: 'r5',
    courseId: 'c20',
    startDate: '2026-03-26',
    startPeriodId: 'p1',
    endDate: '2026-03-27',
    endPeriodId: 'p4'
  });

  return lessons;
};

export const MOCK_LESSONS = generateLessons();

export const MOCK_EVENTS: ScheduleEvent[] = [
  {
    id: 'e-global-only',
    name: 'Evacuation Drill',
    startDate: '2026-03-26',
    startPeriodId: 'p5',
    endDate: '2026-03-26',
    endPeriodId: 'p6',
    color: '#fee2e2',
    showInEventRow: true // イベント行のみ（resourceIdsなし）
  },
  {
    id: 'e-resource-only',
    name: 'Business Trip',
    startDate: '2026-03-26',
    startPeriodId: 'p1',
    endDate: '2026-03-26',
    endPeriodId: 'p8',
    color: '#d1fae5',
    resourceIds: ['t10'], // Dr. Kato only
    showInEventRow: false // イベント行には出さない
  },
  {
    id: 'e-both',
    name: 'Open Research Lesson',
    startDate: '2026-03-26',
    startPeriodId: 'p2',
    endDate: '2026-03-26',
    endPeriodId: 'p3',
    color: '#fef3c7',
    resourceIds: ['t4', 'r4'], // Dr. Tanaka, Room 104
    showInEventRow: true // 両方に表示
  }
];

export const MOCK_HOLIDAYS: Holiday[] = [
  { id: 'h1', date: '2026-01-01', name: 'New Year\'s Day' },
  { id: 'h2', date: '2026-02-11', name: 'Foundation Day' },
  { id: 'h3', date: '2026-02-23', name: 'Emperor\'s Birthday' },
  { id: 'h4', date: '2026-03-20', name: 'Vernal Equinox Day' },
  { id: 'h5', date: '2026-04-29', name: 'Showa Day' },
  { id: 'h6', start: '2026-12-29', end: '2027-01-03', name: 'Winter Holidays' }
];
