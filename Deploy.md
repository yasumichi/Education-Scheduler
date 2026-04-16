# ScholaTile Deployment Guide

This guide outlines the steps to set up and run the project in a new environment.

## 1. Prerequisites

- **Node.js:** v18 or higher (Tested with v24.14.0)
- **PostgreSQL:** v15 or higher (Tested with v17.9)
- **npm:** Included with Node.js

## 2. Database Setup

Create a database and a user for this application in PostgreSQL.

```bash
# Log into PostgreSQL (Modify as needed for your environment)
sudo -u postgres psql

# Create user and database
CREATE USER edugrid WITH PASSWORD 'password';
CREATE DATABASE edugrid OWNER edugrid;
\q
```

## 3. Environment Variables

Create a `.env` file in the backend directory and specify connection information and authentication keys.
**In Prisma 7, these variables are loaded via `prisma.config.ts` during CLI operations.**

1. Create `backend/.env`:
   ```bash
   touch backend/.env
   ```

2. Enter the following content (adjust password etc. based on Step 2):
   ```env
   DATABASE_URL="postgresql://edugrid:password@localhost:5432/edugrid?schema=public"
   PORT=3001
   HOST=0.0.0.0
   JWT_SECRET="Any literal string (e.g., your_secret_key_12345)"
   FRONTEND_URL="http://localhost:5173"
   ```
   - **PORT:** The port number the backend will listen on.
   - **HOST:** The address the backend will listen on. `0.0.0.0` allows listening on all interfaces.
   - **FRONTEND_URL:** Used for CORS settings. Specify the actual URL used to access the frontend in the browser.

## 4. Installation

Install dependencies in both the root and backend directories.

```bash
# Root dependencies (Vite, concurrently, etc.)
npm install

# Backend dependencies (Express, Prisma, Auth, etc.)
cd backend
npm install
cd ..
```

## 5. DB Initialization and User Creation

Use Prisma 7 to create tables and populate data.
**This project is configured to use the `pg` driver adapter for PostgreSQL.**

```bash
cd backend

# Create tables (reflect schema)
# * Use 'db push' if the user doesn't have permissions to create DBs
npx prisma db push

# Create Admin User (Example)
npm run create-admin -- admin@example.com admin123

# Seed test data (optional)
npx prisma db seed

cd ..
```

## 6. Running the Application

Execute the batch start command from the root directory.

```bash
npm run dev
```

- **Frontend:** `http://localhost:5173` (or server IP)
- **Backend API:** `http://localhost:3001/api` (or server IP)

## 7. User Management

You can add administrative users using the following command from the project root:

```bash
npm --prefix backend run create-admin -- <email> <password>
```

---

## Troubleshooting

- **Database Connection Error:** Verify `DATABASE_URL` in `backend/.env`. Also, ensure `backend/prisma.config.ts` exists and is configured to load `.env`.
- **JWT Error:** Verify `JWT_SECRET` is set in `backend/.env`.
- **Prisma Error:** Try regenerating the client using `cd backend && npx prisma generate`. In Prisma 7, the `PrismaClient` is initialized by passing the `adapter` (pg).

---

## 8. External Access & Deployment

To access from other PCs on the LAN or from the outside, network listening settings are required for both the backend and frontend.

### 1. Backend Configuration (CORS & Listen Address)
Set `HOST` and `FRONTEND_URL` in `backend/.env`.
```bash
# backend/.env
PORT=3001
HOST=0.0.0.0  # Listen on all network interfaces
FRONTEND_URL=http://192.168.1.10:5173  # Actual URL used to access the frontend
```

### 2. Frontend Configuration (Vite Server & API URL)
#### Vite Listening Settings (`vite.config.ts`)
To make the Vite dev server accessible externally, `server.host: true` is required (already reflected).
```typescript
// vite.config.ts (excerpt)
export default defineConfig({
  server: {
    host: true, // Listen on 0.0.0.0
    port: 5173
  }
});
```

#### Backend Connection Specification (API Endpoint)
Create a `.env` file in the project root and specify the backend URL visible from the browser.
```bash
# .env (project root)
VITE_API_URL=http://192.168.1.10:3001/api
```
Vite embeds this value as `import.meta.env.VITE_API_URL` during build or development execution.

### 3. CORS Details
The backend `backend/src/index.ts` allows CORS based on the `FRONTEND_URL` environment variable.
```typescript
// backend/src/index.ts (reference)
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({ origin: FRONTEND_URL }));
```

### 4. Build and Execution (Production)
#### Backend (Node.js/TypeScript)
```bash
cd backend
npm run build
# Example for running as a PM2 or system service:
# HOST=0.0.0.0 PORT=3001 FRONTEND_URL=https://your-frontend.com node dist/index.js
```

#### Frontend (Vite)
```bash
# Build (outputs to dist directory)
npm run build
# Publish static files in dist via Nginx, Apache, S3/CloudFront, etc.
```

### 5. Reverse Proxy Configuration (e.g., Nginx)
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

## 9. Backend Auto-start with systemd

This is an example configuration to keep the backend running as a service on a Linux server and execute it automatically on OS startup.

### 1. Create a Service File
Create `/etc/systemd/system/scholatile-backend.service` with the following content.
(Adjust paths and usernames according to your actual environment.)

```ini
[Unit]
Description=ScholaTile Backend Service
After=network.target postgresql.service

[Service]
Type=simple
User=yasumichi
WorkingDirectory=/path/to/Education-Scheduler/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
# Environment variables are loaded from .env, but can also be specified here if needed
# Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 2. Enable and Start the Service
```bash
# Reload configuration
sudo systemctl daemon-reload

# Enable auto-start
sudo systemctl enable scholatile-backend

# Start the service
sudo systemctl start scholatile-backend

# Check status
sudo systemctl status scholatile-backend
```

### 3. Check Logs
```bash
sudo journalctl -u scholatile-backend -f
```
