# Tesfa Mind — Mental Health App

Expo mobile client + Node.js API + MongoDB + Redis + BullMQ worker + Resend.

## Prerequisites

- Node.js 22+
- Docker & Docker Compose (recommended)
- Expo CLI / EAS (mobile)
- [Resend](https://resend.com) API key (production email)

## Quick start (Docker)

```bash
# From repo root — copy and edit env
cp server/.env.example server/.env

# Set at minimum: JWT_SECRET, JWT_REFRESH_SECRET, RESEND_API_KEY, EMAIL_FROM

docker compose config
docker compose build
docker compose up -d
docker compose ps
```

**Health checks**

```bash
curl http://localhost:5000/health
curl http://localhost:5000/ready
```

PowerShell:

```powershell
Invoke-WebRequest http://localhost:5000/health
Invoke-WebRequest http://localhost:5000/ready
```

**Logs**

```bash
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f redis
docker compose logs -f mongodb
```

> Do not run `docker compose down -v` unless you intend to wipe MongoDB/Redis volumes.

## Local development (without Docker)

```bash
# Terminal 1 — MongoDB + Redis (or use Docker for infra only)
docker compose up -d mongodb redis

# Terminal 2 — API
cd server
cp .env.example .env
# Set MONGODB_URI=mongodb://127.0.0.1:27017/mentalhealth
# Set REDIS_URL=redis://127.0.0.1:6379
npm install
npm run dev

# Terminal 3 — Worker
cd server
npm run worker:dev

# Terminal 4 — Mobile
cd client
npm install
# Set EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:5000
npx expo start
```

## Environment variables

See [server/.env.example](server/.env.example). Never commit `.env`.

| Variable | Notes |
|----------|-------|
| `RESEND_API_KEY` | Server only |
| `REDIS_URL` | Required in production |
| `MONGODB_URI` | Docker: `mongodb://mongodb:27017/mentalhealth` |
| `EXPO_PUBLIC_API_URL` | Client only — use LAN IP in dev, HTTPS in prod |
| `EXPO_PUBLIC_CHAT_SERVER_URL` | Optional Socket.IO origin (defaults to API URL) |
| `SOCKET_CORS_ORIGINS` | Server — comma-separated browser origins for Socket.IO |

## Scripts (server)

| Command | Description |
|---------|-------------|
| `npm run dev` | API with hot reload |
| `npm run worker:dev` | Worker with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Production API |
| `npm run worker` | Production worker |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |

7. Update the .env file with your MongoDB connection string for the temporary mental-health database before starting the server.
<img width="400" height="700" alt="Image" src="https://github.com/user-attachments/assets/f96dac52-5f95-4e87-b86c-9c2224e0063c" />
<img width="400" height="700" alt="Image" src="https://github.com/user-attachments/assets/01164f6f-5b9d-4262-b102-4244b61ba634" />
<img width="400" height="700" alt="Image" src="https://github.com/user-attachments/assets/71ccacb4-a23d-469b-9d98-313116159ab3" />
<img width="400" height="700" alt="Image" src="https://github.com/user-attachments/assets/2d341183-087d-434d-9082-df034e5002e3" />
<img width="400" height="700" alt="Image" src="https://github.com/user-attachments/assets/8758c2b1-f4e3-40e3-b388-8079ddaa43e7" />
<img width="400" height="700" alt="Image" src="https://github.com/user-attachments/assets/34aef2e5-23d4-4de0-afbc-ac445cd81602" />
<img width="400" height="700" alt="Image" src="https://github.com/user-attachments/assets/f48ea03f-6c01-4997-9c31-4f0a482faf99" />
<img width="400" height="700" alt="Image" src="https://github.com/user-attachments/assets/6918b569-172e-4521-a643-e00ac04ac3f9" />
<img width="400" height="700" alt="Image" src="https://github.com/user-attachments/assets/1240d0fc-9aa5-4d5d-a906-e3b3e76e5005" />
<img width="400" height="700" alt="Image" src="https://github.com/user-attachments/assets/63b956e7-34ea-4f45-8bcf-6d9ca6041ec4" />

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Troubleshooting

- **API `/ready` 503** — MongoDB or Redis not reachable; check `docker compose ps`
- **Emails not sending** — ensure worker is running and `RESEND_API_KEY` + `EMAIL_FROM` are set
- **Mobile cannot reach API** — set `EXPO_PUBLIC_API_URL` to your machine LAN IP (not `localhost` on device)

