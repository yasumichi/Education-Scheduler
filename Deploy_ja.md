# ScholaTile デプロイガイド

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
**Prisma 7 では、CLI操作時に `prisma.config.ts` を通じてこの変数を読み込みます。**

1. `backend/.env` を作成:
   ```bash
   touch backend/.env
   ```

2. 以下の内容を記述 (パスワード等は手順2で設定したものに合わせる):
   ```env
   DATABASE_URL="postgresql://edugrid:password@localhost:5432/edugrid?schema=public"
   PORT=3001
   HOST=0.0.0.0
   JWT_SECRET="任意のリテラル文字列（例: your_secret_key_12345）"
   FRONTEND_URL="http://localhost:5173"
   ```
   - **PORT:** バックエンドが待ち受けるポート番号。
   - **HOST:** バックエンドが待ち受けるアドレス。`0.0.0.0` を指定するとすべてのインターフェースで待ち受けます。
   - **FRONTEND_URL:** CORS設定に使用されます。ブラウザでアクセスするフロントエンドのURLを指定してください。

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

## 5. データベースの初期化とユーザー作成 (DB Initialization)

Prisma 7 を使用してテーブルを作成し、データを投入します。
**本プロジェクトは PostgreSQL 用の `pg` ドライバーアダプターを使用するように構成されています。**

```bash
cd backend

# テーブル作成 (スキーマの反映)
# ※ユーザーに DB 作成権限がない場合は db push を使用
npx prisma db push

# 管理者ユーザーの作成 (例)
npm run create-admin -- admin@example.com admin123

# テストデータの投入 (Seed)
npx prisma db seed

cd ..
```

## 6. アプリケーションの起動 (Running)

ルートディレクトリから一括起動コマンドを実行します。

```bash
npm run dev
```

- **フロントエンド:** `http://localhost:5173` (またはサーバーのIP)
- **バックエンド API:** `http://localhost:3001/api` (またはサーバーのIP)

## 7. ユーザー管理 (User Management)

プロジェクトルートから以下のコマンドを使用して管理ユーザーを追加できます。

```bash
npm --prefix backend run create-admin -- <メールアドレス> <パスワード>
```

---

## トラブルシューティング

- **データベース接続エラー:** `backend/.env` の `DATABASE_URL` が正しいか確認してください。また、`backend/prisma.config.ts` が存在し、`.env` を読み込む設定になっているか確認してください。
- **JWTエラー:** `backend/.env` に `JWT_SECRET` が設定されているか確認してください。
- **Prisma エラー:** `cd backend && npx prisma generate` を実行してクライアントを再生成してみてください。Prisma 7 では、`PrismaClient` の初期化時に `adapter` (pg) を渡す構成になっています。

---

## 8. 外部アドレスでの公開と開発 (External Access & Deployment)

LAN内の他のPCや外部からアクセスする場合、バックエンドとフロントエンドの両方でネットワーク待ち受け設定が必要です。

### 1. バックエンドの設定 (CORS & Listen Address)
バックエンドの `backend/.env` で `HOST` と `FRONTEND_URL` を設定します。
```bash
# backend/.env
PORT=3001
HOST=0.0.0.0  # すべてのネットワークインターフェースで待ち受け
FRONTEND_URL=http://192.168.1.10:5173  # ブラウザからアクセスするフロントエンドの実際のURL
```

### 2. フロントエンドの設定 (Vite Server & API URL)
#### Vite の待ち受け設定 (`vite.config.ts`)
Vite 開発サーバーを外部からアクセス可能にするには、`server.host: true` が必要です（反映済み）。
```typescript
// vite.config.ts (抜粋)
export default defineConfig({
  server: {
    host: true, // 0.0.0.0 で待ち受け
    port: 5173
  }
});
```

#### バックエンドへの接続先指定 (API Endpoint)
プロジェクトルートに `.env` ファイルを作成し、ブラウザから見えるバックエンドのURLを指定します。
```bash
# .env (プロジェクトルート)
VITE_API_URL=http://192.168.1.10:3001/api
```
Vite はビルド時または開発実行時にこの値を `import.meta.env.VITE_API_URL` として埋め込みます。

### 3. CORS設定の詳細
バックエンドの `backend/src/index.ts` は、環境変数 `FRONTEND_URL` に基づいて CORS を許可します。
```typescript
// backend/src/index.ts (参考)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({ origin: FRONTEND_URL }));
```

### 4. ビルドと実行 (Production)
#### バックエンド (Node.js/TypeScript)
```bash
cd backend
npm run build
# PM2 やシステムサービスとして起動する場合の例:
# HOST=0.0.0.0 PORT=3001 FRONTEND_URL=https://your-frontend.com node dist/index.js
```

#### フロントエンド (Vite)
```bash
# ビルド (dist ディレクトリに出力)
npm run build
# dist 内の静的ファイルを Nginx, Apache, または S3/CloudFront 等で公開します。
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

## 9. systemd によるバックエンドの自動起動設定 (Backend Auto-start)

Linuxサーバー上でバックエンドをサービスとして常駐させ、OS起動時に自動実行するための設定例です。

### 1. サービスファイルの作成
`/etc/systemd/system/scholatile-backend.service` を作成し、以下の内容を記述します。
（パスやユーザー名は実際の環境に合わせて適宜変更してください）

```ini
[Unit]
Description=ScholaTile Backend Service
After=network.target postgresql.service

[Service]
Type=simple
User=yasumichi
WorkingDirectory=/home/yasumichi/projects/Education-Scheduler/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
# 環境変数は .env から読み込まれますが、必要に応じてここでも指定可能です
# Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 2. サービスの有効化と起動
```bash
# 設定の読み込み
sudo systemctl daemon-reload

# 自動起動の有効化
sudo systemctl enable scholatile-backend

# サービスの起動
sudo systemctl start scholatile-backend

# ステータスの確認
sudo systemctl status scholatile-backend
```

### 3. ログの確認
```bash
sudo journalctl -u scholatile-backend -f
```

