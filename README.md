# Bhet (भेट)

> **Bhet** (भेट) is the Nepali word for "meeting" or "encounter".
> A self-hostable, private 1:1 WebRTC video call room with automatic TURN relay fallback, real-time connection quality monitoring, in-call encrypted peer-to-peer text chat, live speech-to-text closed captions (CC), voice dictation, low-bandwidth audio-only mode, and full 7-language internationalization.

<p align="center">
  <img src="./bhet_home_page.png" alt="Bhet — Private 1:1 Video Calls" width="100%" />
</p>

---

## Highlights

- **Zero Sign-Up & Zero Trackers:** Create a room in 1 click; share the guest link; talk immediately.
- **W3C Perfect Negotiation:** Rock-solid WebRTC state machine handling bidirectional offers/answers without race collisions.
- **Self-Hosted TURN Relay:** Coturn integration with HMAC-SHA1 ephemeral credentials ensures calls connect through symmetric NATs, firewalls, and cellular networks.
- **High-Accuracy Speech-to-Text:** Server-side Whisper (`whisper-large-v3-turbo` via Groq) with intelligent silence/hallucination filtering, plus automatic client fallback to native W3C Web Speech API.
- **Live Closed Captions (CC):** In-call synchronized subtitles streaming peer-to-peer over `RTCDataChannel("captions")` with low latency.
- **Real-Time Speech Translation:** Automatic live translation of foreign speech (Nepali, Hindi, Spanish, French, Japanese, Portuguese, etc.) into English subtitles with server-side caching.
- **Chat Voice Dictation:** One-tap speech-to-text in the in-call chat input with multi-language synchronization.
- **Automated Reconnection:** Automatic ICE restarts on network handovers (e.g., switching from Wi-Fi to cellular 4G/5G).
- **In-Call P2P DataChannel Chat:** Text messages flow directly peer-to-peer via `RTCDataChannel("chat")` without ever touching server disks.
- **Web Audio Chimes & Visual Toasts:** Synthesized notification sounds for incoming messages and peer arrival with mobile gesture unlock.
- **Real-Time Quality Metrics:** Live `getStats()` polling measuring round-trip time (RTT), packet loss percentage, and jitter.
- **Adaptive Audio-Only Mode:** One-click toggle capping upstream video bitrate to 32 kbps to maintain voice clarity on weak networks.
- **Structured Diagnostic Logging:** High-performance Pino logger with file persistence (`logs/app.log`), console pretty-printing (`pino-pretty`), and client-side diagnostic telemetry over WebSocket signaling.
- **7-Language Internationalization:** English, Nepali (नेपाली), Hindi (हिन्दी), Spanish (Español), French (Français), Portuguese (Português), and Japanese (日本語) with on-demand Devanagari and Japanese font loading.
- **Modern Responsive UI:** Built with UnoCSS (`@unocss/preset-wind4`) and Element Plus controls dock with full mobile safe-area support.

---

## Architecture Overview

```
                                      +------------------------------------+
                                      |            Coturn Server           |
                                      |    (STUN :3478 / TURN Relay)       |
                                      +------------------------------------+
                                            ^                        ^
                                            | Ephemeral              | Ephemeral
                                            | Credentials            | Credentials
                                            v                        v
+------------------------+      WebSocket Signaling       +------------------------+
|      Host Browser      | <============================> |     Guest Browser      |
|  - Vue 3 + ElementPlus |          (ws:// / wss://)      |  - Vue 3 + ElementPlus |
|  - Impolite Peer       |                                |  - Polite Peer         |
+------------------------+                                +------------------------+
            \                                                    /
             \========= Direct P2P SRTP Media & DataChannel =====/
                         (Audio, Video, Encrypted Chat, CC)
```

### Backend Architecture (Node.js + Hono + SQLite)
Built using the **MVC + Service** pattern:
- **Models (`src/models/room.model.ts`):** Lightweight SQLite database layer managing room state and 24-hour expirations.
- **Service (`src/room-service.ts`):** Business logic orchestrating room creation, cryptographic token generation, and TURN credential signing.
- **Controllers & API Endpoints:**
  - `POST /api/rooms` — Room creation with cryptographically secure host/guest tokens.
  - `GET /api/rooms/:id/validate` — Token and capacity verification.
  - `GET /api/ice-servers` — Ephemeral TURN/STUN credential minting.
  - `POST /api/transcribe` — Multilingual audio slice speech-to-text with Groq Whisper.
  - `POST /api/translate` — Real-time text translation with in-memory caching.
- **Signaling Hub (`src/signaling.ts`):** In-memory WebSocket hub routing messages, enforcing strict 2-peer room limits (`ROOM_FULL`), and collecting diagnostic logs.
- **Logging Subsystem (`src/utils/logger.ts`):** Pino file logger (`logs/app.log`) and pretty console streams.

---

## Run in 3 Commands (Docker Compose)

The fastest way to spin up the complete stack with self-hosted TURN:

```bash
# 1. Clone the repository
git clone https://github.com/dev1191/Bhet-webrtc.git && cd bhet

# 2. Configure environment
cp .env.example .env

# 3. Launch Bhet and Coturn
docker compose up -d --build
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Configuration

Configure the following variables in `.env` (or via Docker Compose environment):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port for the backend API and WebSocket server |
| `DB_PATH` | `./data/bhet.sqlite` | Path to the SQLite database storing room sessions |
| `APP_URL` | `http://localhost:5173` | Allowed origin for CORS and web client URL |
| `TURN_SECRET` | `bhet-shared-turn-secret` | HMAC-SHA1 shared secret for coturn ephemeral credentials |
| `TURN_REALM` | `bhet.local` | Realm used by coturn |
| `TURN_URLS` | `turn:localhost:3478?transport=udp,...` | Comma-separated list of STUN/TURN URLs |
| `TURN_CREDENTIAL_TTL_SECONDS` | `3600` | Lifespan of generated ICE TURN credentials in seconds |
| `GROQ_API_KEY` | *(Optional)* | Groq API key for multilingual Whisper Speech-to-Text (`whisper-large-v3-turbo`) |

---

## Local Development

Requirements:
- Node.js 22 or newer
- [pnpm](https://pnpm.io) 10+

```bash
# Install dependencies across all packages
pnpm install

# Start all applications in watch mode (Server :3000, Web :5173)
pnpm dev
```

### Monorepo Commands (Turborepo)

```bash
# Typecheck TypeScript across all packages
pnpm typecheck

# Run all test suites (Unit, Service, Controller, Signaling, Integration)
pnpm test

# Verify 100% key parity across all 7 translation locales
pnpm check:i18n

# Lint codebase
pnpm lint

# Production build
pnpm build
```

---

## Contributing a New Language

Adding a new language takes 4 simple steps without modifying core application code:

1. Copy `apps/web/src/locales/en.json` to `apps/web/src/locales/<locale-code>.json` (e.g., `de.json`).
2. Translate the string values.
3. Register the locale in `SUPPORTED_LOCALES` in `apps/web/src/i18n.ts`.
4. Run `pnpm check:i18n` to verify key parity.

---

## Documentation

- [`docs/spec.md`](./docs/spec.md) — Complete engineering specification and design principles.
- [`docs/implementation-plan.md`](./docs/implementation-plan.md) — Milestone breakdown and phase deliverables.
- [`docs/webrtc-notes.md`](./docs/webrtc-notes.md) — Deep-dive into ICE candidate trickling, TURN configuration, and network throttling benchmarks.

---

## License

MIT © [Bhet Contributors](https://github.com/dev1191/Bhet-webrtc)
