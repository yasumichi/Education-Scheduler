# --- Stage 1: Frontend Builder ---
# Vite を使用してフロントエンドをビルドするためのステージ
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY src/package.json ./
COPY src/package-lock.json ./ # yarn.lock の場合は適宜変更

RUN npm ci

COPY src/ ./

# フロントエンドのビルドコマンド: npm run build
RUN npm run build

# --- Stage 2: Backend Builder ---
# バックエンド (Node.js, TypeScript, Prisma) をビルドするためのステージ
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

COPY backend/package.json ./
COPY backend/package-lock.json ./ # yarn.lock の場合は適宜変更

RUN npm ci --omit=dev

COPY backend/prisma/schema.prisma ./prisma/
# Prisma Data Proxy は使用しないため、--data-proxy オプションは削除
RUN npx prisma generate

COPY backend/src ./src/

# バックエンドの TypeScript コンパイルコマンド (backend/package.json のビルドスクリプトに依存)
# 'cd backend && npm run build' で backend/dist に出力されることを確認済み
RUN cd backend && npm run build

# --- Stage 3: Production Runner with Nginx ---
# Nginx でフロントエンドを配信し、バックエンドにリバースプロキシするステージ
FROM node:20-alpine AS production-runner

# Nginx をインストール (フロントエンド静的ファイル配信とリバースプロキシ用)
RUN apk add --no-cache nginx

# 非rootユーザーを作成し、そのユーザーに切り替える (セキュリティのため)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# アプリケーションの作業ディレクトリを設定
WORKDIR /app

# ビルドされたバックエンドコードと依存関係をコピー
# バックエンドのビルド出力は backend/dist にあり、最終ステージでは /app/backend/dist に配置
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules

# ビルドされたフロントエンドの静的アセットを Nginx のドキュメントルートにコピー
# フロントエンドのビルド出力ディレクトリは /app/frontend/dist
# Nginx が静的ファイルを配信するパスは /usr/share/nginx/html
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# custom nginx.conf をコピー
COPY nginx.conf /etc/nginx/nginx.conf

# バックエンドアプリケーションがリッスンするポートを設定 (3001)
ENV BACKEND_PORT=3001

# Nginx はポート 80 をリッスンします。
EXPOSE 80

# バックエンドサーバーの起動コマンド: node PROJECT_ROOT/backend/dist/index.js
# WORKDIR が /app なので、node backend/dist/index.js で実行されます。
# Nginx をフォアグラウンドで起動し、Node.js アプリケーションをバックグラウンドで実行します。
CMD nginx -g 'daemon off;' & node backend/dist/index.js
