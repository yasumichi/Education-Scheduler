import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "Sign Out": "Sign Out",
      "Sign In": "Sign In",
      "Please sign in to continue": "Please sign in to continue",
      "Email": "Email",
      "Password": "Password",
      "1 day": "1 day",
      "1 week": "1 week",
      "1 month": "1 month",
      "1 year": "1 year",
      "Prev": "Prev",
      "Next": "Next",
      "Holiday Theme": "Holiday Theme",
      "Admin Login Hint": "Admin: admin@example.com / admin123",
      "Room": "Room",
      "Teacher": "Teacher",
      "Course": "Course",
      "Event": "Event",
      "Main Teacher": "Main Teacher",
      "Sub Teacher": "Sub Teacher",
      "Manage Periods": "Manage Periods",
      "Back to Timetable": "Back to Timetable",
      "Period Name": "Period Name",
      "Start Time": "Start Time",
      "End Time": "End Time",
      "Add Period": "Add Period",
      "Remove": "Remove",
      "Save Changes": "Save Changes",
      "Settings": "Settings",
      "Manage Labels": "Manage Labels",
      "Manage Courses": "Manage Courses",
      "Select Course to Edit": "Select Course to Edit",
      "Add New Course": "Add New Course",
      "Course Name": "Course Name",
      "Start Date": "Start Date",
      "End Date": "End Date",
      "Order": "Order",
      "Subjects": "Subjects",
      "Subject Name": "Subject Name",
      "Total Periods": "Total Periods",
      "Add Subject": "Add Subject",
      "Delete": "Delete",
      "Cancel": "Cancel",
      "Are you sure you want to delete this course?": "Are you sure you want to delete this course?"
    }
  },
  ja: {
    translation: {
      "Sign Out": "ログアウト",
      "Sign In": "ログイン",
      "Please sign in to continue": "ログインして続行してください",
      "Email": "メールアドレス",
      "Password": "パスワード",
      "1 day": "1日",
      "1 week": "1週間",
      "1 month": "1ヶ月",
      "1 year": "1年",
      "Prev": "前へ",
      "Next": "次へ",
      "Holiday Theme": "祝日テーマ",
      "Admin Login Hint": "管理者: admin@example.com / admin123",
      "Room": "教室",
      "Teacher": "講師",
      "Course": "講座",
      "Event": "行事",
      "Main Teacher": "メイン講師",
      "Sub Teacher": "サブ講師",
      "Manage Periods": "時限設定",
      "Back to Timetable": "スケジュールに戻る",
      "Period Name": "時限名",
      "Start Time": "開始時間",
      "End Time": "終了時間",
      "Add Period": "時限を追加",
      "Remove": "削除",
      "Save Changes": "設定を保存",
      "Settings": "設定",
      "Manage Labels": "表示名の設定",
      "Manage Courses": "講座の設定",
      "Select Course to Edit": "編集する講座を選択",
      "Add New Course": "講座を新規追加",
      "Course Name": "講座名",
      "Start Date": "開始年月日",
      "End Date": "終了年月日",
      "Order": "並び順",
      "Subjects": "課目",
      "Subject Name": "課目名",
      "Total Periods": "合計時限数",
      "Add Subject": "課目を追加",
      "Delete": "削除",
      "Cancel": "キャンセル",
      "Are you sure you want to delete this course?": "この講座を削除してもよろしいですか？",
      "Evacuation Drill": "全館避難訓練",
      "Business Trip": "出張（学会参加）",
      "Open Research Lesson": "研究授業（公開）",
      "School Cleaning": "校内清掃"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
