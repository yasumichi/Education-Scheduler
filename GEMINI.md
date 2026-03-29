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
- **ORM:** Prisma (型安全なデータベースアクセスとマイグレーション)
- **認証:** JSON Web Token (JWT), bcryptjs (パスワードハッシュ化)

## 主要要件 (Key Features)

- **認証 & 認可 (Auth & RBAC):**
  - JWT ベースのログイン機能。セッションは `localStorage` で永続化。
  - ロール（ADMIN, TEACHER, STUDENT）によるアクセス制御（RBAC）の実装。
  - ログイン前はスケジュールの閲覧を制限。
  - 講師ロールのユーザーは、特定のリソース（講師）と 1:1 で紐付けることが可能。
- **フルスタック構成:** データベース（PostgreSQL）から取得したリソース、授業、イベント、および時限データをリアルタイムに表示。
- **日付ベースのスケジュール管理:** 特定の日付に対して授業（イベント）を割り当てる形式。
- **動的な時限表示:** 
  - 1 日の時限数（タイムスロット）は固定ではなく、データベースの設定により動的に変更可能。
  - 各時限は、名称、開始時間、終了時間を保持する。
  - 時限の名称は翻訳の対象外（データベースの値をそのまま表示）とする。
  - 管理画面（メニューとフォーム）から時限の設定を変更可能とする。
- **リソース表示名の動的管理:**
  - 各種リソース（教室、講師、講座、イベント、メイン講師、サブ講師）の表示ラベル（ResourceLabels）は、データベースで保持し、動的に変更可能とする。
  - リソースの表示名、および設定画面における各項目のラベルは翻訳の対象外（データベースの値をそのまま表示、または固定ラベルを使用）とする。
  - 管理画面（設定メニュー内のフォーム）からラベルを一括変更可能とする。
- **イベント行の統合:**
  - 時限ヘッダーの直後に、祝日、休暇、学校行事（入学式、清掃等）を統合して表示する固定行。
  - 祝日データおよびカスタムイベントデータの双方に対応。
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
- **Sticky レイアウト:**
  - ヘッダー（日付・時限・イベント）およびサイドバー（リソースラベル列）を固定し、スクロール時の一覧性を確保。
  - 水平スクロール中もリソースラベルが画面外に消えないよう列を完全に固定し、セルの重なりや位置ズレが発生しないように制御する。
  - 垂直スクロール時もヘッダー部分が固定される。
- **イベント・授業の表示制御:**
  - **ScheduleEvent:** 必要に応じ「イベント行のみ」「リソース行のみ」「双方」の表示制御が可能 (`showInEventRow` フラグ)。
  - **イベント行の重なり:** イベント行（3行目）で祝日や行事が時間的に重なる場合、垂直方向に自動でオフセットを計算し、重ならないように段を変えて表示する。
  - **Lesson:** サブ講師が割り当てられた場合、メイン講師とサブ講師の両方の行に同一の授業を表示する。ラベルには関連する全講師を対等に（「メイン」「サブ」の区別なく）併記する。

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

// リソース定義 (Resource テーブル)
interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  order: number;
  userId?: string; // 紐付けられたユーザーID (講師の場合)
}

// 授業データ (Lesson テーブル)
interface Lesson {
  id: string;
  subject: string;
  teacherId: string;
  subTeacherIds?: string[]; // サブ講師 (ID配列)
  subTeachers?: { id: string }[]; // バックエンドからのリレーション
  roomId: string;
  courseId: string;
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
- [ ] 動的な時限 (TimePeriod) 管理機能の実装 (DB/API/UI)
- [ ] ドラッグ＆ドロップによる授業の移動・編集機能
- [ ] AI によるスケジューリング最適化/支援機能の検討
