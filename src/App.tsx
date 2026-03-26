import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { Timetable } from './components/Timetable';
import { MOCK_RESOURCES, MOCK_LESSONS, ResourceType, ViewType, DEFAULT_PERIODS, Holiday, ResourceLabels } from './types';
import { format, addDays, getYear, getMonth } from 'date-fns';

export function App() {
  const viewMode = useSignal<ResourceType>('room');
  const viewType = useSignal<ViewType>('day');
  const currentDate = useSignal<Date>(new Date('2026-03-26'));
  const holidays = useSignal<Holiday[]>([]);

  // リソースの表示名設定 (ここで自由に変更可能)
  const resourceLabels = useSignal<ResourceLabels>({
    room: '教室',
    teacher: '講師',
    course: '講座'
  });

  useEffect(() => {
    fetch('/holidays.json')
      .then(res => res.json())
      .then(data => holidays.value = data)
      .catch(err => console.error('Failed to load holidays:', err));
  }, []);

  const filteredResources = MOCK_RESOURCES.filter(r => r.type === viewMode.value);

  const moveDate = (amount: number) => {
    if (viewType.value === 'day') currentDate.value = addDays(currentDate.value, amount);
    if (viewType.value === 'week') currentDate.value = addDays(currentDate.value, amount * 7);
    if (viewType.value === 'month') currentDate.value = addDays(currentDate.value, amount * 30);
    if (viewType.value === 'year') currentDate.value = addDays(currentDate.value, amount * 365);
  };

  const handleViewTypeChange = (type: ViewType) => {
    viewType.value = type;
    if (type === 'year') {
      const year = getMonth(currentDate.value) < 3 ? getYear(currentDate.value) - 1 : getYear(currentDate.value);
      currentDate.value = new Date(year, 3, 1);
    }
  };

  return (
    <main>
      <h1>学校スケジューラー</h1>
      
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
          <span className="current-date">{format(currentDate.value, 'yyyy/MM/dd')}〜</span>
          <button onClick={() => moveDate(1)}>次へ</button>
        </div>
      </div>

      <Timetable 
        periods={DEFAULT_PERIODS}
        resources={filteredResources}
        lessons={MOCK_LESSONS}
        viewMode={viewMode.value}
        viewType={viewType.value}
        baseDate={currentDate.value}
        holidays={holidays.value}
        labels={resourceLabels.value}
      />
    </main>
  );
}
