# Education Scheduler (Resource Scheduler)

教育施設のリソース（教室・講師・講座）管理に特化したカレンダーサービス

## 技術スタック (Tech Stack)

### フロントエンド (Frontend)
- **UI ライブラリ:** Preact (仮想DOM、軽量・高速)
- **言語:** TypeScript
- **状態管理:** @preact/signals (ピンポイントな再レンダリングによる高パフォーマンス)
- **レイアウト:** CSS Grid (複数コマ跨ぎ・マルチビューのネイティブサポート)
- **日付操作:** date-fns, Intl.DateTimeFormat (ロケール対応)
- **国際化 (i18n):** i18next, react-i18next (英訳ベースのキー管理、ロケールに応じた動的切り替え)
- **ビルドツール:** Vite

### バックエンド (Backend)
- **実行環境:** Node.js (Express)
- **言語:** TypeScript (ts-node-dev による開発)
- **データベース:** PostgreSQL
- **ORM:** Prisma 7 (型安全なデータベースアクセス、driver-adapter による高速な通信)
- **認証:** JSON Web Token (JWT), bcryptjs (パスワードハッシュ化)

## 主要要件 (Key Features)

- **認証 & 認可 (Auth & RBAC):**
  - JWT ベースのログイン機能。セッションは `localStorage` で永続化.
  - ロール（ADMIN, TEACHER, STUDENT）によるアクセス制御（RBAC）の実装。
  - ログイン前はスケジュールの閲覧を制限。
  - 講師ロールのユーザーは、特定のリソース（講師）と 1:1 で紐付けることが可能。
- **フルスタック構成:** データベース（PostgreSQL）から取得したリソース、授業、イベント、および時限データをリアルタイムに表示。
- **日付ベースのスケジュール管理:** 
  - 特定の日付に対して授業（イベント）を割り当てる形式。
  - **初期表示日:** アプリケーション起動時のデフォルト表示日は「当日（今日）」とする。
- **動的な時限表示:** 
  - 1 日の時限数（タイムスロット）は固定ではなく、データベースの設定により動的に変更可能。
  - 各時限は、名称、開始時間、終了時間を保持する。
  - 時限の名称は翻訳の対象外（データベースの値をそのまま表示）とする。
  - 管理画面（メニューとフォーム）から時限の設定を変更可能とする。
  - **IDの固定:** 既存の授業やイベントとの紐付けを維持するため、時限の ID は `p1`, `p2`, ... の形式で固定し、順序（order）に基づいて自動的に割り当てる。
  - **削除の制限:** 途中の時限を削除して ID のインデックスがずれるのを防ぐため、削除は常にリストの最後尾からのみ行える。
- **リソース表示名の動的管理:**
  - 各種リソース（教室、講師、講座、イベント、メイン講師、サブ講師、メイン教室）の表示ラベル（ResourceLabels）は、データベースで保持し、動的に変更可能とする。
  - リソースの表示名、および設定画面における各項目のラベルは翻訳の対象外（データベースの値をそのまま表示、または固定ラベルを使用）とする。
  - 管理画面（設定メニュー内のフォーム）からラベルを一括変更可能とする。
- **イベント行の統合:**
  - 時限ヘッダーの直後に、祝日、休暇、学校行事（入学式、清掃等）を統合して表示する固定行。
  - 祝日データおよびカスタムイベントデータ（行事名）の双方に対応。
  - 祝日および行事（ScheduleEvent）の名前は、翻訳の対象外（データの値をそのまま表示）とする。
  - **マルチビュー対応:**
  - **1日 / 1週間 / 1ヶ月 / 1年 (4月始まり)** の表示切り替え。
  - **1日ビュー:** 時限の列幅を `1fr`（等分割）とし、親領域いっぱいに広げて表示する。このビューでは水平スクロールを無効化する。
  - **週間・月間・年間ビュー:** 時限の列幅を `50px` 固定とし、一貫した情報密度を維持する。領域を超える場合は水平スクロールが可能。
- **国際化 (i18n) & 曜日表示:**
  - `react-i18next` を使用し、ハードコーディングされた日本語ラベルを英語キーベースの翻訳に移行。
  - ブラウザのロケール設定に基づき、日付・曜日および UI ラベルを自動的に適切な言語（日本語/英語等）で表示。
  - ヘッダーに曜日を表示し、土曜日（青）/ 日曜日（赤）を視覚的に強調。
