# ScholaTile

教育施設のリソース（教室・講師・講座）管理に特化したカレンダーサービス。

## 1. Architecture & Tech Stack

### Frontend
- **Framework:** Preact (仮想DOM、軽量・高速)
- **Language:** TypeScript
- **State Management:** `@preact/signals` (細粒度なリアクティビティによる高パフォーマンス)
- **Styling:** Vanilla CSS + CSS Grid (複数コマ跨ぎ・マルチビューのネイティブサポート)
- **Internationalization:** `i18next`, `react-i18next` (キーベースの翻訳、ブラウザロケール動的切り替え)
- **Build Tool:** Vite

### Backend
- **Runtime:** Node.js (Express)
- **Language:** TypeScript (`ts-node-dev` による開発)
- **Database:** PostgreSQL
- **ORM:** Prisma 7 (型安全なアクセス、driver-adapter による高速通信)
- **Authentication:** JWT (JSON Web Token) + `bcryptjs`. セッションは `HttpOnly` Cookie で管理。

---

## 2. Key Features

### Core Scheduling (スケジューリング)
- **動的時限表示:** 1日の時限数（TimePeriod）はDB設定により可変。名称、開始・終了時間を保持。
- **イベント行の統合:** 祝日、休暇、学校行事（ScheduleEvent）を最上部の固定行に統合表示。
- **マルチビュー:** 1日 / 1週間 / 1ヶ月 / 1年 (4月始まり) の表示切り替えに対応。
- **重なり回避ロジック:** 
  - イベント行（最上部）とリソース行（各行内）の両方で、時間的に重なる要素を垂直方向にオフセットして自動回避。
- **ダブルブッキング警告:** 授業の登録・更新時、リソース（教室・講師）の重複を検知し警告。

### Resource & Label Management (リソース・ラベル管理)
- **リソースタイプ:** 「教室 (Room)」「講師 (Teacher)」「講座 (Course)」の3種類。
- **表示ラベルの動的変更:** リソース名や「メイン講師」等のラベルをDBで一括管理・変更可能。
- **講師とユーザーの紐付け:** 講師リソースを特定のシステムユーザーと 1:1 で紐付け可能。
- **講座の詳細管理:** 開始/終了年月日、メイン教室、管理講師（主任・補佐）、および関連する課目（Subject）と合計時限数を管理。

### Administration (管理機能)
- **CRUD 画面:** 時限、教室、講師、講座、授業、行事、祝日、ユーザー、システム設定の各管理画面。
- **インポート機能:** 
  - 祝日: Nager.Date API または JSON ファイルからインポート。
  - 講座課目: CSV からの一括インポート。
- **ユーザー管理:** ロール（ADMIN, TEACHER, STUDENT）による RBAC。サインアップの許可設定、パスワードリセット機能。

### UI/UX & Layout (レイアウト)
- **Sticky レイアウト:** ヘッダー（日付・時限・イベント）およびサイドバー（リソース列）を完全固定。
- **ビューごとの列幅制御:** 
  - 1日ビュー: `1fr` (等分割、水平スクロールなし)
  - 週間・月間・年間ビュー: `50px` 固定 (水平スクロールあり)
- **視覚的強調:** 土日祝日の配色変更、メイン講師不在時の授業背景色変更 (#e884fa)、現在の表示モードのハイライト。

---

## 3. Implementation Rules & Conventions

### Coding Standards
- **Naming:** 
  - Component: PascalCase (e.g., `LessonManager.tsx`)
  - Function/Variable: camelCase
  - API Routes: RESTful (e.g., `GET /api/lessons`, `POST /api/courses`)
- **State:** グローバルまたは複雑な共有状態には Preact Signals を優先的に使用する。
- **CSS:** Vanilla CSS を使用。CSS Grid/Flexbox を最大限活用する。Component ごとに `.css` ファイルを分け、import を勝手に削除しないこと。

### Development Workflow
- **Specification First:** 仕様変更時はまず `GEMINI.md` を更新し、定義を確定させてから着手する。
- **Data Integrity:** DB保存時、空文字は原則として `null` として処理する。
- **Safety:** Git への commit/push は明示的な指示がない限り行わない。

### UI Layering (z-index)
1. `100`: `grid-corner` (左上交差点)
2. `35` / `34`: `date-header` / `period-header`
3. `30`: `event-label`
4. `26`: `event-card`
5. `25`: `grid-label` (リソース行ラベル)
6. `18`: `event-cell` (イベント行背景)

---

## 4. Core Domain Models (Data Interfaces)

### Base Types
```typescript
export type ViewType = 'day' | 'week' | 'month' | 'year';
export type ResourceType = 'room' | 'teacher' | 'course';
export type UserRole = 'ADMIN' | 'TEACHER' | 'STUDENT';
```

### Main Entities
- **Resource:** `id, name, type, order, userId, startDate, endDate, mainRoomId, chiefTeacherId, assistantTeacherIds, mainTeacherLabel, subTeacherLabel`
- **Lesson:** `id, subject, startDate, startPeriodId, endDate, endPeriodId, roomId, teacherId, courseId, location, subTeacherIds`
- **ScheduleEvent:** `id, name, startDate, startPeriodId, endDate, endPeriodId, color, showInEventRow, resourceIds`
- **TimePeriod:** `id, name, startTime, endTime, order` (IDは `p1`, `p2` ... 形式を維持)
- **Holiday:** `id, name, date, start, end`
- **ResourceLabels:** `room, teacher, course, event, mainTeacher, subTeacher, mainRoom`

---

## 5. Roadmap & Project Status

### Implemented Features (Completed)
- [x] Preact + Signals + CSS Grid によるマルチビュー・Sticky レイアウト
- [x] Node.js + Prisma + PostgreSQL バックエンド & JWT 認証 (HttpOnly Cookie)
- [x] 国際化 (i18n) 完全実装 (日・英対応)
- [x] 全リソースの CRUD 管理画面 (時限, 教室, 講師, 講座, 授業, 行事, 祝日, ユーザー)
- [x] イベント行・リソース行の重なり自動回避ロジック
- [x] 祝日・課目データのインポート機能
- [x] システム設定管理 (パブリックサインアップ等)

### Upcoming Tasks (Next Steps)
- [ ] ドラッグ＆ドロップによる授業の移動・編集機能
- [ ] 印刷用レイアウトの最適化
- [ ] AI によるスケジューリング最適化/支援機能の検討
- [ ] パフォーマンス最適化 (大量リソース表示時のレンダリング抑制)
