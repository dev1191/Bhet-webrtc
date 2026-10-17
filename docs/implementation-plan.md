# Bhet — Phase-by-Phase Implementation Plan

Based on the [MVP Specification](./spec.md) and following the **Ponytail** engineering philosophy (minimal diffs, no unnecessary abstractions, native platform features first).

---

## Progress Overview- [x] **Phase 0: Workspace & Scaffolding (M0)** — *Done*
- [x] **Phase 1: Signaling Server & In-Memory Relay (M1)**
- [x] **Phase 2: Database & Room REST API (M3-Server)**
- [x] **Phase 3: WebRTC Core Composable & Media Room UI (M2)**
- [x] **Phase 4: Client Routing & Home Page Flow (M3-Client)**
- [x] **Phase 5: TURN Fallback & ICE Resilience (M4)**
- [x] **Phase 6: DataChannel Chat, Stats & Audio-Only (M5)**
- [ ] **Phase 7: Multi-Language i18n & Font Optimization (M6)**
- [ ] **Phase 8: End-to-End Tests, Docs & Release Polish (M7)**

---

## Phase 1: Signaling Server & In-Memory Relay (M1)

**Goal:** Establish WebSocket communication on `/ws?token=...` allowing two peers to exchange SDP offer, answer, and ICE candidates.

### Tasks
- [x] Install and configure `@hono/node-ws` in `apps/server`.
- [x] Create an in-memory session tracker (`apps/server/src/signaling.ts`):
  - Map active tokens to rooms and sockets.
  - Restrict each room to max 2 peers (`host` and `guest`).
  - Send `{ type: "error", code: "ROOM_FULL" }` if a 3rd peer attempts to connect.
- [x] Relay messages between peers using `@bhet/shared` schemas:
  - `offer`, `answer`, `ice` relayed unchanged to the opposite peer.
  - Notify `peer-joined` when second peer arrives.
  - Notify `peer-left` when either socket closes or sends `leave`.
- [x] Add unit tests (`apps/server/src/signaling.test.ts`) covering:
  - Message relay between 2 connections.
  - Rejection of 3rd peer.
  - Disconnect cleanup.

**Deliverable:** Run server, connect two `wscat` / WebSocket clients with mock tokens, observe bi-directional message relay.

---

## Phase 2: Database & Room REST API (M3-Server)

**Goal:** Persistent room management and token verification with SQLite.

### Tasks
- [x] Configure SQLite with `better-sqlite3` in `apps/server/src/db.ts`:
  - Table `rooms` (`id TEXT PRIMARY KEY, host_token TEXT, guest_token TEXT, created_at INTEGER, expires_at INTEGER`).
  - Add helper queries: `createRoom`, `findByToken`, `deleteExpired`.
- [x] Implement REST endpoints:
  - `POST /api/rooms`: Generates random room ID and 2 unique tokens, stores expiration (24h default), returns `{ roomId, hostLink, guestLink }` (supports optional `guestLang`).
  - `GET /api/rooms/:id/validate?token=...`: Validates token, checks expiry, returns `{ role: "host" | "guest" }` or error code (`INVALID_TOKEN`, `EXPIRED`).
  - `GET /api/ice-servers?token=...`: Validates token and returns STUN servers (TURN added in Phase 5).
- [x] Connect WebSocket handshake in Phase 1 to validate token against SQLite instead of mock data.
- [x] Add endpoint and database tests (`apps/server/src/db.test.ts`, `apps/server/src/app.test.ts`).

**Deliverable:** `curl -X POST http://localhost:3000/api/rooms` returns host & guest links, and `/api/rooms/:id/validate` validates them correctly.

---

## Phase 3: WebRTC Core Composable & Media Room UI (M2)

**Goal:** Two browser windows on localhost join a room and achieve 1:1 P2P video and audio.

### Tasks
- [x] Implement `useWebRTC()` composable (`apps/web/src/composables/useWebRTC.ts`):
  - Request media with `navigator.mediaDevices.getUserMedia({ video: true, audio: true })`.
  - Handle permission errors gracefully (allow joining audio-only or show clear error).
  - Implement **Perfect Negotiation Pattern**:
    - Host = impolite peer (`polite = false`).
    - Guest = polite peer (`polite = true`).
    - Manage `onnegotiationneeded`, `offer`, `answer`, and `ice` candidate queuing.
- [x] Build Vue 3 room view & video UI:
  - `apps/web/src/views/RoomView.vue`: Layout holding local and remote video streams.
  - `apps/web/src/components/VideoTile.vue`: Handles `<video>` element binding (`srcObject`), muted local audio to avoid feedback.
  - `apps/web/src/components/ControlsBar.vue`: Mute microphone, camera on/off, and leave room buttons.
- [x] Handle peer connection state:
  - Show "Waiting for peer..." when alone in room.
  - Show "Peer left" when the other user disconnects.

**Deliverable:** Two browser tabs open room links, grant permissions, and see/hear each other via WebRTC on localhost.

---

## Phase 4: Client Routing & Home Page Flow (M3-Client)

**Goal:** Complete web flow: Home page -> Create Room -> Share Link -> Join Call.

### Tasks
- [x] Add lightweight client-side routing (Vue Router or path/hash-based router):
  - `/`: Home view (Create Room button, guest language selector).
  - `/room/:id?token=...`: Call view.
