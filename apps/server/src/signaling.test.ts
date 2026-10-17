import { describe, expect, it } from "vitest";
import { SignalingHub, type TokenResolution, type WebSocketSession } from "./signaling.js";

class MockWebSocket implements WebSocketSession {
  sent: string[] = [];
  closed = false;
  closeCode?: number;
  closeReason?: string;

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
  }

  get lastParsed() {
    if (this.sent.length === 0) return null;
    return JSON.parse(this.sent[this.sent.length - 1]!);
  }
}

describe("SignalingHub", () => {
  const tokenMap = new Map<string, TokenResolution>([
    ["valid-host-1", { valid: true, roomId: "room-1", role: "host" }],
    ["valid-guest-1", { valid: true, roomId: "room-1", role: "guest" }],
    ["another-host-1", { valid: true, roomId: "room-1", role: "host" }],
    ["expired-token", { valid: false, code: "EXPIRED", message: "Room expired" }],
  ]);

  const resolver = (token: string): TokenResolution =>
    tokenMap.get(token) ?? { valid: false, code: "INVALID_TOKEN", message: "Invalid token" };

  it("rejects connection without token", async () => {
    const hub = new SignalingHub(resolver);
    const ws = new MockWebSocket();

    await hub.handleConnection(ws, undefined);

    expect(ws.closed).toBe(true);
    expect(ws.closeCode).toBe(4001);
    expect(ws.lastParsed).toEqual({
      type: "error",
      code: "INVALID_TOKEN",
      message: "Token query parameter is required",
    });
  });

  it("rejects connection with invalid or expired token", async () => {
    const hub = new SignalingHub(resolver);
    const ws = new MockWebSocket();

    await hub.handleConnection(ws, "expired-token");

    expect(ws.closed).toBe(true);
    expect(ws.lastParsed).toEqual({
      type: "error",
      code: "EXPIRED",
      message: "Room expired",
    });
  });

  it("allows host to join, notifies peerPresent: false", async () => {
    const hub = new SignalingHub(resolver);
    const hostWs = new MockWebSocket();

    await hub.handleConnection(hostWs, "valid-host-1");

    expect(hostWs.closed).toBe(false);
    expect(hostWs.lastParsed).toEqual({
      type: "joined",
      role: "host",
      peerPresent: false,
    });
  });

  it("allows guest to join, notifies guest and host (peer-joined)", async () => {
    const hub = new SignalingHub(resolver);
    const hostWs = new MockWebSocket();
    const guestWs = new MockWebSocket();

    await hub.handleConnection(hostWs, "valid-host-1");
    await hub.handleConnection(guestWs, "valid-guest-1");

    expect(guestWs.lastParsed).toEqual({
      type: "joined",
      role: "guest",
      peerPresent: true,
    });
    expect(hostWs.lastParsed).toEqual({
      type: "peer-joined",
    });
    expect(hub.getConnectedPeerCount("room-1")).toBe(2);
  });

  it("rejects 3rd peer when role is already connected (ROOM_FULL)", async () => {
    const hub = new SignalingHub(resolver);
    const host1 = new MockWebSocket();
    const host2 = new MockWebSocket();

    await hub.handleConnection(host1, "valid-host-1");
    await hub.handleConnection(host2, "another-host-1");

    expect(host2.closed).toBe(true);
    expect(host2.closeCode).toBe(4002);
    expect(host2.lastParsed).toEqual({
      type: "error",
      code: "ROOM_FULL",
      message: "A host is already connected to this room",
    });
  });

  it("relays offer, answer, and ice between peers", async () => {
    const hub = new SignalingHub(resolver);
    const host = new MockWebSocket();
    const guest = new MockWebSocket();

    await hub.handleConnection(host, "valid-host-1");
    await hub.handleConnection(guest, "valid-guest-1");

    // Host sends offer
    hub.handleMessage(host, JSON.stringify({ type: "offer", sdp: "v=0..." }));
    expect(guest.lastParsed).toEqual({ type: "offer", sdp: "v=0..." });

    // Guest sends answer
    hub.handleMessage(guest, JSON.stringify({ type: "answer", sdp: "v=0...ans" }));
    expect(host.lastParsed).toEqual({ type: "answer", sdp: "v=0...ans" });

    // ICE candidate relay
    const candidate = { candidate: "candidate:1 1 UDP ...", sdpMid: "0", sdpMLineIndex: 0 };
    hub.handleMessage(host, JSON.stringify({ type: "ice", candidate }));
    expect(guest.lastParsed).toEqual({ type: "ice", candidate });
  });

  it("notifies other peer with peer-left when a peer disconnects", async () => {
    const hub = new SignalingHub(resolver);
    const host = new MockWebSocket();
    const guest = new MockWebSocket();

    await hub.handleConnection(host, "valid-host-1");
    await hub.handleConnection(guest, "valid-guest-1");

    hub.handleDisconnect(guest);

    expect(host.lastParsed).toEqual({ type: "peer-left" });
    expect(hub.getConnectedPeerCount("room-1")).toBe(1);

    hub.handleDisconnect(host);
    expect(hub.getConnectedPeerCount("room-1")).toBe(0);
  });

  it("handles leave message gracefully", async () => {
    const hub = new SignalingHub(resolver);
    const host = new MockWebSocket();
    const guest = new MockWebSocket();

    await hub.handleConnection(host, "valid-host-1");
    await hub.handleConnection(guest, "valid-guest-1");

    hub.handleMessage(guest, JSON.stringify({ type: "leave" }));

    expect(guest.closed).toBe(true);
    expect(host.lastParsed).toEqual({ type: "peer-left" });
  });
});
