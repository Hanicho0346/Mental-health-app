# Legacy Chat API (`/api/chat`)

## Status: **Secured, deprecated**

Phase B locked down all `/api/chat/*` routes. They remain for backward compatibility with `client/lib/chatService.ts` presence helpers.

## Production chat architecture

| Layer | Implementation |
|-------|----------------|
| REST (send/list) | `/api/messages`, `/api/conversations` |
| Realtime | Socket.IO (`send-message`, `receive-message`, …) |
| Access control | `requireAuth` + `requirePaidConversation` |

## Legacy routes (secured)

| Route | Auth | Authorization |
|-------|------|---------------|
| `POST /api/chat/login` | Required | Returns **authenticated** user's chat identity only |
| `GET /api/chat/users` | Required | Only peers from user's `Conversation` records |
| `GET /api/chat/messages/:userA/:userB` | Required | Caller must be `userA` or `userB`; shared conversation required |
| `GET /api/chat/calls/:userA/:userB` | Required | Same as messages |
| `POST /api/chat/upload-voice` | Required | MIME + size validated; upload scoped to authenticated user |

## Client usage (2026-08-30)

| File | Uses legacy API? |
|------|------------------|
| `client/lib/chatService.ts` | Yes — `/api/chat/users` on `users-updated`; Bearer token attached |
| `client/app/(tabs)/*/_layout.tsx` | `connectSocket` only (Socket.IO) |
| `client/app/(tabs)/*/chats/[peer].tsx` | **No** — uses `/api/messages` |

`apiLogin`, `apiLoadTimeline`, `apiUploadVoice` are **not called** from screens today.

## Removal plan (future phase)

1. Move presence list to Socket.IO or `/api/messages/conversations`
2. Remove `chatService.ts` legacy fetch helpers
3. Return `410 Gone` on `/api/chat/*` for one release
4. Delete `server/src/routes/chatRoutes.ts`

Do not remove until step 1 is complete.
