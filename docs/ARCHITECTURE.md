# Architecture — Tesfa Mind

## Overview

```
Expo Mobile App
      │ HTTPS (Bearer JWT)
      ▼
Node.js API (modular monolith)
      ├──────────────┬─────────────┐
      ▼              ▼             ▼
  MongoDB         Redis        Socket.IO
                       │
                       ▼
                  BullMQ queues
                       │
                       ▼
                  Worker process
                       │
                       ▼
                    Resend
```

## Components

| Layer | Role |
|-------|------|
| **client/** | Expo React Native app — public env only (`EXPO_PUBLIC_*`) |
| **server/src/index.ts** | HTTP API + Socket.IO |
| **server/src/worker.ts** | BullMQ worker (separate process, same image) |
| **MongoDB** | Primary data store (users, messages, appointments, …) |
| **Redis** | Rate limits, OTP code handoff, cache, BullMQ backend |
| **BullMQ** | Async email + appointment reminders |
| **Resend** | Transactional email (server-only API key) |

## Email flow

1. API generates OTP → hashes in MongoDB → stores plaintext in Redis (short TTL)
2. API enqueues `email` job with `{ type, userId, email }` (no OTP in job)
3. Worker reads code from Redis → sends via Resend → deletes Redis key

## Queues

| Queue | Jobs |
|-------|------|
| `email` | verification, password reset, welcome, appointment, psychiatrist approval |
| `appointment` | delayed reminder → re-queues to `email` |

## Docker

- `docker-compose.yml` — api, worker, mongodb, redis on `mental-health-network`
- Only port **5000** exposed (API)
- MongoDB/Redis internal only

## Socket.IO security

- **CORS:** `SOCKET_CORS_ORIGINS` (falls back to `CORS_ORIGINS`). Production rejects unknown browser origins; native clients without an `Origin` header rely on bearer token auth.
- **Authentication:** Every connection must present a valid backend JWT via `auth.token` or `Authorization: Bearer`. Server resolves identity with `resolveUserIdFromBearerToken` — never trusts client `userId`.
- **Authorization:** `send-message`, `send-voice`, and `call-user` verify an active `Conversation` between authenticated user and peer before proceeding.
- **Rate limiting:** Redis-backed per-user message rate limit (`SOCKET_MESSAGE_RATE_LIMIT_*`).
- **Connection limits:** Max `SOCKET_MAX_CONNECTIONS_PER_USER` (default 3) per user; oldest connection dropped when exceeded.

See [AUTHENTICATION.md](./AUTHENTICATION.md) and [LEGACY_CHAT.md](./LEGACY_CHAT.md).
