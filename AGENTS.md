<!-- AGENTS.md: Guidance for AI coding agents working on this repo -->
# Agents Guide — Fix messaging & video-call integration

Purpose: Give AI coding agents a concise checklist and pointers to reliably diagnose and fix issues with the chat "send message" flow and the video-call signaling integration.

Why this file exists: The app uses Socket.IO for real-time messaging and custom WebRTC signaling for video calls. These flows require coordinated client + server changes (optimistic UI, ack handling, id mapping, signaling events). Use the links below rather than copying large docs.

Quick links
- Client chat UI: [client/app/(tabs)/(psychiatrist-tabs)/chats/[peer].tsx](client/app/(tabs)/(psychiatrist-tabs)/chats/[peer].tsx)
- Client socket wrapper: [client/lib/socket.ts](client/lib/socket.ts)
- Server message handling: [server/src/controllers/messageController.ts](server/src/controllers/messageController.ts)
- Server sockets dir: [server/src/sockets](server/src/sockets)

Checklist for fixing "send message"
1. Reproduce the failure locally: start the client and server, open two sessions (sender + receiver). Capture console logs for `send-message` and `receive-message` events.
2. Confirm client does optimistic update: the UI should add a message with a temp id and `status: "sending"` (see the chat component above).
3. Ensure server acks the sender with the final persistent id and emits `receive-message` to the recipient and sender. The ack payload should include `{ ok: true, id: '<persistedId>' }`.
4. Update client ack handler: when ack arrives, map temp id -> persisted id and set `status: 'sent'`. If ack fails, set a `failed` state and surface retry UI.
5. Pay attention to duplicate deduping: the client socket `receive-message` handler must ignore messages already present (compare by id or a mapping).

Checklist for fixing video call (signaling)
1. Confirm signaling events used by client: `call-user`, `incoming-call`, `call-accepted`, `call-declined`, `call-ended`, and any SDP/ICE events. See the chat component and `client/lib/socket.ts`.
2. On `call-user`, server should emit `incoming-call` to the target with caller info and create a transient call session id.
3. When callee accepts, server should forward `call-accepted` to caller, and facilitate SDP/ICE exchange (or act as relay for signaling messages like `webrtc-offer`, `webrtc-answer`, `ice-candidate`).
4. Ensure cleanup: on `call-ended` both clients receive notification and server clears transient session.
5. Add clear logging for each signaling step to help reproduce and to add automated tests later.

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
- Socket ack callbacks are sometimes omitted; prefer using the callback pattern (`socket.emit(event, payload, cb)`) and always call `cb({ ok: true, id })` on success.
- Network delays can cause `receive-message` to arrive before ack; dedupe by checking existing message ids.

If you modify code, update this guide with any new event names or altered flows.

Next recommended agent customizations
- Create a `fix-chat-ack` instruction that automates the steps to update client ack handling and add tests.
- Add a `webrtc-signaling` skill that documents the exact signaling events used across client and server.

---
Files added/modified by this change

| File | Why useful |
|---|---|
| AGENTS.md | Minimal, actionable guidance for agents to fix messaging and video-call integration. Links to the chat UI and socket code so agents don't have to search. |
