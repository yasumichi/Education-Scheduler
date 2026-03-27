import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { Timetable } from './components/Timetable';
import { Login } from './components/Login';
import { Resource, Lesson, ScheduleEvent, ResourceType, ViewType, DEFAULT_PERIODS, Holiday, ResourceLabels, User, AuthResponse } from './types';
import { format, addDays, getYear, getMonth, parseISO } from 'date-fns';

const BACKEND_URL = 'http://localhost:3001/api';

export function App() {
  const viewMode = useSignal<ResourceType>('room');
  const viewType = useSignal<ViewType>('day');
  const currentDate = useSignal<Date>(new Date('2026-03-26'));
  const holidays = useSignal<Holiday[]>([]);
  const isHolidayMode = useSignal<boolean>(false);
  const resources = useSignal<Resource[]>([]);
  const lessons = useSignal<Lesson[]>([]);
  const events = useSignal<ScheduleEvent[]>([]);

  // Auth signals
  const user = useSignal<User | null>(null);
  const token = useSignal<string | null>(null);
  const authError = useSignal<string | undefined>(undefined);

  // リソースの表示名設定
  const resourceLabels = useSignal<ResourceLabels>({
    room: '教室',
    teacher: '講師',
    course: '講座',
    event: 'イベント'
  });

  // 初期化時にlocalStorageからセッション復元
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (savedToken && savedUser) {
      token.value = savedToken;
      user.value = JSON.parse(savedUser);
    }
  }, []);

  const fetchData = async () => {
    if (!token.value) return;

    try {
      const headers = {
        'Authorization': `Bearer ${token.value}`
      };
      
      const [resResources, resLessons, resEvents, resHolidays] = await Promise.all([
        fetch(`${BACKEND_URL}/resources`, { headers }),
        fetch(`${BACKEND_URL}/lessons`, { headers }),
        fetch(`${BACKEND_URL}/events`, { headers }),
        fetch(`${BACKEND_URL}/holidays`, { headers })
      ]);

      if (resResources.status === 401) {
        handleLogout();
        return;
      }

      resources.value = await resResources.json();
      lessons.value = await resLessons.json();
      events.value = await resEvents.json();
      holidays.value = await resHolidays.json();
    } catch (err) {
      console.error('Failed to fetch data from backend:', err);
    }
  };

  useEffect(() => {
    if (token.value) {
      fetchData();
    }
  }, [token.value]);

  const handleLogin = async (email: string, pass: string) => {
    authError.value = undefined;
    try {
      const res = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });

      const data: AuthResponse & { error?: string } = await res.json();

      if (!res.ok) {
        authError.value = data.error || 'Login failed';
        return;
      }

      token.value = data.token;
      user.value = data.user;
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
    } catch (err) {
      authError.value = 'Server connection failed';
    }
  };

  const handleLogout = () => {
    token.value = null;
    user.value = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  };

  if (!token.value) {
    return <Login onLogin={handleLogin} error={authError.value} />;
  }

  const moveDate = (amount: number) => {
    if (viewType.value === 'day') currentDate.value = addDays(currentDate.value, amount);
    if (viewType.value === 'week') currentDate.value = addDays(currentDate.value, amount * 7);
    if (viewType.value === 'month') currentDate.value = addDays(currentDate.value, amount * 30);
    if (viewType.value === 'year') currentDate.value = addDays(currentDate.value, amount * 365);
  };

  const handleDateChange = (e: any) => {
    const newDate = parseISO(e.target.value);
    if (!isNaN(newDate.getTime())) {
      currentDate.value = newDate;
    }
  };

  const handleViewTypeChange = (type: ViewType) => {
    viewType.value = type;
    if (type === 'year') {
      const year = getMonth(currentDate.value) < 3 ? getYear(currentDate.value) - 1 : getYear(currentDate.value);
      currentDate.value = new Date(year, 3, 1);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-top">
          <h1>EduGrid Scheduler</h1>
          {user.value && (
            <div className="user-info">
              <span className="user-email">{user.value.email} ({user.value.role})</span>
              <button className="logout-button" onClick={handleLogout}>Sign Out</button>
            </div>
          )}
        </div>

        <div className="controls">
          <div className="control-group">
            <button onClick={() => viewMode.value = 'room'}>{resourceLabels.value.room}</button>
            <button onClick={() => viewMode.value = 'teacher'}>{resourceLabels.value.teacher}</button>
            <button onClick={() => viewMode.value = 'course'}>{resourceLabels.value.course}</button>
          </div>

          <div className="control-group">
            <button onClick={() => handleViewTypeChange('day')}>1日</button>
            <button onClick={() => handleViewTypeChange('week')}>1週間</button>
            <button onClick={() => handleViewTypeChange('month')}>1ヶ月</button>
            <button onClick={() => handleViewTypeChange('year')}>1年</button>
          </div>

          <div className="control-group date-nav">
            <button onClick={() => moveDate(-1)}>前へ</button>
            <input 
              type="date" 
              className="date-picker"
              value={format(currentDate.value, 'yyyy-MM-dd')}
              onChange={handleDateChange}
            />
            <button onClick={() => moveDate(1)}>次へ</button>
          </div>

          <label className="holiday-toggle">
            <input 
              type="checkbox" 
              checked={isHolidayMode.value} 
              onChange={(e) => isHolidayMode.value = e.currentTarget.checked} 
            />
            祝日テーマ
          </label>
        </div>
      </header>

      <div className={`timetable-view ${isHolidayMode.value ? 'holiday-theme' : ''}`}>
        <Timetable 
          periods={DEFAULT_PERIODS}
          resources={resources.value}
          lessons={lessons.value}
          events={events.value}
          viewMode={viewMode.value}
          viewType={viewType.value}
          baseDate={currentDate.value}
          holidays={holidays.value}
          labels={resourceLabels.value}
        />
      </div>
    </div>
  );
}
