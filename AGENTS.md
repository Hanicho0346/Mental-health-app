<!-- AGENTS.md: Guidance for AI coding agents working on this repo -->
# Agents Guide — Fix messaging & video-call integration

Purpose: Give AI coding agents a concise checklist and pointers to reliably diagnose and fix issues with the chat "send message" flow and the video-call signaling integration.

Why this file exists: The app uses Socket.IO for real-time messaging and custom WebRTC signaling for video calls. These flows require coordinated client + server changes (optimistic UI, ack handling, id mapping, signaling events). Use the links below rather than copying large docs.

Quick links
- Client chat UI (psychiatrist): [client/app/(tabs)/(psychiatrist-tabs)/chats/[peer].tsx](client/app/(tabs)/(psychiatrist-tabs)/chats/[peer].tsx)
- Client chat UI (user): [client/app/(tabs)/(user-tabs)/chats/[peer].tsx](client/app/(tabs)/(user-tabs)/chats/[peer].tsx)
- Client group chats lobby: [client/app/groupchats/index.tsx](client/app/groupchats/index.tsx)
- Client group chat screen: [client/app/groupchats/[groupId].tsx](client/app/groupchats/[groupId].tsx)
- Client socket wrapper: [client/lib/socket.ts](client/lib/socket.ts)
- Server message handling: [server/src/controllers/messageController.ts](server/src/controllers/messageController.ts)
- Server sockets: [server/src/sockets/registerSocket.ts](server/src/sockets/registerSocket.ts)
- Server group chat routes: [server/src/routes/groupChat.routes.ts](server/src/routes/groupChat.routes.ts)
- Server group chat model: [server/src/models/GroupChat.ts](server/src/models/GroupChat.ts)

Checklist for fixing "send message"
1. Reproduce the failure locally: start the client and server, open two sessions (sender + receiver). Capture console logs for `send-message` and `receive-message` events.
2. Confirm client does optimistic update: the UI should add a message with a temp id and `status: "sending"` (see the chat component above).
3. Ensure server acks the sender with the final persistent id and emits `receive-message` to the recipient and sender. The ack payload should include `{ ok: true, id: '<persistedId>' }`.
4. Update client ack handler: when ack arrives, map temp id -> persisted id and set `status: 'sent'`. If ack fails, set a `failed` state and surface retry UI.
5. Pay attention to duplicate deduping: the client socket `receive-message` handler must ignore messages already present (compare by id or a mapping).

Checklist for fixing video call (signaling)
1. Confirm signaling events used by client: `call-user`, `incoming-call`, `call-accepted`, `call-declined`, `call-ended`, `webrtc-signal`. See the chat components and `client/lib/chatService.ts`.
2. On `call-user`, server emits `incoming-call` to the target with `{ from, roomId, appointmentId }` and stores transient `callData` on the caller's socket.
3. When callee accepts, client emits `call-accepted` to server with `{ to, roomId }`; server forwards `call-accepted` with `{ from, roomId }` to caller.
4. SDP/ICE exchange relayed via `webrtc-signal` event: client emits `{ to, signal }`, server forwards `{ from, signal }` to peer.
5. Ensure cleanup: on `call-ended`, both clients receive `call-ended` with `{ from }`, server logs a `CallLog` entry and clears `callData`.
6. Add clear logging for each signaling step to help reproduce and to add automated tests later.

**Video call flow (current state):**
- Direct chats between psychiatrists and users support video calls.
- The actual WebRTC media stream uses a placeholder view; signaling events are fully wired for future `react-native-webrtc` integration.
- Call timeout: caller auto-cancels after 30s; incoming call auto-dismisses after 45s.

**Group chats (new):**
- REST API at `/api/group-chats` (CRUD: create, list, get, add/remove members).
- REST messages at `/api/group-chats/:groupId/messages` (paginated list, send).
- Socket events: `join-group` (join `group:${groupId}` room), `leave-group`, `group-message` (real-time broadcast to room members).
- Client route: `/groupchats` (lobby), `/groupchats/[groupId]` (chat screen).
- The `group-message` socket event and REST route use the same event name (dash, not colon).

**Server build & run (Docker):**
- Rebuild API container after code changes: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --no-deps api`
- Server runs at `http://localhost:5000`, client at `http://localhost:8081`.

Recommended steps for an agent making changes
- Run the project locally: `cd client && yarn && yarn start` and `cd server && yarn && yarn dev` (adapt if repo uses npm/pnpm).
- Add robust ack handling to the client: map temp id -> persisted id, update message status, and dedupe incoming messages.
- Add server-side ack payloads and ensure `receive-message` is emitted to both parties with the final id.
- Add unit/integration tests for server socket handlers where possible.

Verification
- Manual: two-device test confirming message changes status from "sending" -> "sent" and that duplicates do not appear.
- Video: call from A->B, B accepts, both enter `incall` state, then end call and ensure both return to `idle`.

Pointers for common pitfalls
- Using Date.now() as a temp id is fine for optimistic UI but ensure mapping when server returns persistent id.
- Socket ack callbacks are sometimes omitted; prefer using the callback pattern (`socket.emit(event, payload, cb)`) and always call `cb({ ok: true, message })` on success.
- Network delays can cause `receive-message` to arrive before ack; dedupe by checking existing message ids.
- Group chat rooms use `group:${groupId}` naming — ensure `join-group` is emitted before expecting `group-message` events.

If you modify code, update this guide with any new event names or altered flows.

Next recommended agent customizations
- Create a `fix-chat-ack` instruction that automates the steps to update client ack handling and add tests.
- Add a `webrtc-signaling` skill that documents the exact signaling events used across client and server.

---
Files added/modified by this change

| File | Why useful |
|---|---|
| AGENTS.md | Minimal, actionable guidance for agents to fix messaging and video-call integration. Links to the chat UI and socket code so agents don't have to search. |
| server/src/app.ts | Registers group chat REST routes at `/api/group-chats`. |
| server/src/models/index.ts | Exports GroupChat, GroupMessage, CallLog models. |
| server/src/sockets/registerSocket.ts | Adds `join-group`, `leave-group`, `group-message` socket handlers; fixes call handlers to forward `from`. |
| server/src/routes/groupChat.routes.ts | Fixes event name from `group:message` to `group-message`. |
| client/app/groupchats/_layout.tsx | Stack layout for group chat routes. |
| client/app/groupchats/index.tsx | Group chats lobby — list groups, create groups. |
| client/app/groupchats/[groupId].tsx | Individual group chat screen with REST + socket integration. |
| client/app/(tabs)/(user-tabs)/chats/[peer].tsx | Full video call UI for users (incoming call modal, in-call modal, signaling). |
| client/app/(tabs)/(psychiatrist-tabs)/chats/[peer].tsx | Fixed video call to emit call-accepted/call-ended to server. |
