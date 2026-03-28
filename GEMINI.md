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
- **フルスタック構成:** データベース（PostgreSQL）から取得したリソース、授業、イベントデータをリアルタイムに表示。
- **日付ベースのスケジュール管理:** 特定の日付に対して授業（イベント）を割り当てる形式。
- **固定 8 限表示:** 1 日を 8 つのタイムスロット（時限）として表示。休み時間は非表示。
- **イベント行の統合:**
  - 時限ヘッダーの直後に、祝日、休暇、学校行事（入学式、清掃等）を統合して表示する固定行。
  - 祝日データおよびカスタムイベントデータの双方に対応。
- **マルチビュー対応:**
  - **1日 / 1週間 / 1ヶ月 / 1年 (4月始まり)** の表示切り替え。
  - すべてのビューで時限の幅（60px）を一定に保ち、一貫した情報量を維持。
- **国際化 (i18n) & 曜日表示:**
  - ブラウザのロケール設定に基づき、日付・曜日を自動的に適切な言語で表示。
  - ヘッダーに曜日を表示し、土曜日（青）/ 日曜日（赤）を視覚的に強調。
- **動的リソース切り替え & ラベルカスタマイズ:**
  - 行（Y軸）を「教室」「講師」「講座」などで動的に切り替え可能。
  - 各リソースの表示名（ラベル）は設定により一括変更可能（例：「講師」→「先生」）。
- **リソースの順序制御:** `order` フィールドにより、リソースの表示順序を任意に制御可能。
- **Sticky レイアウト:**
  - ヘッダー（日付・時限・イベント）およびサイドバー（リソースラベル列）を固定し、スクロール時の一覧性を確保。
  - 水平スクロール中もリソースラベルが画面外に消えないよう列を完全に固定し、セルの重なりや位置ズレが発生しないように制御する。
  - 垂直スクロール時もヘッダー部分が固定される。

## データインターフェース (Data Structures)

```typescript
export type ViewType = 'day' | 'week' | 'month' | 'year';
export type ResourceType = 'room' | 'teacher' | 'course';
export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';

// ユーザー定義
interface User {
  id: string;
  email: string;
  role: UserRole;
}

// リソース定義 (Resource テーブル)
interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  order: number;
}

// 授業データ (Lesson テーブル)
interface Lesson {
  id: string;
  subject: string;
  teacherId: string;
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
- [ ] ドラッグ＆ドロップによる授業の移動・編集機能
- [ ] AI によるスケジューリング最適化/支援機能の検討
