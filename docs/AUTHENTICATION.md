# Authentication Architecture

This document describes how authentication works after Clerk removal.

## Authoritative identity

**The MongoDB `User._id` string is the canonical application user identity.**

It is exposed to route handlers as `req.userId` (set by `requireAuth` in `server/src/middleware/authenticate.ts`).

Client apps store the backend JWT pair in Zustand (`authStore`) and attach `Authorization: Bearer <accessToken>` on API requests via `client/lib/api.ts`.

## Token path

| Path | When used | Token type | Backend handler |
|------|-----------|------------|-----------------|
| **Custom JWT** | Email/password login (`POST /api/auth/login`) | Access + refresh JWT | `verifyAccessToken` → `req.userId = sub` |

`requireAuth` verifies the backend access JWT only and sets `req.userId` to the Mongo `_id`.

## Registration certificate upload (pre-auth)

`POST /api/auth/upload/certificate` accepts **optional** auth:

- **Authenticated:** file is stored and linked to `req.userId` only
- **Unauthenticated (registration):** file is uploaded to Cloudinary and a URL is returned; **no user document is modified** until `POST /api/auth/register` includes `certificate_url`

Rate-limited via `authRateLimiter`.

## Session revocation

- Logout deletes refresh session (`RefreshSession` collection)
- Password reset deletes all refresh sessions for the user
- Access tokens expire per `JWT_ACCESS_EXPIRES_SEC`

## What to avoid

- Do not trust `req.body.userId`, `req.body.role`, or client-provided email for authorization
- Do not store server secrets in `EXPO_PUBLIC_*` variables
