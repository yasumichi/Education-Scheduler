# EduGrid Scheduler (Resource Scheduler)

Web ページで使用する、学校のリソース（教室・講師・講座）管理に特化したカレンダー部品の開発。

## 技術スタック (Tech Stack)

### フロントエンド (Frontend)
- **UI ライブラリ:** Preact (仮想DOM、軽量・高速)
- **言語:** TypeScript
- **状態管理:** @preact/signals (ピンポイントな再レンダリングによる高パフォーマンス)
- **レイアウト:** CSS Grid (複数コマ跨ぎ・マルチビューのネイティブサポート)
- **日付操作:** date-fns, Intl.DateTimeFormat (ロケール対応)
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
- **フルスタック構成:** データベース（PostgreSQL）から取得したリソース、授業、イベントデータをリアルタイムに表示。
- **日付ベースのスケジュール管理:** 特定の日付に対して授業（イベント）を割り当てる形式。
- **固定 8 限表示:** 1 日を 8 つのタイムスロット（時限）として表示。休み時間は非表示。
- **イベント行の統合:**
  - 時限ヘッダーの直後に、祝日、休暇、学校行事（入学式、清掃等）を統合して表示する固定行。
  - 祝日データおよびカスタムイベントデータの双方に対応。
- **マルチビュー対応:**
  - **1日 / 1週間 / 1ヶ月 / 1年 (4月始まり)** の表示切り替え。
  - **1日ビュー:** 時限の列幅を `1fr`（等分割）とし、親領域いっぱいに広げて表示する。このビューでは水平スクロールを無効化する。
  - **週間・月間・年間ビュー:** 時限の列幅を `50px` 固定とし、一貫した情報密度を維持する。領域を超える場合は水平スクロールが可能。
- **国際化 (i18n) & 曜日表示:**
  - ブラウザのロケール設定に基づき、日付・曜日を自動的に適切な言語で表示。
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
- [ ] ドラッグ＆ドロップによる授業の移動・編集機能
- [ ] AI によるスケジューリング最適化/支援機能の検討
