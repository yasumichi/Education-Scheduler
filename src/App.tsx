import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Timetable } from './components/Timetable';
import { Login } from './components/Login';
import { PeriodManager } from './components/PeriodManager';
import { LabelManager } from './components/LabelManager';
import { CourseManager } from './components/CourseManager';
import { EventManager } from './components/EventManager';
import { LessonManager } from './components/LessonManager';
import { Resource, Lesson, ScheduleEvent, ResourceType, ViewType, Holiday, ResourceLabels, User, AuthResponse, TimePeriod } from './types';
import { format, addDays, getYear, getMonth, parseISO } from 'date-fns';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function App() {
  const { t } = useTranslation();
  const viewMode = useSignal<ResourceType>('room');
  const viewType = useSignal<ViewType>('day');
  const currentDate = useSignal<Date>(new Date());
  const holidays = useSignal<Holiday[]>([]);
  const periods = useSignal<TimePeriod[]>([]);
  const isHolidayMode = useSignal<boolean>(false);
  const showPeriodManager = useSignal<boolean>(false);
  const showLabelManager = useSignal<boolean>(false);
  const showCourseManager = useSignal<boolean>(false);
  const showEventManager = useSignal<boolean>(false);
  const showLessonManager = useSignal<boolean>(false);
  const editingEvent = useSignal<Partial<ScheduleEvent> | null>(null);
  const editingLesson = useSignal<Partial<Lesson> | null>(null);
  const showSettingsDropdown = useSignal<boolean>(false);
  const resources = useSignal<Resource[]>([]);
  const lessons = useSignal<Lesson[]>([]);
  const events = useSignal<ScheduleEvent[]>([]);

  // Auth signals
  const user = useSignal<User | null>(null);
  const token = useSignal<string | null>(null);
  const authError = useSignal<string | undefined>(undefined);

  // リソースの表示名設定
  const resourceLabels = useSignal<ResourceLabels>({
    room: '',
    teacher: '',
    course: '',
    event: '',
    mainTeacher: '',
    subTeacher: ''
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

      const responses = await Promise.all([
        fetch(`${BACKEND_URL}/resources`, { headers }),
        fetch(`${BACKEND_URL}/lessons`, { headers }),
        fetch(`${BACKEND_URL}/events`, { headers }),
        fetch(`${BACKEND_URL}/holidays`, { headers }),
        fetch(`${BACKEND_URL}/periods`, { headers }),
        fetch(`${BACKEND_URL}/labels`, { headers })
      ]);

      const failed = responses.find(r => !r.ok);
      if (failed) {
        if (failed.status === 401) {
          console.warn('Unauthorized access, logging out...');
          handleLogout();
        } else {
          console.error(`Backend request failed with status ${failed.status}: ${failed.url}`);
        }
        return;
      }

      const [resResources, resLessons, resEvents, resHolidays, resPeriods, resLabels] = responses;

      // すべてのJSONパースを並列で行う
      const [dataResources, dataLessons, dataEvents, dataHolidays, dataPeriods, dataLabels] = await Promise.all([
        resResources.json(),
        resLessons.json(),
        resEvents.json(),
        resHolidays.json(),
        resPeriods.json(),
        resLabels.json()
      ]);

      resources.value = dataResources;
      lessons.value = dataLessons;
      events.value = dataEvents;
      holidays.value = dataHolidays;
      periods.value = dataPeriods;
      resourceLabels.value = dataLabels || resourceLabels.value;

      console.log('Successfully fetched all data from backend');
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
              {user.value.role === 'ADMIN' && (
                <div className="settings-container">
                  <button 
                    className="settings-button" 
                    onClick={() => showSettingsDropdown.value = !showSettingsDropdown.value}
                  >
                    {t('Settings')}
                  </button>
                  {showSettingsDropdown.value && (
                    <div className="settings-dropdown">
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          showPeriodManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('Manage Periods')}
                      </button>
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          showLabelManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('Manage Labels')}
                      </button>
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          showCourseManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('Manage Courses')}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <span className="user-email">{user.value.email} ({user.value.role})</span>
              <button className="logout-button" onClick={handleLogout}>{t('Sign Out')}</button>
            </div>
          )}
        </div>

        <div className="controls">
          <div className="control-group">
            <button 
              className={viewMode.value === 'room' ? 'active' : ''} 
              onClick={() => viewMode.value = 'room'}
            >
              {resourceLabels.value.room}
            </button>
            <button 
              className={viewMode.value === 'teacher' ? 'active' : ''} 
              onClick={() => viewMode.value = 'teacher'}
            >
              {resourceLabels.value.teacher}
            </button>
            <button 
              className={viewMode.value === 'course' ? 'active' : ''} 
              onClick={() => viewMode.value = 'course'}
            >
              {resourceLabels.value.course}
            </button>
          </div>

          <div className="control-group">
            <button 
              className={viewType.value === 'day' ? 'active' : ''} 
              onClick={() => handleViewTypeChange('day')}
            >
              {t('1 day')}
            </button>
            <button 
              className={viewType.value === 'week' ? 'active' : ''} 
              onClick={() => handleViewTypeChange('week')}
            >
              {t('1 week')}
            </button>
            <button 
              className={viewType.value === 'month' ? 'active' : ''} 
              onClick={() => handleViewTypeChange('month')}
            >
              {t('1 month')}
            </button>
            <button 
              className={viewType.value === 'year' ? 'active' : ''} 
              onClick={() => handleViewTypeChange('year')}
            >
              {t('1 year')}
            </button>
          </div>

          <div className="control-group date-nav">
            <button onClick={() => moveDate(-1)}>{t('Prev')}</button>
            <input 
              type="date" 
              className="date-picker"
              value={format(currentDate.value, 'yyyy-MM-dd')}
              onChange={handleDateChange}
            />
            <button onClick={() => moveDate(1)}>{t('Next')}</button>
          </div>

          <label className="holiday-toggle">
            <input 
              type="checkbox" 
              checked={isHolidayMode.value} 
              onChange={(e) => isHolidayMode.value = e.currentTarget.checked} 
            />
            {t('Holiday Theme')}
          </label>
        </div>
      </header>

      <div className={`timetable-view ${isHolidayMode.value ? 'holiday-theme' : ''}`}>
        <Timetable 
          periods={periods.value}
          resources={resources.value}
          lessons={lessons.value}
          events={events.value}
          viewMode={viewMode.value}
          viewType={viewType.value}
          baseDate={currentDate.value}
          holidays={holidays.value}
          labels={resourceLabels.value}
          onEventClick={(event) => {
            editingEvent.value = event;
            showEventManager.value = true;
          }}
          onEmptyEventClick={(date, periodId) => {
            editingEvent.value = { startDate: date, startPeriodId: periodId };
            showEventManager.value = true;
          }}
          onLessonClick={(lesson) => {
            editingLesson.value = lesson;
            showLessonManager.value = true;
          }}
          onEmptyResourceCellClick={(resourceId, date, periodId) => {
            const initial: Partial<Lesson> = { startDate: date, startPeriodId: periodId, endDate: date, endPeriodId: periodId };
            if (viewMode.value === 'room') initial.roomId = resourceId;
            else if (viewMode.value === 'teacher') initial.teacherId = resourceId;
            else if (viewMode.value === 'course') initial.courseId = resourceId;
            editingLesson.value = initial;
            showLessonManager.value = true;
          }}
        />
      </div>

      {showPeriodManager.value && token.value && (
        <PeriodManager 
          token={token.value} 
          backendUrl={BACKEND_URL} 
          onClose={() => showPeriodManager.value = false}
          onUpdate={(newPeriods) => periods.value = newPeriods}
        />
      )}

      {showLabelManager.value && token.value && (
        <LabelManager 
          token={token.value} 
          backendUrl={BACKEND_URL} 
          onClose={() => showLabelManager.value = false}
          onUpdate={(newLabels) => resourceLabels.value = newLabels}
          initialLabels={resourceLabels.value}
        />
      )}

      {showCourseManager.value && token.value && (
        <CourseManager 
          token={token.value} 
          backendUrl={BACKEND_URL} 
          onClose={() => showCourseManager.value = false}
          onUpdate={fetchData}
          resources={resources.value}
        />
      )}

      {showEventManager.value && token.value && (
        <EventManager 
          token={token.value} 
          backendUrl={BACKEND_URL} 
          onClose={() => {
            showEventManager.value = false;
            editingEvent.value = null;
          }}
          onUpdate={fetchData}
          periods={periods.value}
          resources={resources.value}
          initialEvent={editingEvent.value || {}}
        />
      )}

      {showLessonManager.value && token.value && (
        <LessonManager 
          token={token.value} 
          backendUrl={BACKEND_URL} 
          onClose={() => {
            showLessonManager.value = false;
            editingLesson.value = null;
          }}
          onUpdate={fetchData}
          periods={periods.value}
          resources={resources.value}
          lessons={lessons.value}
          initialLesson={editingLesson.value || {}}
        />
      )}
    </div>
  );
}