- [x] Build Home Page (`apps/web/src/views/HomeView.vue`):
  - Minimal, responsive UI with "Create room" button.
  - Modal or copyable banner showing generated Host Link and Guest Link.
  - Direct button to "Join as Host".
- [x] Add Pre-call validation on Room View mount:
  - Call `/api/rooms/:id/validate?token=...`.
  - If token invalid or room expired, display friendly error screen without requesting media permissions.

**Deliverable:** User can open homepage, create a room, click the link, and enter the call directly.

---

## Phase 5: TURN Fallback & ICE Resilience (M4)

**Goal:** Connection succeeds across restrictive firewalls/NATs and recovers from network drops.

### Tasks
- [x] Configure `coturn` in `docker-compose.yml`:
  - STUN & TURN listener on ports 3478 & 5349.
  - Shared secret authentication (`use-auth-secret`).
- [x] Implement ephemeral TURN credential generator in `apps/server/src/utils/turn.ts`:
  - Calculate `username = "<timestamp>:<client_id>"` and `hmac-sha1` password.
  - Expose via `GET /api/ice-servers?token=...`.
- [x] In `apps/web/src/composables/useWebRTC.ts`:
  - Fetch ice-servers config before creating `RTCPeerConnection`.
  - Implement ICE restart:
    - Listen for `iceConnectionState === "failed"` or prolonged `disconnected`.
    - Trigger `pc.restartIce()`.
    - Listen for browser `online` window event to trigger reconnect after network switch.
- [x] Support relay fallback by setting `iceTransportPolicy: "relay"` in client config.

**Deliverable:** WebRTC connects through TURN relay when direct P2P is blocked, and recovers if Wi-Fi is toggled.

---

## Phase 6: DataChannel Chat, Stats & Audio-Only (M5)

**Goal:** Add in-room text chat, connection quality badge, and low-bandwidth audio-only mode.

### Tasks
- [x] **DataChannel Chat:**
  - Host creates `RTCDataChannel("chat", { ordered: true })`.
  - Guest handles `pc.ondatachannel`.
  - `apps/web/src/components/ChatPanel.vue`: Collapsible side panel for exchanging text messages.
- [x] **Connection Quality Badge:**
  - Poll `pc.getStats()` every 2 seconds in `apps/web/src/composables/useWebRTC.ts`.
  - Calculate packet loss, round-trip time (RTT), and jitter on inbound audio and video streams.
  - `apps/web/src/components/QualityBadge.vue`: Display `good` (green), `fair` (yellow), or `poor` (red) with tooltip metrics.
- [x] **Audio-Only Mode:**
  - Toggle button in `ControlsBar.vue`.
  - Disable video track (`videoTrack.enabled = false`).
  - Cap sender bitrate using `RTCRtpSender.setParameters({ encodings: [{ maxBitrate: 32000 }] })`.
  - Restoring video restores normal bitrate and re-enables track.

**Deliverable:** Real-time text chat over RTCDataChannel, live quality indicator, and instant audio-only toggle.ack.

**Deliverable:** Real-time text chat over RTCDataChannel, live quality indicator, and instant audio-only toggle.

---

## Phase 7: Multi-Language i18n & Font Optimization (M6)

**Goal:** Full internationalization across 7 languages with localized font loading and key integrity check.

### Tasks
- [x] Setup `vue-i18n` in `apps/web`:
  - Create 7 locale JSON files: `en.json`, `ne.json`, `hi.json`, `es.json`, `fr.json`, `pt.json`, `ja.json`.
  - Implement language resolution order:
    1. `?lang=` query param.
    2. `localStorage.getItem("bhet_lang")` (wrapped in try/catch).
    3. `navigator.language`.
    4. Fallback to `en`.
- [x] Language Switcher Component:
  - Add selector to Home page and in-room header.
  - Switching language updates active locale without interrupting video call.
- [x] Fonts & Typography:
  - Load `Noto Sans Devanagari` only when `ne` or `hi` is active.
  - Load `Noto Sans JP` only when `ja` is active.
  - Apply logical CSS properties (`margin-inline`, `text-align: start`) and `dir="ltr"` for future RTL readiness.
- [x] CI Key Check Script:
  - Create `scripts/check-i18n.ts`: Validates that all locale files have the exact keys present in `en.json`.
  - Add `pnpm run check:i18n` to root `package.json` and Turborepo.

**Deliverable:** UI seamlessly switches between all 7 languages, Devanagari and Japanese characters render crisp fonts, and the key check passes in CI.

---

## Phase 8: End-to-End Tests, Docs & Release Polish (M7)

**Goal:** Clean documentation, showcase assets, and robust automated tests.

### Tasks
- [x] Add integration tests:
  - Signaling server room lifecycle tests.
  - Token expiry verification.
- [x] Create `docs/webrtc-notes.md`:
  - Document ICE gathering behavior, TURN configuration notes, and network throttling test results.
- [x] Update root `README.md`:
  - Pitch, architecture diagram, "Run in 3 commands" with docker-compose.
  - Document how to contribute new translation locales.
- [x] Final code audit against **Ponytail guidelines**:
  - Remove unused imports, leftover console logs, dead scaffolding.
  - Ensure type check and lint passes across all packages (`pnpm turbo run typecheck lint test`).

**Deliverable:** Complete MVP matching the spec, fully tested and deployable via Docker.
