# Bhet — 1:1 WebRTC Room, MVP Spec

**Bhet** (भेट, Nepali for "meeting") is a small, self-hostable 1:1 video call app built to show a clean WebRTC implementation: link-based rooms, peer-to-peer media, TURN fallback, live connection quality, and an audio-only mode for weak networks.

This repo is the **foundation**. Later, a larger commercial product (CodeCanyon) is built on top of it. See [Roadmap](#roadmap-after-the-mvp).

---

## 1. Goals

- Two people join a room from a link and talk over video and audio, with no signup.
- Work reliably on poor mobile networks and behind NAT (TURN included).
- Show the connection quality in real time and let users drop to audio-only.
- Keep the codebase small enough to read in one sitting.

## 2. Non-goals (not in the MVP)

- Group calls (SFU), recording, screen share, accounts, billing, admin panel, AI features.
- Translating chat messages or live speech (the UI is multi-language, the conversation is not translated).

---

## 3. User flow

1. **Create a room:** the host opens the home page and clicks "Create room". The server returns two links: a host link and a guest link.
2. **Join:** each person opens their link, allows camera and microphone, and enters the room.
3. **Call:** video and audio connect peer-to-peer. A third person opening a full room sees a "Room is full" message.
4. **During the call:** mute, camera on/off, audio-only toggle, text chat, connection quality badge, leave button.
5. **End:** when either person leaves, the other sees "Peer left" and can wait or leave. Rooms expire after a set time (default 24 hours).

---

## 4. Features

| Feature | Detail |
|---|---|
| Room creation | Host and guest tokens, room expiry |
| 1:1 video and audio | `RTCPeerConnection`, STUN and TURN |
| Controls | Mute, camera toggle, leave |
| Text chat | Over an `RTCDataChannel`, not through the server |
| Connection quality | Badge (good / fair / poor) from `getStats()` |
| Audio-only mode | Disable video track and cap bitrate |
| Reconnect | ICE restart on network change or failure |
| Room limit | Maximum 2 peers per room |
| Multi-language UI | 7 languages at launch (en, ne, hi, es, fr, pt, ja), language switcher, easy to add more (see 10.1) |

---

## 5. Architecture

```
Browser A (Vue)  <──── WebRTC media + data channel ────>  Browser B (Vue)
     │                                                        │
     └────── WebSocket (signaling) ──────┐  ┌─────────────────┘
                                         ▼  ▼
                              Hono server (Node.js)
                              ├─ REST: create / validate room
                              ├─ WebSocket: relay offer, answer, ICE
                              └─ SQLite: rooms and tokens
                                         │
                                   coturn (TURN/STUN)
```

- The server **never touches media**. It only relays signaling messages.
- Media is peer-to-peer. TURN relays only when a direct connection fails.

### Stack

- **Server:** Node.js, Hono, `@hono/node-ws`, Zod (message validation), SQLite (`better-sqlite3`).
  - Organized with an **MVC + Service** pattern:
    - **Models (`src/models/`):** SQLite entity definitions and queries (`RoomModel`).
    - **Views / DTOs:** JSON REST responses and typed WebSocket messages via `@bhet/shared`.
    - **Controllers (`src/controllers/`):** Request parsing, status code handling, and responses (`RoomController`).
    - **Services (`src/room-service.ts`):** Business logic (link formatting, expiry, ICE config).
    - **Routes (`src/routes/`):** Hono route definitions (`createRoomRoutes`).
    - **Utils (`src/utils/`):** Helper functions (`crypto.ts`, `url.ts`, `token-resolver.ts`).
- **Client:** Vue 3, Vite, TypeScript, Element Plus (UI component framework & icons), one `useWebRTC()` composable, `vue-i18n` for translations.
- **Shared:** a `packages/shared` module with the signaling message types, used by both sides.
- **Infra:** docker-compose with the app and coturn.
- **Monorepo tooling:** pnpm workspaces with Turborepo. Tasks in `turbo.json`:
  - `dev`: runs the server and the web app in parallel (persistent, not cached)
  - `build`: builds `packages/shared` first, then the apps (`dependsOn: ["^build"]`), with caching
  - `typecheck`, `lint`, `test`: run per package, cached, and used by CI
  - One shared `tsconfig.base.json` and one shared lint config at the root

---

## 6. Repository layout

```
bhet/
├─ apps/
│  ├─ server/        # Hono API + WebSocket signaling (MVC + Service)
│  │  └─ src/
│  │     ├─ controllers/     # HTTP route controllers (room.controller.ts)
│  │     ├─ models/          # SQLite models & persistence (room.model.ts)
│  │     ├─ routes/          # Route registrations (room.routes.ts)
│  │     ├─ utils/           # Crypto, URL formatting, token resolver
│  │     ├─ room-service.ts  # Business logic & link generation
│  │     ├─ signaling.ts     # In-memory SignalingHub & peer session relay
│  │     ├─ app.ts           # App assembly, CORS, and WebSocket upgrade
│  │     └─ index.ts         # Server bootstrap
│  └─ web/           # Vue 3 client
│     └─ src/locales/    # en, ne, hi, es, fr, pt, ja (one JSON file each)
├─ packages/
│  └─ shared/        # Signaling message types and Zod schemas
├─ docs/
│  ├─ spec.md            # Architecture & technical specification
│  ├─ implementation-plan.md
│  ├─ webrtc-notes.md    # ICE, TURN, lessons learned, test results
│  └─ architecture.md
├─ turbo.json            # Turborepo tasks (dev, build, typecheck, lint, test)
├─ pnpm-workspace.yaml   # workspace packages: apps/*, packages/*
├─ package.json          # root scripts
├─ tsconfig.base.json    # shared TypeScript settings
├─ docker-compose.yml    # app + coturn
├─ .env.example
└─ README.md
```

---

## 7. Data model (SQLite)

**rooms**

| Column | Type | Notes |
|---|---|---|
| id | text (pk) | Short random id |
| host_token | text | Random, unique |
| guest_token | text | Random, unique |
| created_at | integer | Unix time |
| expires_at | integer | Unix time |

Room presence (who is connected right now) lives in server memory, not in the database.

---

## 8. REST API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/rooms` | Create a room, return `{ roomId, hostLink, guestLink }`. Optional body field `guestLang` adds `?lang=` to the guest link |
| GET | `/api/rooms/:id/validate?token=...` | Check a token is valid and the room has not expired, return role |
| GET | `/api/ice-servers?token=...` | Return STUN and short-lived TURN credentials |

TURN credentials are generated per request using the coturn shared-secret scheme, with a short lifetime (for example 1 hour). Static TURN passwords are never sent to the client.

---

## 9. Signaling protocol

Transport: WebSocket at `/ws?token=...`. Messages are JSON, validated with Zod, defined in `packages/shared`.

**Client → server**

| Type | Fields |
|---|---|
| `offer` | `sdp` |
| `answer` | `sdp` |
| `ice` | `candidate` |
| `leave` | none |

**Server → client**

| Type | Fields |
|---|---|
| `joined` | `role`, `peerPresent` |
| `peer-joined` | none |
| `peer-left` | none |
| `offer` / `answer` / `ice` | relayed as received |
| `error` | `code` (`ROOM_FULL`, `INVALID_TOKEN`, `EXPIRED`), `message` |

The server only relays messages between the two peers in a room. It does not read or store SDP.

---

## 10. WebRTC details

- **Negotiation:** use the "perfect negotiation" pattern. The guest is the polite peer and the host is the impolite peer, so offer collisions resolve cleanly.
- **Data channel:** created by the host, label `chat`, ordered and reliable.
- **ICE restart:** trigger `restartIce()` when `iceConnectionState` becomes `failed`, or `disconnected` for more than a few seconds, and when the browser reports a network change.
- **Quality badge:** poll `getStats()` every 2 seconds. Use packet loss, round-trip time and jitter on the inbound video and audio streams, then map them to good / fair / poor with documented thresholds.
- **Audio-only mode:** turn off the video track, and lower the sender bitrate with `RTCRtpSender.setParameters()` (`encodings[0].maxBitrate`) when video is on but quality is poor. Switching back restores the video track.
- **Permissions:** handle denied camera or microphone gracefully (join audio-only or show clear instructions).

---

### 10.1 Multi-language support (i18n)

Goal: each person sees the interface in their own language, even within the same call.

- **Languages at launch:**

  | Code | Language | Notes |
  |---|---|---|
  | `en` | English | Source language and fallback |
  | `ne` | Nepali | Devanagari script |
  | `hi` | Hindi | Devanagari script |
  | `es` | Spanish | Neutral Spanish (not region-specific) |
  | `fr` | French | |
  | `pt` | Portuguese | Written so it reads naturally for Brazilian users; can be split into `pt-BR` and `pt-PT` later |
  | `ja` | Japanese | Uses the ISO code `ja` (not `jp`, which is the country code) |

  Adding another language means adding one JSON file and registering its code, with no other code changes.
- **Language choice, in priority order:**
  1. `?lang=` in the link (the host can pick the guest's language when creating the room)
  2. Saved choice in `localStorage` (wrapped in try/catch, since storage can be unavailable)
  3. Browser language (`navigator.language`)
  4. Fallback to English
- **Switcher:** a language selector on the home page and inside the room. Switching does not interrupt the call.
- **Per person, not per room:** each peer picks their own UI language. Chat messages are sent as written and are not translated.
- **Server messages:** the server sends error **codes** only (`ROOM_FULL`, `EXPIRED`, `INVALID_TOKEN`), never display text. The client maps each code to a translated message.
- **Missing keys:** fall back to the English string, and log a warning in development.
- **Dates and numbers:** format with `Intl.DateTimeFormat` and `Intl.NumberFormat` using the active locale. Optional Devanagari numerals for Nepali (`ne-NP-u-nu-deva`).
- **Fonts:** Nepali and Hindi need a Devanagari-capable font (for example Noto Sans Devanagari) and Japanese needs a Japanese font (for example Noto Sans JP), so text renders correctly on all devices. Load each font only when that language is active, so users on slow networks do not download fonts they will never use.
- **Line breaks:** Japanese has no spaces between words, so set `word-break` and `line-break` rules and check long lines in the chat panel.
- **Layout:** use logical CSS properties (`margin-inline-start`, `text-align: start`) and set `dir` on the root element, so right-to-left languages (for example Arabic) can be added later without redesign.
- **Key check script:** a small CI script compares all locale files against `en.json` and fails if keys are missing or unused. This keeps translations in sync and is a good showcase detail.
- **Contributing a language:** documented in the README (copy `en.json`, translate, register the code, run the key check).
- **Translation quality:** the UI text is small (a few dozen strings), so start with machine translation and have a native speaker review each language before release. Mark unreviewed languages as "beta" in the language switcher until reviewed.

## 11. Security and privacy

- Room links contain long random tokens. Anyone with the link can join, so links are treated as secrets.
- Rooms expire. Expired tokens are rejected on both REST and WebSocket.
- Maximum 2 peers per room, enforced on the server.
- TURN credentials are short-lived and per session.
- No media or chat is stored. Chat travels over the peer-to-peer data channel.
- HTTPS is required in production (browsers block camera access on insecure origins, except `localhost`).

---

## 12. Testing plan

| Test | How |
|---|---|
| Signaling | Unit tests for message validation and room join rules (full room, bad token, expired) |
| Happy path | Two browser windows on localhost |
| NAT / TURN | Force relay-only mode (`iceTransportPolicy: "relay"`) and confirm the call still works |
| Poor network | Throttle with browser dev tools and `tc` (packet loss and latency) and record the badge behavior |
| Reconnect | Toggle airplane mode or switch Wi-Fi to mobile data and confirm ICE restart |
| Cross-browser | Chrome, Firefox, Safari (iOS) |
| Languages | Key check script passes for all 7 locales, Nepali, Hindi and Japanese text render correctly (font, line breaks) on Android and iOS, `?lang=` link and switcher work mid-call, long translated labels (for example French and Portuguese) do not break the control bar layout |

Results go into `docs/webrtc-notes.md` with screenshots or a short table.

---

## 13. Milestones

- [ ] **M0 Workspace:** pnpm workspaces, Turborepo (`turbo.json`), shared TypeScript and lint config, empty `apps/server`, `apps/web` and `packages/shared`, CI running `typecheck`, `lint` and `test`
- [ ] **M1 Signaling:** Hono server, WebSocket relay, room join rules, shared types
- [ ] **M2 Media:** Vue room page, local and remote video, mute and camera toggle
- [ ] **M3 Rooms:** create room, host and guest links, token validation, expiry
- [ ] **M4 Resilience:** TURN via docker-compose, ICE restart, room-full handling
- [ ] **M5 Quality:** chat data channel, quality badge, audio-only mode
- [ ] **M6 Languages:** `vue-i18n` setup, 7 locale files (en, ne, hi, es, fr, pt, ja), per-language font loading, switcher, `?lang=` support, key check script, native-speaker review
- [ ] **M7 Polish:** tests, `docs/webrtc-notes.md`, README with architecture diagram and demo GIF

Definition of done for the MVP: two people on different networks can complete a call using only the links, including when a direct connection is impossible and TURN is required.

---

## 14. README checklist (GitHub showcase)

- One-line pitch and a 60-second demo GIF
- Architecture diagram
- "Run it in 3 commands" with docker-compose
- Feature list and clear non-goals
- Short "What I learned about WebRTC" section linking to `docs/webrtc-notes.md`
- Test results on throttled networks
- License (MIT)

---

## 15. Roadmap after the MVP

These become the commercial product, built on top of this repo:

1. **Niche module:** pick one after validating the market (for example a recruitment interview room with scheduling, candidate notes and document check, or a language practice matcher).
2. **Accounts and admin:** agency or school panel, user roles, scheduled sessions.
3. **Time and locale:** dual time-zone display, BS and AD calendars, more languages (for example Bengali, Korean, Arabic with right-to-left layout) on top of the MVP's seven.
4. **AI add-ons (optional, per-tenant flag):** transcription, post-session summary, document reading.
5. **Packaging for sale:** installer or docker setup, documentation, license handling, white-label settings.
6. **Consent and recording:** explicit consent flow before any recording or AI processing.

Each module sits behind a feature flag and uses its own typed messages in `packages/shared`, so the core room stays small.
