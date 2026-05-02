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
import { ColorThemeManager } from './components/ColorThemeManager';
import { SubjectManager } from './components/SubjectManager';
import { AuditLogManager } from './components/AuditLogManager';
import { CourseStatistics } from './components/CourseStatistics';
import { TeacherStatistics } from './components/TeacherStatistics';
import { AllTeacherStatistics } from './components/AllTeacherStatistics';
import { PersonalMonthlyView } from './components/PersonalMonthlyView';
import { CourseWeeklyView } from './components/CourseWeeklyView';
import { Resource, Lesson, ScheduleEvent, ResourceType, ViewType, Holiday, ResourceLabels, User, AuthResponse, TimePeriod, SystemSetting, ColorTheme, Subject, SavedFilter, AuditLog } from './types';
import { format, addDays, addMonths, getYear, getMonth, parseISO, differenceInMonths, differenceInDays, startOfDay, startOfWeek } from 'date-fns';
import { exportTimetableToExcel, exportPersonalMonthlyToExcel, exportCourseWeeklyToExcel } from './utils/excelExport';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function App() {
  const { t, ready } = useTranslation();
  const viewMode = useSignal<ResourceType>('room');
  const viewType = useSignal<ViewType>('month');
  const showPersonalMonthly = useSignal<boolean>(false);
  const showCourseWeekly = useSignal<boolean>(false);
  const selectedCourseIdForWeekly = useSignal<string | null>(null);
  const currentDate = useSignal<Date>(new Date());
  const holidays = useSignal<Holiday[]>([]);
  const periods = useSignal<TimePeriod[]>([]);
  const systemSettings = useSignal<SystemSetting | null>(null);
  const colorThemes = useSignal<ColorTheme[]>([]);
  const savedFilters = useSignal<SavedFilter[]>([]);
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
  const showColorThemeManager = useSignal<boolean>(false);
  const showSubjectManager = useSignal<boolean>(false);
  const showAuditLogManager = useSignal<boolean>(false);
  const showCourseStatistics = useSignal<boolean>(false);
  const selectedCourseIdForStats = useSignal<string | null>(null);
  const showTeacherStatistics = useSignal<boolean>(false);
  const selectedTeacherIdForStats = useSignal<string | null>(null);
  const showAllTeacherStatistics = useSignal<boolean>(false);
  const isTimelineReduced = useSignal<boolean>(false);
  const editingEvent = useSignal<Partial<ScheduleEvent> | null>(null);
  const editingLesson = useSignal<Partial<Lesson> | null>(null);
  const editingCourseId = useSignal<string | null>(null);
  const editingRoomId = useSignal<string | null>(null);
  const editingTeacherId = useSignal<string | null>(null);
  const showSettingsDropdown = useSignal<boolean>(false);
  const showUserDropdown = useSignal<boolean>(false);
  const resources = useSignal<Resource[]>([]);
  const lessons = useSignal<Lesson[]>([]);
  const events = useSignal<ScheduleEvent[]>([]);
  const subjects = useSignal<Subject[]>([]);
  const auditLogs = useSignal<AuditLog[]>([]);
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
    subject: '',
    courseType: '',
    subjectLarge: '',
    subjectMiddle: '',
    subjectSmall: ''
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
        fetch(`${BACKEND_URL}/settings`, { credentials: 'include' }),
        fetch(`${BACKEND_URL}/color-themes`, { credentials: 'include' }),
        fetch(`${BACKEND_URL}/subjects`, { credentials: 'include' }),
        fetch(`${BACKEND_URL}/saved-filters`, { credentials: 'include' })
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

      const [resResources, resLessons, resEvents, resHolidays, resPeriods, resLabels, resSettings, resThemes, resSubjects, resFilters] = responses;

      // すべてのJSONパースを並列で行う
      const [dataResources, dataLessons, dataEvents, dataHolidays, dataPeriods, dataLabels, dataSettings, dataThemes, dataSubjects, dataFilters] = await Promise.all([
        resResources.json(),
        resLessons.json(),
        resEvents.json(),
        resHolidays.json(),
        resPeriods.json(),
        resLabels.json(),
        resSettings.json(),
        resThemes.json(),
        resSubjects.json(),
        resFilters.json()
      ]);

      resources.value = dataResources;
      lessons.value = dataLessons;
      events.value = dataEvents;
      holidays.value = dataHolidays;
      periods.value = dataPeriods;
      resourceLabels.value = dataLabels || resourceLabels.value;
      systemSettings.value = dataSettings;
      colorThemes.value = dataThemes;
      subjects.value = dataSubjects;
      savedFilters.value = dataFilters;

      console.log('Successfully fetched all data from backend');
    } catch (err) {
      console.error('Failed to fetch data from backend:', err);
    }
  };

  const handleSaveFilter = async (filter: Partial<SavedFilter>) => {
    try {
      const res = await fetch(`${BACKEND_URL}/saved-filters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filter),
        credentials: 'include'
      });
      if (res.ok) {
        const updated = await res.json();
        if (filter.id) {
          savedFilters.value = savedFilters.value.map(f => f.id === updated.id ? updated : f);
        } else {
          savedFilters.value = [...savedFilters.value, updated];
        }
      }
    } catch (err) {
      console.error('Failed to save filter:', err);
    }
  };

  const handleDeleteFilter = async (id: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/saved-filters/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        savedFilters.value = savedFilters.value.filter(f => f.id !== id);
      }
    } catch (err) {
      console.error('Failed to delete filter:', err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/audit-logs`, { credentials: 'include' });
      if (res.ok) {
        auditLogs.value = await res.json();
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };


  useEffect(() => {
    if (user.value) {
      fetchData();
    }
  }, [user.value]);

  // 設定読み込み後に日付を整列させる
  useEffect(() => {
    if (systemSettings.value && (viewType.value === 'year' || viewType.value === '3month' || viewType.value === '6month' || viewType.value === 'month' || viewType.value === 'week')) {
      handleViewTypeChange(viewType.value);
    }
  }, [systemSettings.value]);

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

  if (!sessionRestored.value || !ready) {
    return <div className="loading">Loading...</div>;
  }

  if (!user.value) {
    return <Login onLogin={handleLogin} error={authError.value} backendUrl={BACKEND_URL} />;
  }

  const moveDate = (amount: number) => {
    if (showPersonalMonthly.value || showCourseWeekly.value) {
      const nextDate = new Date(currentDate.value);
      if (showPersonalMonthly.value) {
        nextDate.setMonth(nextDate.getMonth() + amount);
      } else {
        nextDate.setDate(nextDate.getDate() + amount * 7);
      }
      currentDate.value = nextDate;
      return;
    }
    if (viewType.value === 'day') currentDate.value = addDays(currentDate.value, amount);
    if (viewType.value === 'week') currentDate.value = addDays(currentDate.value, amount * 7);
    if (viewType.value === 'month') currentDate.value = addMonths(currentDate.value, amount);
    if (viewType.value === '3month') currentDate.value = addMonths(currentDate.value, amount * 3);
    if (viewType.value === '6month') currentDate.value = addMonths(currentDate.value, amount * 6);
    if (viewType.value === 'year' || viewType.value === 'course_timeline') currentDate.value = addMonths(currentDate.value, amount * 12);
  };

  const handleDateChange = (e: any) => {
    const newDate = parseISO(e.target.value);
    if (!isNaN(newDate.getTime())) {
      currentDate.value = newDate;
    }
  };

  const handleViewTypeChange = (type: ViewType) => {
    viewType.value = type;
    if (type === 'year' || type === '3month' || type === '6month' || type === 'month' || type === 'course_timeline') {
      const month = systemSettings.value?.yearViewStartMonth ?? 4;
      const day = systemSettings.value?.yearViewStartDay ?? 1;
      
      const targetDate = startOfDay(currentDate.value);
      let year = getYear(targetDate);
      let yearStart = new Date(year, month - 1, day);
      
      if (targetDate < yearStart) {
        year -= 1;
        yearStart = new Date(year, month - 1, day);
      }
      
      if (type === 'year' || type === 'course_timeline') {
        currentDate.value = yearStart;
      } else {
        const interval = type === '3month' ? 3 : (type === '6month' ? 6 : 1);
        const diffMonths = differenceInMonths(targetDate, yearStart);
        const blockIndex = Math.floor(diffMonths / interval);
        currentDate.value = addMonths(yearStart, blockIndex * interval);
      }
    } else if (type === 'week') {
      currentDate.value = startOfWeek(new Date(), { weekStartsOn: 0 }); // Sunday from system time
    } else if (type === 'day') {
      currentDate.value = startOfDay(new Date());
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
      isTimelineReduced: isTimelineReduced.value,
      baseDate: currentDate.value,
      holidays: holidays.value,
      labels: resourceLabels.value,
      systemSettings: systemSettings.value,
      colorThemes: colorThemes.value,
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
      systemSettings: systemSettings.value,
      colorThemes: colorThemes.value,
      t
    });
  };

  const handleGlobalExport = () => {
    if (showPersonalMonthly.value) {
      handlePersonalExport();
    } else if (showCourseWeekly.value && selectedCourseIdForWeekly.value) {
      exportCourseWeeklyToExcel({
        courseId: selectedCourseIdForWeekly.value,
        periods: periods.value,
        resources: resources.value,
        lessons: lessons.value,
        baseDate: currentDate.value,
        labels: resourceLabels.value,
        t
      });
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
                          showSubjectManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('Manage {{resource}}', { resource: resourceLabels.value.subject })}
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
                          showColorThemeManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('Manage Color Themes')}
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
                      <button
                        className="dropdown-item"
                        onClick={() => {
                          fetchAuditLogs();
                          showAuditLogManager.value = true;
                          showSettingsDropdown.value = false;
                        }}
                      >
                        {t('Audit Logs')}
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
                    {user.value?.resourceId && (
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          profileMode.value = 'csv_export';
                          showProfileManager.value = true;
                          showUserDropdown.value = false;
                        }}
                      >
                        {t('Export Schedule (CSV)')}
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
          {showPersonalMonthly.value || showCourseWeekly.value ? (
            <div className="control-group">
              <button onClick={() => {
                showPersonalMonthly.value = false;
                showCourseWeekly.value = false;
              }}>
                {t('Back to Timetable')}
              </button>
              <span className="personal-view-title">{showPersonalMonthly.value ? t('Personal Monthly') : t('Weekly Schedule')}</span>
            </div>
          ) : (
            <>
          <div className="control-group">
            <button 
              className={`room-view-btn ${viewMode.value === 'room' ? 'active' : ''}`} 
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
              className="all-teacher-stats-btn"
              onClick={() => showAllTeacherStatistics.value = true}
              title={t('All {{resource}} Statistics', { resource: resourceLabels.value.teacher })}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
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
            <button 
              className={viewType.value === 'course_timeline' ? 'active' : ''} 
              onClick={() => handleViewTypeChange('course_timeline')}
            >
              {t('{{course}} Timeline', { course: resourceLabels.value.course })}
            </button>
            {viewType.value === 'course_timeline' && (
              <button 
                className={isTimelineReduced.value ? 'active' : ''} 
                onClick={() => isTimelineReduced.value = !isTimelineReduced.value}
                title={t('Reduced View')}
              >
                {t('Reduced')}
              </button>
            )}
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
            systemSettings={systemSettings.value}
            colorThemes={colorThemes.value}
            onLessonClick={(lesson) => {
              editingLesson.value = lesson;
              showLessonManager.value = true;
            }}
            onEventClick={(event) => {
              editingEvent.value = event;
              showEventManager.value = true;
            }}
            onEmptyCellClick={(date) => {
              editingEvent.value = {
                startDate: date,
                endDate: date,
                startPeriodId: periods.value[0]?.id || 'p1',
                endPeriodId: periods.value[periods.value.length - 1]?.id || 'p8',
                resourceIds: [user.value!.resourceId!],
                showInEventRow: false
              };
              showEventManager.value = true;
            }}
          />
        ) : showCourseWeekly.value && selectedCourseIdForWeekly.value ? (
          <CourseWeeklyView 
            courseId={selectedCourseIdForWeekly.value}
            resources={resources.value}
            lessons={lessons.value}
            periods={periods.value}
            baseDate={currentDate.value}
            labels={resourceLabels.value}
            onLessonClick={(lesson) => {
              editingLesson.value = lesson;
              showLessonManager.value = true;
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
            isTimelineReduced={isTimelineReduced.value}
            baseDate={currentDate.value}
            holidays={holidays.value}
            labels={resourceLabels.value}
            systemSettings={systemSettings.value}
            colorThemes={colorThemes.value}
            savedFilters={savedFilters.value}
            onSaveFilter={handleSaveFilter}
            onDeleteFilter={handleDeleteFilter}
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
            onCourseClick={(course) => {
              editingCourseId.value = course.id;
              showCourseManager.value = true;
            }}
            onViewWeekly={(courseId) => {
              selectedCourseIdForWeekly.value = courseId;
              showCourseWeekly.value = true;
              showPersonalMonthly.value = false;
            }}
            onViewStats={(courseId) => {
              selectedCourseIdForStats.value = courseId;
              showCourseStatistics.value = true;
            }}
            onViewTeacherStats={(teacherId) => {
              selectedTeacherIdForStats.value = teacherId;
              showTeacherStatistics.value = true;
            }}
            onRoomClick={(room) => {
              editingRoomId.value = room.id;
              showRoomManager.value = true;
            }}
            onTeacherClick={(teacher) => {
              editingTeacherId.value = teacher.id;
              showTeacherManager.value = true;
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

      {showSubjectManager.value && (
        <SubjectManager
          backendUrl={BACKEND_URL}
          onClose={() => showSubjectManager.value = false}
          onUpdate={fetchData}
          labels={resourceLabels.value}
        />
      )}
      {showCourseManager.value && (
        <CourseManager 
          backendUrl={BACKEND_URL} 
          onClose={() => {
            showCourseManager.value = false;
            editingCourseId.value = null;
          }}
          onUpdate={fetchData}
          resources={resources.value}
          labels={resourceLabels.value}
          systemSettings={systemSettings.value}
          initialCourseId={editingCourseId.value}
          isAdmin={user.value?.role === 'ADMIN'}
        />
      )}

      {showRoomManager.value && (
        <RoomManager 
          backendUrl={BACKEND_URL} 
          onClose={() => {
            showRoomManager.value = false;
            editingRoomId.value = null;
          }}
          onUpdate={fetchData}
          resources={resources.value}
          labels={resourceLabels.value}
          isAdmin={user.value?.role === 'ADMIN'}
          initialRoomId={editingRoomId.value}
        />
      )}

      {showTeacherManager.value && (
        <TeacherManager 
          backendUrl={BACKEND_URL} 
          onClose={() => {
            showTeacherManager.value = false;
            editingTeacherId.value = null;
          }}
          onUpdate={fetchData}
          resources={resources.value}
          labels={resourceLabels.value}
          isAdmin={user.value?.role === 'ADMIN'}
          initialTeacherId={editingTeacherId.value}
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
          themes={colorThemes.value}
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
          subjects={subjects.value}
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
          themes={colorThemes.value}
        />
      )}

      {showDeliveryMethodManager.value && (
        <DeliveryMethodManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showDeliveryMethodManager.value = false}
          onUpdate={fetchData}
          labels={resourceLabels.value}
        />
      )}

      {showColorThemeManager.value && (
        <ColorThemeManager
          backendUrl={BACKEND_URL}
          onClose={() => showColorThemeManager.value = false}
          onUpdate={fetchData}
          themes={colorThemes.value}
        />
      )}

      {showCourseStatistics.value && selectedCourseIdForStats.value && (() => {
        const course = resources.value.find(c => c.id === selectedCourseIdForStats.value);
        if (!course) return null;
        
        // Fetch subjects if needed, but they are already managed in CourseManager.
        // For simplicity, we'll fetch all subjects here too or rely on a global state.
        // Since we don't have global subjects signal yet, we'll need to fetch them.
        return (
          <CourseStatistics
            course={course}
            subjects={subjects.value}
            lessons={lessons.value}
            periods={periods.value}
            labels={resourceLabels.value}
            onClose={() => {
              showCourseStatistics.value = false;
              selectedCourseIdForStats.value = null;
            }}
          />
        );
      })()}

      {showTeacherStatistics.value && selectedTeacherIdForStats.value && (() => {
        const teacher = resources.value.find(t => t.id === selectedTeacherIdForStats.value);
        if (!teacher) return null;
        
        const currentViewStart = startOfDay(currentDate.value);
        let dayCount = 1;
        
        if (viewType.value === 'day') dayCount = 1;
        else if (viewType.value === 'week') dayCount = 7;
        else if (viewType.value === 'month') {
          dayCount = differenceInDays(addMonths(currentViewStart, 1), currentViewStart);
        }
        else if (viewType.value === '3month' || viewType.value === '6month') {
          const months = viewType.value === '3month' ? 3 : 6;
          dayCount = differenceInDays(addMonths(currentViewStart, months), currentViewStart);
        }
        else if (viewType.value === 'year' || viewType.value === 'course_timeline') {
          const month = systemSettings.value?.yearViewStartMonth ?? 4;
          const day = systemSettings.value?.yearViewStartDay ?? 1;
          const start = new Date(getYear(currentDate.value), month - 1, day);
          const end = new Date(getYear(currentDate.value) + 1, month - 1, day);
          dayCount = differenceInDays(end, start);
        }

        const initialStart = format(currentViewStart, 'yyyy-MM-dd');
        const initialEnd = format(addDays(currentViewStart, dayCount - 1), 'yyyy-MM-dd');

        return (
          <TeacherStatistics
            teacher={teacher}
            courses={resources.value.filter(r => r.type === 'course')}
            subjects={subjects.value}
            lessons={lessons.value}
            periods={periods.value}
            labels={resourceLabels.value}
            initialStartDate={initialStart}
            initialEndDate={initialEnd}
            onClose={() => {
              showTeacherStatistics.value = false;
              selectedTeacherIdForStats.value = null;
            }}
          />
        );
      })()}

      {showAllTeacherStatistics.value && (() => {
        const currentViewStart = startOfDay(currentDate.value);
        let dayCount = 1;
        
        if (viewType.value === 'day') dayCount = 1;
        else if (viewType.value === 'week') dayCount = 7;
        else if (viewType.value === 'month') {
          dayCount = differenceInDays(addMonths(currentViewStart, 1), currentViewStart);
        }
        else if (viewType.value === '3month' || viewType.value === '6month') {
          const months = viewType.value === '3month' ? 3 : 6;
          dayCount = differenceInDays(addMonths(currentViewStart, months), currentViewStart);
        }
        else if (viewType.value === 'year' || viewType.value === 'course_timeline') {
          const month = systemSettings.value?.yearViewStartMonth ?? 4;
          const day = systemSettings.value?.yearViewStartDay ?? 1;
          const start = new Date(getYear(currentDate.value), month - 1, day);
          const end = new Date(getYear(currentDate.value) + 1, month - 1, day);
          dayCount = differenceInDays(end, start);
        }

        const initialStart = format(currentViewStart, 'yyyy-MM-dd');
        const initialEnd = format(addDays(currentViewStart, dayCount - 1), 'yyyy-MM-dd');

        return (
          <AllTeacherStatistics
            teachers={resources.value.filter(r => r.type === 'teacher')}
            lessons={lessons.value}
            periods={periods.value}
            labels={resourceLabels.value}
            initialStartDate={initialStart}
            initialEndDate={initialEnd}
            onClose={() => {
              showAllTeacherStatistics.value = false;
            }}
          />
        );
      })()}

      {showAuditLogManager.value && (
        <AuditLogManager
          backendUrl={BACKEND_URL}
          onClose={() => showAuditLogManager.value = false}
        />
      )}
    </div>
  );
}
