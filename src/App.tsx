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
import { LessonBatchManager } from './components/LessonBatchManager';
import { HolidayManager } from './components/HolidayManager';
import { UserManager } from './components/UserManager';
import { ProfileManager, ProfileMode } from './components/ProfileManager';
import { SystemSettingManager } from './components/SystemSettingManager';
import { SSOConfigDialog } from './components/SSOConfigDialog';
import { DeliveryMethodManager } from './components/DeliveryMethodManager';
import { ColorThemeManager } from './components/ColorThemeManager';
import { SubjectManager } from './components/SubjectManager';
import { EquipmentManager } from './components/EquipmentManager';
import { AuditLogManager } from './components/AuditLogManager';
import { LessonDuplicator } from './components/LessonDuplicator';
import { LessonHistory } from './components/LessonHistory';
import { CourseStatistics } from './components/CourseStatistics';
import { TeacherStatistics } from './components/TeacherStatistics';
import { AllTeacherStatistics } from './components/AllTeacherStatistics';
import { PersonalMonthlyView } from './components/PersonalMonthlyView';
import { CourseWeeklyView } from './components/CourseWeeklyView';
import { RoomEquipmentView } from './components/RoomEquipmentView';
import { Resource, Lesson, ScheduleEvent, ResourceType, ViewType, Holiday, ResourceLabels, AuthResponse, TimePeriod, SystemSetting, ColorTheme, Subject, SavedFilter, AuditLog } from './types';
import { format, addDays, addMonths, getYear, parseISO, differenceInMonths, differenceInDays, startOfDay, startOfWeek } from 'date-fns';
import { exportTimetableToExcel, exportPersonalMonthlyToExcel, exportCourseWeeklyToExcel } from './utils/excelExport';
import { apiFetch, userSignal, expiresAtSignal, showLoginModalSignal, retryPendingRequests, clearPendingRequests } from './utils/api';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export function App() {
  const { t, ready } = useTranslation();
  const viewMode = useSignal<ResourceType>('room');
  const viewType = useSignal<ViewType>('month');
  const showPersonalMonthly = useSignal<boolean>(false);
  const showCourseWeekly = useSignal<boolean>(false);
  const showLessonHistory = useSignal<boolean>(false);
  const selectedCourseIdForWeekly = useSignal<string | null>(null);
  const showRoomEquipmentView = useSignal<boolean>(false);
  const selectedRoomIdForEquipment = useSignal<string | null>(null);
  const currentDate = useSignal<Date>(new Date());
  const holidays = useSignal<Holiday[]>([]);
  const periods = useSignal<TimePeriod[]>([]);
  const systemSettings = useSignal<SystemSetting | null>(null);
  const colorThemes = useSignal<ColorTheme[]>([]);
  const savedFilters = useSignal<SavedFilter[]>([]);
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
  const showSSOConfigDialog = useSignal<boolean>(false);
  const profileMode = useSignal<ProfileMode>('profile');
  const showSystemSettingManager = useSignal<boolean>(false);
  const showDeliveryMethodManager = useSignal<boolean>(false);
  const showColorThemeManager = useSignal<boolean>(false);
  const showSubjectManager = useSignal<boolean>(false);
  const showEquipmentManager = useSignal<boolean>(false);
  const showAuditLogManager = useSignal<boolean>(false);
  const showLessonDuplicator = useSignal<boolean>(false);
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
  const showLessonBatchManager = useSignal<boolean>(false);
  const editingCourse = useSignal<Resource | null>(null);
  const showSettingsDropdown = useSignal<boolean>(false);
  const showUserDropdown = useSignal<boolean>(false);
  const resources = useSignal<Resource[]>([]);
  const lessons = useSignal<Lesson[]>([]);
  const events = useSignal<ScheduleEvent[]>([]);
  const subjects = useSignal<Subject[]>([]);
  const auditLogs = useSignal<AuditLog[]>([]);
  const sessionRestored = useSignal<boolean>(false);

  const saveViewStateAndReload = () => {
    localStorage.setItem('viewState', JSON.stringify({
      mode: viewMode.value,
      type: viewType.value,
      date: currentDate.value.toISOString()
    }));
    window.location.reload();
  };

  // Auth signal
  const authError = useSignal<string | undefined>(undefined);

  // Display name settings for resources
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
    subjectSmall: '',
    equipment: ''
  });

  // Restore session via /auth/me on initialization
  useEffect(() => {
    // Restore View State
    const savedViewState = localStorage.getItem('viewState');
    if (savedViewState) {
      const { mode, type, date } = JSON.parse(savedViewState);
      viewMode.value = mode;
      viewType.value = type;
      currentDate.value = new Date(date);
    }

    const restoreSession = async () => {
      try {
        const res = await apiFetch('/auth/me');
        if (res.ok) {
          const data = await res.json();
          userSignal.value = data;
          expiresAtSignal.value = data.expiresAt;
        }
      } catch (err) {
        console.error('Session restoration failed:', err);
      } finally {
        sessionRestored.value = true;
      }
    };
    restoreSession();
  }, []);

  // Save View State on changes
  useEffect(() => {
    localStorage.setItem('viewState', JSON.stringify({
      mode: viewMode.value,
      type: viewType.value,
      date: currentDate.value.toISOString()
    }));
  }, [viewMode.value, viewType.value, currentDate.value]);

  // Ensure dropdowns are exclusive
  useEffect(() => {
    if (showSettingsDropdown.value) {
      showUserDropdown.value = false;
    }
  }, [showSettingsDropdown.value]);

  useEffect(() => {
    if (showUserDropdown.value) {
      showSettingsDropdown.value = false;
    }
  }, [showUserDropdown.value]);

  const fetchData = async () => {
    if (!userSignal.value) return;
    try {
      const responses = await Promise.all([
        apiFetch('/resources'),
        apiFetch('/lessons'),
        apiFetch('/events'),
        apiFetch('/holidays'),
        apiFetch('/periods'),
        apiFetch('/labels'),
        apiFetch('/settings'),
        apiFetch('/color-themes'),
        apiFetch('/subjects'),
        apiFetch('/saved-filters')
      ]);

      const failed = responses.find(r => !r.ok);
      if (failed) {
        if (failed.status === 401) {
          // Handled by apiFetch
          return;
        } else {
          console.error(`Backend request failed with status ${failed.status}: ${failed.url}`);
        }
        return;
      }

      const [resResources, resLessons, resEvents, resHolidays, resPeriods, resLabels, resSettings, resThemes, resSubjects, resFilters] = responses;

      // Parse all JSON in parallel
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
      console.error('Failed to fetch data:', err);
    }
  };

  useEffect(() => {
    if (userSignal.value) {
      fetchData();
    }
  }, [userSignal.value]);

  // Align dates after loading settings
  useEffect(() => {
    if (showPersonalMonthly.value || showCourseWeekly.value || showLessonHistory.value) return;
    if (systemSettings.value && (viewType.value === 'year' || viewType.value === '3month' || viewType.value === '6month' || viewType.value === 'month' || viewType.value === 'week')) {
      handleViewTypeChange(viewType.value);
    }
  }, [systemSettings.value, showPersonalMonthly.value, showCourseWeekly.value, showLessonHistory.value]);

  const handleLogin = async (email: string, pass: string) => {
    authError.value = undefined;
    try {
      const res = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
        credentials: 'include'
      });

      const data: AuthResponse & { error?: string; expiresAt?: number } = await res.json();

      if (!res.ok) {
        authError.value = data.error || 'Login failed';
        return;
      }

      userSignal.value = data.user;
      expiresAtSignal.value = data.expiresAt || null;
      showLoginModalSignal.value = false;
      showUserDropdown.value = false;
      retryPendingRequests();
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
      userSignal.value = null;
      expiresAtSignal.value = null;
      clearPendingRequests();
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await apiFetch('/audit-logs');
      if (res.ok) {
        auditLogs.value = await res.json();
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };

  const handleSaveFilter = async (filter: Partial<SavedFilter>) => {
    try {
      const res = await apiFetch('/saved-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: filter.name, resourceType: viewMode.value, resourceIds: filter.resourceIds })
      });
      if (res.ok) {
        const newFilter = await res.json();
        savedFilters.value = [...savedFilters.value, newFilter];
      }
    } catch (err) {
      console.error('Failed to save filter:', err);
    }
  };

  const handleDeleteFilter = async (id: string) => {
    try {
      const res = await apiFetch(`/saved-filters/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        savedFilters.value = savedFilters.value.filter(f => f.id !== id);
      }
    } catch (err) {
      console.error('Failed to delete filter:', err);
    }
  };

  if (!sessionRestored.value || !ready) {
    return <div className="loading">Loading...</div>;
  }

  if (!userSignal.value) {
    return <Login onLogin={handleLogin} error={authError.value} backendUrl={BACKEND_URL} />;
  }

  const moveDate = (amount: number) => {
    if (showPersonalMonthly.value || showCourseWeekly.value || showLessonHistory.value) {
      const nextDate = new Date(currentDate.value);
      if (showPersonalMonthly.value) {
        nextDate.setMonth(nextDate.getMonth() + amount);
      } else if (showCourseWeekly.value) {
        nextDate.setDate(nextDate.getDate() + amount * 7);
      } else if (showLessonHistory.value) {
        nextDate.setDate(nextDate.getDate() + amount);
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
    if (!userSignal.value?.resourceId) return;
    exportPersonalMonthlyToExcel({
      userResourceId: userSignal.value.resourceId,
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
          {userSignal.value && (
            <div className="user-info">
              {(userSignal.value.role === 'ADMIN' || userSignal.value.role === 'EQUIPMENT_MANAGER') && (
                <div className="settings-container">
                  <button 
                    className="settings-button" 
                    onClick={() => showSettingsDropdown.value = !showSettingsDropdown.value}
                  >
                    {t('Settings')}
                  </button>
                  {showSettingsDropdown.value && (
                    <div className="settings-dropdown">
                      {userSignal.value.role === 'ADMIN' && (
                        <>
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
                             showEquipmentManager.value = true;
                             showSettingsDropdown.value = false;
                           }}
                          >
                           {t('Manage {{resource}}', { resource: resourceLabels.value.equipment })}
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
                              showLessonDuplicator.value = true;
                              showSettingsDropdown.value = false;
                            }}
                          >
                            {t('Duplicate Lessons')}
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
                              showSSOConfigDialog.value = true;
                              showSettingsDropdown.value = false;
                            }}
                          >
                            {t('SSO Configuration')}
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
                        </>
                      )}
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
                    if (userSignal.value?.resourceId) {
                      const teacher = resources.value.find(r => r.id === userSignal.value?.resourceId);
                      if (teacher) return t(teacher.name);
                    }
                    return userSignal.value?.email;
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
                    {userSignal.value?.resourceId && (
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          currentDate.value = new Date();
                          showPersonalMonthly.value = true;
                          showUserDropdown.value = false;
                        }}
                      >
                        {t('Personal Monthly')}
                      </button>
                    )}
                    {userSignal.value?.resourceId && (
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
                    {userSignal.value?.resourceId && (
                      <button 
                        className="dropdown-item" 
                        onClick={() => {
                          profileMode.value = 'csv_export';
                          showProfileManager.value = true;
                          showUserDropdown.value = false;
                        }}
                      >
                        {t("Export Schedule (desknet's NEO)")}
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
          {showPersonalMonthly.value || showCourseWeekly.value || showLessonHistory.value ? (
            <div className="control-group">
              <button onClick={() => {
                showPersonalMonthly.value = false;
                showCourseWeekly.value = false;
                showLessonHistory.value = false;
              }}>
                {t('Back to Timetable')}
              </button>
              <span className="personal-view-title">{showPersonalMonthly.value ? t('Personal Monthly') : (showCourseWeekly.value ? t('Weekly Schedule') : t('History'))}</span>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <button
              className={showLessonHistory.value ? 'active' : ''}
              onClick={() => showLessonHistory.value = true}
              title={t('History')}
            >
              {t('History')}
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        {showLessonHistory.value ? (
          <LessonHistory 
            backendUrl={BACKEND_URL}
            courses={resources.value.filter(r => r.type === 'course')}
            resources={resources.value}
            periods={periods.value}
            subjects={subjects.value}
            labels={resourceLabels.value}
          />
        ) : showPersonalMonthly.value && userSignal.value?.resourceId ? (
          <PersonalMonthlyView 
            userResourceId={userSignal.value.resourceId}
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
                resourceIds: [userSignal.value!.resourceId!],
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
            onBatchCreate={(courseId) => {
              const course = resources.value.find(r => r.id === courseId);
              if (course) {
                editingCourse.value = course;
                showLessonBatchManager.value = true;
              }
            }}
            onViewStats={(courseId) => {
              selectedCourseIdForStats.value = courseId;
              showCourseStatistics.value = true;
            }}
            onEmptyResourceCellClick={(resourceId, date, periodId) => {
              const initial: Partial<Lesson> = { startDate: date, startPeriodId: periodId, endDate: date, endPeriodId: periodId };
              if (viewMode.value === 'room') {
                initial.roomId = resourceId;
                const relatedCourse = resources.value.find(c => c.type === 'course' && c.mainRoomId === resourceId);
                if (relatedCourse) initial.courseId = relatedCourse.id;
              }
              else if (viewMode.value === 'teacher') initial.teacherId = resourceId;
              else if (viewMode.value === 'course') initial.courseId = resourceId;
              editingLesson.value = initial;
              showLessonManager.value = true;
            }}
            onReload={saveViewStateAndReload}
          />
        )}
      </div>

      {showLessonBatchManager.value && editingCourse.value && (
        <LessonBatchManager
          backendUrl={BACKEND_URL}
          onClose={() => showLessonBatchManager.value = false}
          onUpdate={fetchData}
          course={editingCourse.value}
          periods={periods.value}
          lessons={lessons.value}
          resources={resources.value}
          subjects={subjects.value}
          labels={resourceLabels.value}
          holidays={holidays.value}
        />
      )}
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
          isAdmin={userSignal.value?.role === 'ADMIN'}
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
          isAdmin={userSignal.value?.role === 'ADMIN' || userSignal.value?.role === 'EQUIPMENT_MANAGER'}
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
          isAdmin={userSignal.value?.role === 'ADMIN'}
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
          holidays={holidays.value}
          initialLesson={editingLesson.value || {}}
          user={userSignal.value!}
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

      {showUserManager.value && userSignal.value && (
        <UserManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showUserManager.value = false}
          currentUser={userSignal.value}
        />
      )}

      {showProfileManager.value && userSignal.value && (
        <ProfileManager 
          backendUrl={BACKEND_URL} 
          onClose={() => showProfileManager.value = false}
          user={userSignal.value}
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

      {showSSOConfigDialog.value && (
        <SSOConfigDialog
          backendUrl={BACKEND_URL}
          onClose={() => showSSOConfigDialog.value = false}
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

      {showLessonDuplicator.value && (
        <LessonDuplicator
          backendUrl={BACKEND_URL}
          resources={resources.value}
          labels={resourceLabels.value}
          onClose={() => showLessonDuplicator.value = false}
          onUpdate={fetchData}
        />
      )}

      {showAuditLogManager.value && (
       <AuditLogManager
         backendUrl={BACKEND_URL}
         onClose={() => showAuditLogManager.value = false}
       />
      )}

      {showEquipmentManager.value && (
        <EquipmentManager
          backendUrl={BACKEND_URL}
          onClose={() => showEquipmentManager.value = false}
          labels={resourceLabels.value}
        />
      )}

      {showRoomEquipmentView.value && selectedRoomIdForEquipment.value && (() => {
        const room = resources.value.find(r => r.id === selectedRoomIdForEquipment.value);
        if (!room) return null;
        return (
          <RoomEquipmentView
            room={room}
            onClose={() => showRoomEquipmentView.value = false}
            labels={resourceLabels.value}
          />
        );
      })()}

      {showLoginModalSignal.value && (
        <div className="login-modal-overlay">
          <div className="login-modal-content">
            <Login 
              onLogin={handleLogin} 
              error={authError.value} 
              backendUrl={BACKEND_URL} 
            />
            <button 
              className="login-modal-close" 
              onClick={() => {
                showLoginModalSignal.value = false;
                clearPendingRequests();
              }}
            >
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
