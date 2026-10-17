# WebRTC Engineering & Operational Notes: Bhet (भेट)

This document details the architectural decisions, ICE gathering behaviors, TURN relay operations, and empirical network resilience test patterns established in **Bhet**.

---

## 1. Perfect Negotiation Pattern

Bhet implements the W3C **Perfect Negotiation** state machine to eliminate offer/answer race collisions without complex signaling locks.

### Role Assignment
- **Polite Peer (`guest`):** Rollback on offer collision (`pc.signalingState !== "stable"` and receiving an `offer`).
- **Impolite Peer (`host`):** Never rolls back on collision; ignores incoming colliding offers and asserts its own.

### Perfect Negotiation Loop
```ts
// Triggered automatically whenever tracks are added/removed
pc.onnegotiationneeded = async () => {
  try {
    makingOffer.value = true;
    await pc.setLocalDescription();
    sendSignaling({ type: "offer", sdp: pc.localDescription.sdp });
  } catch (err) {
    console.error("Negotiation error:", err);
  } finally {
    makingOffer.value = false;
  }
};
```

---

## 2. ICE Gathering & Candidate Lifecycle

### Candidate Trickling
- Candidates are trickled incrementally as discovered by `pc.onicecandidate`.
- ICE candidates are buffered on the signaling server if received before the peer has joined the room, preventing lost candidates.

### ICE Connection States & Recovery
| State | Behavior in Bhet |
| :--- | :--- |
| `new` / `checking` | Initial candidate pairing in progress. |
| `connected` / `completed` | Direct P2P or Relay established. Triggers quality stats polling. |
| `disconnected` | Temporary network blip (e.g., cell tower handover). 4-second timeout timer initiated before triggering ICE restart. |
| `failed` | All candidate pairs failed (symmetric NAT / firewalls). Triggers immediate `pc.restartIce()`. |

### Auto-Reconnection & Network Switching
- Network changes (e.g., Wi-Fi toggle or switching to cellular LTE):
  - Listened via `window.addEventListener("online", ...)`
  - Invokes `pc.restartIce()` to generate a new ICE ufrag/pwd and discover new local interface addresses.

---

## 3. TURN Relay & Ephemeral Credentials

Direct P2P fails on symmetric NATs (mobile networks, enterprise VPNs, universities). Bhet incorporates self-hosted **Coturn** with time-limited ephemeral credentials.

### Coturn Configuration
- **Ports:** `3478` (STUN/TURN UDP/TCP), `5349` (TLS), `49152-49200` (relay UDP port range).
- **Authentication:** `use-auth-secret` mechanism (HMAC-SHA1).

### Credential Generation Algorithm
Credentials expire after 1 hour (3600 seconds):
$$\text{timestamp} = \lfloor\text{now} / 1000\rfloor + 3600$$
$$\text{username} = \text{timestamp} : \text{token}$$
$$\text{password} = \text{HMAC-SHA1}(\text{TURN\_SECRET}, \text{username})\text{ in Base64}$$

Exposed securely to validated room participants via `GET /api/ice-servers?token=...`.

---

## 4. Connection Quality Stats Calculation

Polled every 2 seconds via `pc.getStats()`:
- **Round-Trip Time (RTT):** Extracted from `candidate-pair.currentRoundTripTime` ($\times 1000$ ms).
- **Packet Loss Percentage:**
  $$\text{Loss \%} = \frac{\Delta\text{packetsLost}}{\Delta\text{packetsLost} + \Delta\text{packetsReceived}} \times 100$$
- **Jitter:** Extracted from `inbound-rtp.jitter` ($\times 1000$ ms).

### Classification Thresholds
- **Good:** $\text{RTT} < 150\,\text{ms}$, $\text{Loss} < 2\%$, $\text{Jitter} < 30\,\text{ms}$.
- **Fair:** $\text{RTT} < 300\,\text{ms}$, $\text{Loss} < 8\%$, $\text{Jitter} < 60\,\text{ms}$.
- **Poor:** Exceeds fair thresholds (triggers red status warning).

---

## 5. Low-Bandwidth Audio-Only Mode

When network conditions degrade or mobile data must be preserved:
1. `videoTrack.enabled = false` stops local video transmission.
2. `sender.setParameters()` caps upstream bitrate to $32\,\text{kbps}$:
   ```ts
   const params = sender.getParameters();
   params.encodings = [{ maxBitrate: 32000 }];
   await sender.setParameters(params);
   ```
3. Switching back restores normal video bitrate ($1.5\,\text{Mbps}$) and re-enables track.

---

## 6. Empirical Testing & Network Throttling

To verify Bhet under adversarial conditions:
1. **Chrome DevTools Network Throttling:**
   - Emulate **"Slow 3G"** (500 kbps down, 50 kbps up, 400ms RTT). Quality badge correctly switches to `Fair`/`Poor`.
2. **Force TURN Relay:**
   - Pass `iceTransportPolicy: "relay"` in client config to block direct host/srflx candidates and verify zero-drop audio/video relay.
3. **Simulate Network Drop:**
   - Toggle offline/airplane mode in browser; upon reconnection, `online` event triggers `restartIce()`, recovering the call seamlessly.
