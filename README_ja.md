# ScholaTile 教育リソーススケジューラー

![](public/ScholaTile.png)
Education Scheduler は、教育施設におけるリソース（教室・講師・講座）の管理に特化した、高機能なカレンダー・スケジューリング・サービスです。

複雑な授業コマの管理や、リソースの重複チェック、複数視点でのタイムテーブル表示など、教育現場のニーズに最適化された設計となっています。

## 🚀 主な特徴

  - **教育特化型スケジュール管理**: 授業のコマ数、実施方法（対面・オンライン）、担当講師、使用教室を紐付けて一括管理。
  - **マルチビュー・タイムテーブル**: CSS Grid を活用し、複数コマにまたがる授業や、リソースごとのスケジュールを滑らかに表示。
  - **柔軟な表示設定**: 「講座」「講師」「教室」など、管理したい対象に応じた切り替えが可能。
  - **重複検知**: 講師や教室のダブルブッキングを未然に防ぐバリデーション機能。
  - **多言語対応 (i18n)**: 日本語・英語など、ユーザーの環境に合わせた表示言語の切り替えに対応。
  - **モダンな技術スタック**: Preact による軽量・高速な UI と、TypeScript による堅牢な設計。

## 🛠 技術スタック

### フロントエンド

  - **UI ライブラリ**: Preact (軽量・高速な仮想DOM)
  - **状態管理**: Signals (高パフォーマンスな状態追跡)
  - **スタイリング**: CSS Grid (複雑なタイムテーブル・レイアウトの実現)
  - **日付操作**: date-fns, Intl.DateTimeFormat
  - **国際化**: i18next

### バックエンド

  - **ランタイム**: Node.js
  - **データベース**: Prisma (ORM) / PostgreSQL または SQLite
  - **API**: Express / REST API

## 📦 セットアップ

### 依存関係

  - Node.js (LTS 推奨)
  - npm または yarn

### インストール

詳細は、[Deploy_ja.md](Deploy_ja.md) を参照してください。

1.  リポジトリをクローンします：

    ```bash
    git clone https://github.com/yasumichi/Education-Scheduler.git
    cd Education-Scheduler
    ```

2.  依存関係をインストールします：

    ```bash
    # ルートディレクトリ
    npm install

    # バックエンド
    cd backend
    npm install
    ```

3.  環境変数の設定：
    `backend/.env.example` を `.env` にコピーし、データベース接続情報を設定します。

4.  データベースのセットアップ：

    ```bash
    cd backend
    npx prisma migrate dev
    npx prisma db seed
    ```

### 開発サーバーの起動

1.  バックエンドの起動：

    ```bash
    cd backend
    npm run dev
    ```

2.  フロントエンドの起動：

    ```bash
    # ルートディレクトリにて
    npm run dev
    ```

起動後、ブラウザで `http://localhost:5173` (デフォルト) にアクセスしてください。

## 📖 主な機能

  - **タイムテーブル表示**: 日次・週次でのスケジュール確認。
  - **リソース管理**:
      - 講師 (Teacher) の登録・管理
      - 教室 (Room) の登録・管理
      - 講座 (Course) / レッスン (Lesson) の詳細設定
  - **システム設定**:
      - 休日設定 (Holidays)
      - 表示ラベルのカスタマイズ (例: "Subject" を "科目" に変更するなど)
      - プロフィール管理

## 📄 ライセンス

[MIT License](LICENSE)

## 👤 開発者

  - **Yasumichi Akahoshi** - [GitHub](https://github.com/yasumichi)
