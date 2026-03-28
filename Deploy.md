# EduGrid Scheduler デプロイガイド

新規環境に本プロジェクトをセットアップし、実行するための手順です。

## 1. 動作要件 (Prerequisites)

- **Node.js:** v18 以上 (v24.14.0 で動作確認済)
- **PostgreSQL:** v15 以上 (v17.9 で動作確認済)
- **npm:** Node.js に付属

## 2. データベースの準備 (Database Setup)

PostgreSQL に本アプリ用のデータベースとユーザーを作成します。

```bash
# PostgreSQL にログイン (環境に合わせて適宜変更)
sudo -u postgres psql

# ユーザーとデータベースの作成
CREATE USER edugrid WITH PASSWORD 'password';
CREATE DATABASE edugrid OWNER edugrid;
\q
```

## 3. 環境変数の設定 (Environment Variables)

バックエンドディレクトリに `.env` ファイルを作成し、接続情報と認証キーを記述します。

1. `backend/.env` を作成:
   ```bash
   touch backend/.env
   ```

2. 以下の内容を記述 (パスワード等は手順2で設定したものに合わせる):
   ```env
   DATABASE_URL="postgresql://edugrid:password@localhost:5432/edugrid?schema=public"
   PORT=3001
   JWT_SECRET="任意のリテラル文字列（例: your_secret_key_12345）"
   ```

## 4. 依存関係のインストール (Installation)

プロジェクトのルートおよびバックエンドの両方でインストールを行います。

```bash
# ルートの依存関係 (Vite, concurrently 等)
npm install

# バックエンドの依存関係 (Express, Prisma, Auth 等)
cd backend
npm install
cd ..
```

## 5. データベースの初期化とシード (DB Initialization)

Prisma を使用してテーブルを作成し、初期テストデータ（ユーザー含む）を投入します。

```bash
cd backend

# テーブル作成 (スキーマの反映)
# ※ユーザーに DB 作成権限がない場合は db push を使用
npx prisma db push

# テストデータの投入 (Seed)
npx prisma db seed

cd ..
```

## 6. アプリケーションの起動 (Running)

ルートディレクトリから一括起動コマンドを実行します。

```bash
npm run dev
```

- **フロントエンド:** `http://localhost:5173`
- **バックエンド API:** `http://localhost:3001`

## 7. テスト用ログイン情報 (Test Credentials)

起動後、以下の情報でログインして動作を確認できます。

- **管理者 (Admin):**
  - Email: `admin@example.com`
  - Password: `admin123`
- **講師 (Teacher):**
  - Email: `teacher@example.com`
  - Password: `teacher123`

---

## トラブルシューティング

- **データベース接続エラー:** `backend/.env` の `DATABASE_URL` が正しいか確認してください。
- **JWTエラー:** `backend/.env` に `JWT_SECRET` が設定されているか確認してください。
- **Prisma エラー:** `cd backend && npx prisma generate` を実行してクライアントを再生成してみてください。

---

## 8. 外部アドレスでの公開 (External Deployment)

フロントエンドとバックエンドを異なるアドレス（またはドメイン）で公開する場合の設定手順。

### 1. バックエンドの環境変数設定
バックエンドの `.env` で `DATABASE_URL` 以外に、JWTのシークレット、ポート、**許可するフロントエンドのURL (CORS用)** を設定します。
```bash
# backend/.env
JWT_SECRET=your_secure_random_string
PORT=3001
FRONTEND_URL=https://www.yourdomain.com
```

### 2. フロントエンドのAPIエンドポイント設定
フロントエンドは、環境変数 `VITE_API_URL` を使用してバックエンドのURLを切り替えます。
ソースコード (`src/App.tsx`) を直接修正する必要はありません。

開発時や特定のデプロイ環境に合わせて、プロジェクトルートに以下のファイルを作成または修正してください。

```bash
# .env.local (ローカル開発時の上書き用)
VITE_API_URL=http://localhost:3001/api

# .env.production (本番ビルド npm run build 用)
VITE_API_URL=https://api.yourdomain.com/api
```

Vite はビルド時にこれらのファイルを読み込み、`import.meta.env.VITE_API_URL` に値を埋め込みます。

### 3. CORS設定 (反映済み)
バックエンドの `backend/src/index.ts` は、上記の `FRONTEND_URL` 環境変数を読み込んで CORS を許可します。
ソースコードを直接修正する必要はありません。

```typescript
// backend/src/index.ts (参考)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({ origin: FRONTEND_URL }));
```

### 4. ビルドと実行
#### バックエンド (Node.js/TypeScript)
```bash
cd backend
npm run build
npm start
```

#### フロントエンド (Vite)
```bash
# ビルド (dist ディレクトリに出力)
npm run build
# dist 内の静的ファイルを Nginx や S3/CloudFront 等で公開
```

### 5. リバースプロキシの設定 (例: Nginx)
```nginx
server {
    listen 443 ssl;
    server_name www.yourdomain.com;
    root /var/www/edugrid/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