- **動的リソース切り替え & ラベルカスタマイズ:**
  - 行（Y軸）を「教室」「講師」「講座」などで動的に切り替え可能。
  - 各リソースの表示名（ラベル）は設定により一括変更可能（例：「講師」→「先生」）。
  - メイン講師・サブ講師のラベルも設定可能で、いずれも対等な扱いで表示する。
- **リソースの順序制御:** `order` フィールドにより、リソースの表示順序を任意に制御可能。
- **講座 (Course) 管理:**
  - 講座には開始年月日と終了年月日を保持させる（0時開始、24時終了を想定）。
  - 講座には、あらかじめ複数の課目（Subject）とその合計時限数を関連付けることが可能。
  - 講座の編集時、講座課目（CourseSubject）は、CSV からのインポートも可能とする（name, totalPeriods の 2 列）。
  - **メイン教室の設定:** 講座ごとに「メイン教室」を設定可能。
    - 教室（Room）ビューでメイン教室の空きセルをダブルクリックした場合、その講座を初期選択した状態で授業作成ダイアログを開く。
    - 授業（Lesson）作成時、選択された講座にメイン教室が設定されている場合、その教室をデフォルトの場所（roomId）として自動入力する。
  - **講座を管理する講師の設定:** 講座ごとに「管理講師（主任）」と「補佐講師（助手）」をあらかじめ指定できる（授業作成時のデフォルト値には使用しない）。
  - **講師呼称のカスタマイズ:** 講座ごとに講師の呼び方（例：「教授」「TA」など）を個別に設定可能（未設定時はグローバル設定を使用）。
  - 管理画面から講座の作成・修正・削除を行えるようにする。
- **教室 (Room) 管理:**
  - 管理画面（メニューとフォーム）から教室の作成・修正・削除を行えるようにする。
- **講師 (Teacher) 管理:**
  - 管理画面（メニューとフォーム）から講師の作成・修正・削除を行えるようにする。
- **Sticky レイアウト:**
  - ヘッダー（日付・時限・イベント）およびサイドバー（リソースラベル列）を固定し、スクロール時の一覧性を確保.
  - 水平スクロール中もリソースラベルが画面外に消えないよう列を完全に固定し、セルの重なりや位置ズレが発生しないように制御する。
  - 垂直スクロール時もヘッダー部分が固定される。
  - **重ね合わせ順序 (z-index):** 以下の優先順位で表示の重なりを制御する。
    1. `grid-corner` (左上の交差点): `100` (最前面)
    2. `date-header` / `period-header` (ヘッダー): `35` / `34`
    3. `event-label` (イベント行ラベル): `30`
    4. `event-card` (イベントカード): `26`
    5. `grid-label` (リソース行ラベル): `25`
    6. `event-cell` (イベント行セル): `18`
- **イベント・授業の表示制御:**
  - **ScheduleEvent:** 必要に応じ「イベント行のみ」「リソース行のみ」「双方」の表示制御が可能 (`showInEventRow` フラグ)。
  - **イベント行の重なり:** イベント行（3行目）で祝日や行事が時間的に重なる場合、垂直方向に自動でオフセットを計算し、重ならないように段を変えて表示する。
  - **祝日の表示範囲:** 祝日（Holiday）は、該当する日の最初から**最終時限まで**をカバーして表示する。
  - **Lesson:** 
    - サブ講師が割り当てられた場合、メイン講師とサブ講師の両方の行に同一の授業を表示する。ラベルには関連する全講師を対等に（「メイン」「サブ」の区別なく）併記する。
    - **柔軟な場所指定:** 教室（Roomリソース）を選択する代わりに、管理外の場所（オンライン、体育館等）をテキストで直接入力可能。
    - **メイン講師の任意性:** メイン講師が未選択の状態でも登録可能。メイン講師がいない授業は、背景色を薄い紫色（#e884fa）で表示して視覚的に区別する。
    - **ダブルブッキング警告:** 授業の登録・更新時、同一時間帯にリソース（教室、メイン講師、サブ講師）が重複して使用されている場合に警告を表示する。


## データインターフェース (Data Structures)

