import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Timetable } from './components/Timetable';
import { Login } from './components/Login';
import { PeriodManager } from './components/PeriodManager';
import { LabelManager } from './components/LabelManager';
import { CourseManager } from './components/CourseManager';
import { RoomManager } from './components/RoomManager';
import { TeacherManager } from './components/TeacherManager';
import { EventManager } from './components/EventManager';
import { LessonManager } from './components/LessonManager';
import { HolidayManager } from './components/HolidayManager';
import { UserManager } from './components/UserManager';
import { ProfileManager, ProfileMode } from './components/ProfileManager';
import { SystemSettingManager } from './components/SystemSettingManager';
import { DeliveryMethodManager } from './components/DeliveryMethodManager';
import { PersonalMonthlyView } from './components/PersonalMonthlyView';
import { Resource, Lesson, ScheduleEvent, ResourceType, ViewType, Holiday, ResourceLabels, User, AuthResponse, TimePeriod, SystemSetting } from './types';
import { format, addDays, addMonths, getYear, getMonth, parseISO, differenceInMonths, startOfDay } from 'date-fns';
import { exportTimetableToExcel, exportPersonalMonthlyToExcel } from './utils/excelExport';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function App() {
  const { t } = useTranslation();
  const viewMode = useSignal<ResourceType>('room');
  const viewType = useSignal<ViewType>('day');
  const showPersonalMonthly = useSignal<boolean>(false);
  const currentDate = useSignal<Date>(new Date());
  const holidays = useSignal<Holiday[]>([]);
  const periods = useSignal<TimePeriod[]>([]);
  const systemSettings = useSignal<SystemSetting | null>(null);
  const isHolidayMode = useSignal<boolean>(false);
  const showPeriodManager = useSignal<boolean>(false);
  const showLabelManager = useSignal<boolean>(false);
  const showCourseManager = useSignal<boolean>(false);
  const showRoomManager = useSignal<boolean>(false);
  const showTeacherManager = useSignal<boolean>(false);
  const showEventManager = useSignal<boolean>(false);
  const showLessonManager = useSignal<boolean>(false);
  const showHolidayManager = useSignal<boolean>(false);
  const showUserManager = useSignal<boolean>(false);
  const showProfileManager = useSignal<boolean>(false);
  const profileMode = useSignal<ProfileMode>('profile');
  const showSystemSettingManager = useSignal<boolean>(false);
  const showDeliveryMethodManager = useSignal<boolean>(false);
  const editingEvent = useSignal<Partial<ScheduleEvent> | null>(null);
  const editingLesson = useSignal<Partial<Lesson> | null>(null);
  const showSettingsDropdown = useSignal<boolean>(false);
  const showUserDropdown = useSignal<boolean>(false);
  const resources = useSignal<Resource[]>([]);
  const lessons = useSignal<Lesson[]>([]);
  const events = useSignal<ScheduleEvent[]>([]);
  const sessionRestored = useSignal<boolean>(false);

  // Auth signals
  const user = useSignal<User | null>(null);
  const authError = useSignal<string | undefined>(undefined);

  // リソースの表示名設定
  const resourceLabels = useSignal<ResourceLabels>({
    room: '',
    teacher: '',
    course: '',
    event: '',
    mainTeacher: '',
    subTeacher: '',
    mainRoom: '',
    deliveryMethod: '',
    subject: ''
  });

  // 初期化時に /auth/me でセッション復元
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/auth/me`, {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          user.value = data;
        }
      } catch (err) {
        console.error('Session restoration failed:', err);
      } finally {
        sessionRestored.value = true;
      }
    };
    restoreSession();
  }, []);

  const fetchData = async () => {
    if (!user.value) return;
    try {
      const responses = await Promise.all([
        fetch(`${BACKEND_URL}/resources`, { credentials: 'include' }),
        fetch(`${BACKEND_URL}/lessons`, { credentials: 'include' }),
        fetch(`${BACKEND_URL}/events`, { credentials: 'include' }),
        fetch(`${BACKEND_URL}/holidays`, { credentials: 'include' }),
        fetch(`${BACKEND_URL}/periods`, { credentials: 'include' }),
        fetch(`${BACKEND_URL}/labels`, { credentials: 'include' }),
        fetch(`${BACKEND_URL}/settings`, { credentials: 'include' })
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

      const [resResources, resLessons, resEvents, resHolidays, resPeriods, resLabels, resSettings] = responses;

      // すべてのJSONパースを並列で行う
      const [dataResources, dataLessons, dataEvents, dataHolidays, dataPeriods, dataLabels, dataSettings] = await Promise.all([
        resResources.json(),
        resLessons.json(),
        resEvents.json(),
        resHolidays.json(),
        resPeriods.json(),
        resLabels.json(),
        resSettings.json()
      ]);

      resources.value = dataResources;
      lessons.value = dataLessons;
      events.value = dataEvents;
      holidays.value = dataHolidays;
      periods.value = dataPeriods;
      resourceLabels.value = dataLabels || resourceLabels.value;
      systemSettings.value = dataSettings;

      console.log('Successfully fetched all data from backend');
    } catch (err) {
      console.error('Failed to fetch data from backend:', err);
    }
  };


  useEffect(() => {
    if (user.value) {
      fetchData();
    }
  }, [user.value]);

  const handleLogin = async (email: string, pass: string) => {
    authError.value = undefined;
    try {
      const res = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
        credentials: 'include'
      });

      const data: AuthResponse & { error?: string } = await res.json();

      if (!res.ok) {
        authError.value = data.error || 'Login failed';
        return;
      }

      user.value = data.user;
    } catch (err) {
      authError.value = 'Server connection failed';
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${BACKEND_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      user.value = null;
    }
  };

  if (!sessionRestored.value) {
    return <div className="loading">Loading session...</div>;
  }

  if (!user.value) {
    return <Login onLogin={handleLogin} error={authError.value} backendUrl={BACKEND_URL} />;
  }

  const moveDate = (amount: number) => {
    if (showPersonalMonthly.value) {
      const nextDate = new Date(currentDate.value);
      nextDate.setMonth(nextDate.getMonth() + amount);
      currentDate.value = nextDate;
      return;
    }
    if (viewType.value === 'day') currentDate.value = addDays(currentDate.value, amount);
    if (viewType.value === 'week') currentDate.value = addDays(currentDate.value, amount * 7);
    if (viewType.value === 'month') currentDate.value = addDays(currentDate.value, amount * 30);
    if (viewType.value === '3month') currentDate.value = addMonths(currentDate.value, amount * 3);
    if (viewType.value === '6month') currentDate.value = addMonths(currentDate.value, amount * 6);
    if (viewType.value === 'year') currentDate.value = addMonths(currentDate.value, amount * 12);
  };

  const handleDateChange = (e: any) => {
    const newDate = parseISO(e.target.value);
    if (!isNaN(newDate.getTime())) {
      currentDate.value = newDate;
    }
  };

  const handleViewTypeChange = (type: ViewType) => {
    viewType.value = type;
    if (type === 'year' || type === '3month' || type === '6month') {
      const month = systemSettings.value?.yearViewStartMonth ?? 4;
      const day = systemSettings.value?.yearViewStartDay ?? 1;
      
      const targetDate = startOfDay(currentDate.value);
      let year = getYear(targetDate);
      let yearStart = new Date(year, month - 1, day);
      
      if (targetDate < yearStart) {
        year -= 1;
        yearStart = new Date(year, month - 1, day);
      }
      
      if (type === 'year') {
        currentDate.value = yearStart;
      } else {
        const interval = type === '3month' ? 3 : 6;
        const diffMonths = differenceInMonths(targetDate, yearStart);
        const blockIndex = Math.floor(diffMonths / interval);
        currentDate.value = addMonths(yearStart, blockIndex * interval);
      }
    }
  };

  const handleExport = () => {
    exportTimetableToExcel({
      periods: periods.value,
      resources: resources.value,
      lessons: lessons.value,
      events: events.value,
      viewMode: viewMode.value,
      viewType: viewType.value,
      baseDate: currentDate.value,
      holidays: holidays.value,
      labels: resourceLabels.value,
      systemSettings: systemSettings.value,
      t
    });
  };

  const handlePersonalExport = () => {
    if (!user.value?.resourceId) return;
    exportPersonalMonthlyToExcel({
      userResourceId: user.value.resourceId,
      periods: periods.value,
      resources: resources.value,
      lessons: lessons.value,
      events: events.value,
      baseDate: currentDate.value,
      holidays: holidays.value,
      labels: resourceLabels.value,
      t
    });
  };

  const handleGlobalExport = () => {
    if (showPersonalMonthly.value) {
      handlePersonalExport();
    } else {
      handleExport();
    }
  };

  const logoPath = `${import.meta.env.BASE_URL}ScholaTile_28x28.png`;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-top">
          <h1><img src={logoPath} style="vertical-align: middle;" /><span style="color: #18324d">Schola</span><span style="color: #1ec1ca">Tile</span></h1>
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
                          showRoomManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('Manage {{resource}}', { resource: resourceLabels.value.room })}
                      </button>
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          showTeacherManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('Manage {{resource}}', { resource: resourceLabels.value.teacher })}
                      </button>
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          showCourseManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('Manage {{resource}}', { resource: resourceLabels.value.course })}
                      </button>
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          showHolidayManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('Manage Holidays')}
                      </button>
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          showDeliveryMethodManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('Manage {{resource}}', { resource: resourceLabels.value.deliveryMethod })}
                      </button>
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          showUserManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('Manage Users')}
                      </button>
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          showSystemSettingManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('System Settings')}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="user-dropdown-container">
                <button 
                  className="user-dropdown-button" 
                  onClick={() => showUserDropdown.value = !showUserDropdown.value}
                >
                  {(() => {
                    if (user.value?.resourceId) {
                      const teacher = resources.value.find(r => r.id === user.value?.resourceId);
                      if (teacher) return t(teacher.name);
                    }
                    return user.value?.email;
                  })()}
                </button>
                {showUserDropdown.value && (
                  <div className="user-dropdown">
                    <button 
                      className="dropdown-item" 
                      onClick={() => {
                        profileMode.value = 'profile';
                        showProfileManager.value = true;
                        showUserDropdown.value = false;
                      }}
                    >
                      {t('My Profile')}
                    </button>
                    <button 
                      className="dropdown-item" 
                      onClick={() => {
                        profileMode.value = 'password';
                        showProfileManager.value = true;
                        showUserDropdown.value = false;
                      }}
                    >
                      {t('Change Password')}
                    </button>
                    {user.value?.resourceId && (
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          showPersonalMonthly.value = true;
                          showUserDropdown.value = false;
                        }}
                      >
                        {t('Personal Monthly')}
                      </button>
                    )}
                    {user.value?.resourceId && (
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          profileMode.value = 'export';
                          showProfileManager.value = true;
                          showUserDropdown.value = false;
                        }}
                      >
                        {t('Export Schedule (iCalendar)')}
                      </button>
                    )}
                    <div className="dropdown-divider" />
                    <button className="dropdown-item logout-item" onClick={handleLogout}>
                      {t('Sign Out')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="controls">
          {showPersonalMonthly.value ? (
            <div className="control-group">
              <button onClick={() => showPersonalMonthly.value = false}>
                {t('Back to Timetable')}
              </button>
              <span className="personal-view-title">{t('Personal Monthly')}</span>
            </div>
          ) : (
            <>
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
                  className={viewType.value === '3month' ? 'active' : ''} 
                  onClick={() => handleViewTypeChange('3month')}
                >
                  {t('3 months')}
                </button>
                <button 
                  className={viewType.value === '6month' ? 'active' : ''} 
                  onClick={() => handleViewTypeChange('6month')}
                >
                  {t('6 months')}
                </button>
            <button 
              className={viewType.value === 'year' ? 'active' : ''} 
              onClick={() => handleViewTypeChange('year')}
            >
              {t('1 year')}
            </button>
          </div>
            </>
          )}

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

          <button className="excel-export-btn" onClick={handleGlobalExport} title={t('Export to Excel')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </button>
        </div>
      </header>

      <div className={`timetable-view`}>
        {showPersonalMonthly.value && user.value?.resourceId ? (
          <PersonalMonthlyView 
            userResourceId={user.value.resourceId}
            resources={resources.value}
            lessons={lessons.value}
            events={events.value}
            periods={periods.value}
            baseDate={currentDate.value}
            holidays={holidays.value}
            labels={resourceLabels.value}
            onLessonClick={(lesson) => {
              editingLesson.value = lesson;
              showLessonManager.value = true;
            }}
            onEventClick={(event) => {
              editingEvent.value = event;
              showEventManager.value = true;
            }}
          />
        ) : (
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
            systemSettings={systemSettings.value}
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
              if (viewMode.value === 'room') {
                initial.roomId = resourceId;
                // この教室をメイン教室としている講座があれば、それを初期選択
                const relatedCourse = resources.value.find(c => c.type === 'course' && c.mainRoomId === resourceId);
                if (relatedCourse) initial.courseId = relatedCourse.id;
              }
              else if (viewMode.value === 'teacher') initial.teacherId = resourceId;
              else if (viewMode.value === 'course') initial.courseId = resourceId;
              editingLesson.value = initial;
              showLessonManager.value = true;
            }}
          />
        )}
      </div>

      {showPeriodManager.value && (
        <PeriodManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showPeriodManager.value = false}
          onUpdate={(newPeriods) => periods.value = newPeriods}
        />
      )}

      {showLabelManager.value && (
        <LabelManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showLabelManager.value = false}
          onUpdate={(newLabels) => resourceLabels.value = newLabels}
          initialLabels={resourceLabels.value}
        />
      )}

      {showCourseManager.value && (
        <CourseManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showCourseManager.value = false}
          onUpdate={fetchData}
          resources={resources.value}
          labels={resourceLabels.value}
        />
      )}

      {showRoomManager.value && (
        <RoomManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showRoomManager.value = false}
          onUpdate={fetchData}
          resources={resources.value}
          labels={resourceLabels.value}
        />
      )}

      {showTeacherManager.value && (
        <TeacherManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showTeacherManager.value = false}
          onUpdate={fetchData}
          resources={resources.value}
          labels={resourceLabels.value}
        />
      )}

      {showEventManager.value && (
        <EventManager 
          backendUrl={BACKEND_URL} 
          onClose={() => {
            showEventManager.value = false;
            editingEvent.value = null;
          }}
          onUpdate={fetchData}
          periods={periods.value}
          resources={resources.value}
          labels={resourceLabels.value}
          initialEvent={editingEvent.value || {}}
        />
      )}

      {showLessonManager.value && (
        <LessonManager 
          backendUrl={BACKEND_URL} 
          onClose={() => {
            showLessonManager.value = false;
            editingLesson.value = null;
          }}
          onUpdate={fetchData}
          periods={periods.value}
          resources={resources.value}
          lessons={lessons.value}
          labels={resourceLabels.value}
          initialLesson={editingLesson.value || {}}
          user={user.value!}
        />
      )}

      {showHolidayManager.value && (
        <HolidayManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showHolidayManager.value = false}
          onUpdate={fetchData}
          holidays={holidays.value}
          initialYear={getYear(currentDate.value)}
        />
      )}

      {showUserManager.value && user.value && (
        <UserManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showUserManager.value = false}
          currentUser={user.value}
        />
      )}

      {showProfileManager.value && user.value && (
        <ProfileManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showProfileManager.value = false}
          user={user.value}
          mode={profileMode.value}
        />
      )}

      {showSystemSettingManager.value && (
        <SystemSettingManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showSystemSettingManager.value = false}
        />
      )}

      {showDeliveryMethodManager.value && (
        <DeliveryMethodManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showDeliveryMethodManager.value = false}
          onUpdate={fetchData}
        />
      )}
    </div>
  );
}