```typescript
export type ViewType = 'day' | 'week' | 'month' | 'year';
export type ResourceType = 'room' | 'teacher' | 'course';
export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

interface ResourceLabels {
  room: string;
  teacher: string;
  course: string;
  event: string;
  mainTeacher: string;
  subTeacher: string;
  mainRoom: string;
}

// ユーザー定義
interface User {
  id: string;
  email: string;
  role: UserRole;
  resourceId?: string; // 対応する講師リソース等
}

// 時限定義 (TimePeriod テーブル)
interface TimePeriod {
  id: string;
  name: string;
  startTime: string; // HH:mm 形式
  endTime: string;   // HH:mm 形式
  order: number;
}

// 講座課目定義
interface CourseSubject {
  id: string;
  name: string;
  totalPeriods: number;
}

// リソース定義 (Resource テーブル)
interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  order: number;
  userId?: string; // 紐付けられたユーザーID (講師の場合)
  startDate?: string; // 講座開始日 YYYY-MM-DD
  endDate?: string;   // 講座終了日 YYYY-MM-DD
  subjects?: CourseSubject[]; // 講座に関連する課目
  mainRoomId?: string;
  chiefTeacherId?: string;
  assistantTeacherIds?: string[];
  mainTeacherLabel?: string;
  subTeacherLabel?: string;
}

// 授業データ (Lesson テーブル)
interface Lesson {
  id: string;
  subject: string;
  teacherId?: string; // メイン講師 (任意)
  subTeacherIds?: string[]; // サブ講師 (ID配列)
  subTeachers?: { id: string }[]; // バックエンドからのリレーション
  roomId?: string; // 教室 (任意)
  courseId: string;
  location?: string; // 管理外の場所名
  startDate: string;
  startPeriodId: string;
  endDate: string;
  endPeriodId: string;
}

// スケジュールイベント (ScheduleEvent テーブル)
interface ScheduleEvent {
  id: string;
  name: string;
  startDate: string;
  startPeriodId: string;
  endDate: string;
  endPeriodId: string;
  color?: string;
  resourceIds?: string[]; // 紐付け先リソースID配列
  resources?: { id: string }[]; // バックエンドからのリレーション
  showInEventRow?: boolean; // イベント行に表示するかどうかの制御
}

// 祝日・休暇データ
interface Holiday {
  id: string;
  name: string;
  date?: string;  // 単一日の場合
  start?: string; // 期間の場合の開始日
  end?: string;   // 期間の場合の終了日
}
```

## 開発ルール (Development Rules)

- **仕様の更新フロー:** 仕様の追加・変更を行う際は、まず `GEMINI.md` を更新して定義を確定させた後、ソースコードの修正に着手すること。
- **CSS Importの保持:** Component において、css の import を勝手に削除しないこと。
- **Git操作の制限:** Git への commit と push は、指示がない限り行わない。

## 開発・プロトタイプの状況

- [x] Vite + Preact + TypeScript のセットアップ
- [x] CSS Grid によるマルチビュー（1日/1週/1月/1年）の実装
- [x] Sticky ヘッダー/サイドバーの完全実装
- [x] イベント行の実装と祝日・行事の統合表示
- [x] Node.js (Express) + Prisma + PostgreSQL によるバックエンド構築
- [x] JWT による認証機能とロールベースアクセス制御（RBAC）
- [x] フロントエンドのログイン画面とセッション管理の実装
- [x] データベースからの動的データ取得（API連携）への移行
- [x] 初期データ投入用シードスクリプトの作成
- [x] `concurrently` によるフロントエンド・バックエンドの一括起動環境
- [x] サブ講師（複数）およびリソース個別イベントの表示対応
- [x] イベント行における表示重なりの自動回避ロジックの実装
- [x] 現在の表示モード（viewMode/viewType）のボタン配色反転による強調表示
- [x] `react-i18next` による国際化 (i18n) の完全実装と日本語/英語対応
- [x] 動的な時限 (TimePeriod) 管理機能の実装 (DB/API/UI)
- [x] 講座 (Course) 管理機能（CRUD + 課目 CSV インポート + メイン教室・講座管理講師）の実装
- [x] 教室 (Room) 管理機能（CRUD）の実装
- [x] 行事 (ScheduleEvent) 管理機能（CRUD + 重複時の等分割表示）の実装
- [x] 授業 (Lesson) 管理機能（CRUD + 講座期間バリデーション + 課目残り時限計算 + ダブルブッキング警告）の実装
- [ ] ドラッグ＆ドロップによる授業の移動・編集機能
- [ ] AI によるスケジューリング最適化/支援機能の検討
