import { PROTOCOL_VERSION } from "@bhet/shared";
import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createApp } from "./app.js";
import { RoomDatabase } from "./db.js";

describe("Server HTTP & WebSocket", () => {
  let server: ReturnType<typeof serve>;
  let baseUrl: string;
  let wsUrl: string;
  let db: RoomDatabase;
  let app: ReturnType<typeof createApp>["app"];
  let nodeWs: ReturnType<typeof createApp>["nodeWs"];

  beforeAll(async () => {
    db = new RoomDatabase(":memory:");
    const created = createApp({ db });
    app = created.app;
    nodeWs = created.nodeWs;

    await new Promise<void>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0 }, () => resolve());
      created.nodeWs.injectWebSocket(server);
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    wsUrl = `ws://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    try {
      (nodeWs as unknown as { wss?: { close?: (cb?: () => void) => void } })?.wss?.close?.();
      (server as unknown as { closeAllConnections?: () => void })?.closeAllConnections?.();
    } catch {
      // ignore
    }
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
      setTimeout(resolve, 500);
    });
    db.close();
  });

  it("GET /health reports ok and protocol version", async () => {
    const res = await app.request(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", protocol: PROTOCOL_VERSION });
  });

  it("POST /api/rooms creates a room with host and guest links", async () => {
    const res = await app.request(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestLang: "ne" }),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as { roomId: string; hostLink: string; guestLink: string };
    expect(data.roomId).toBeTypeOf("string");
    expect(data.hostLink).toContain(`/room/${data.roomId}?token=`);
    expect(data.guestLink).toContain(`/room/${data.roomId}?token=`);
    expect(data.guestLink).toContain("&lang=ne");
  });

  it("GET /api/rooms/:id/validate checks token and expiry", async () => {
    const room = db.createRoom(3600);

    // Valid host
    const hostRes = await app.request(`${baseUrl}/api/rooms/${room.id}/validate?token=${room.host_token}`);
    expect(hostRes.status).toBe(200);
    expect(await hostRes.json()).toEqual({ valid: true, role: "host", roomId: room.id, guestToken: room.guest_token });

    // Valid guest
    const guestRes = await app.request(`${baseUrl}/api/rooms/${room.id}/validate?token=${room.guest_token}`);
    expect(guestRes.status).toBe(200);
    expect(await guestRes.json()).toEqual({ valid: true, role: "guest", roomId: room.id });

    // Missing token
    const noToken = await app.request(`${baseUrl}/api/rooms/${room.id}/validate`);
    expect(noToken.status).toBe(400);

    // Invalid token
    const badToken = await app.request(`${baseUrl}/api/rooms/${room.id}/validate?token=wrong`);
    expect(badToken.status).toBe(404);

    // Expired room
    const expiredRoom = db.createRoom(-60);
    const expiredRes = await app.request(`${baseUrl}/api/rooms/${expiredRoom.id}/validate?token=${expiredRoom.host_token}`);
    expect(expiredRes.status).toBe(410);
  });

  it("GET /api/ice-servers validates token and returns STUN servers", async () => {
    const room = db.createRoom(3600);

    // Valid
    const res = await app.request(`${baseUrl}/api/ice-servers?token=${room.host_token}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { iceServers: Array<{ urls: string[] }> };
    expect(data.iceServers).toBeDefined();
    expect(data.iceServers[0]!.urls.length).toBeGreaterThan(0);

    // Invalid
    const bad = await app.request(`${baseUrl}/api/ice-servers?token=bad-token`);
    expect(bad.status).toBe(401);
  });

  it("relays signaling between real WebSocket clients using DB tokens", async () => {
    const room = db.createRoom(3600);

    const hostWs = new WebSocket(`${wsUrl}/ws?token=${room.host_token}`);
    const hostMessages: Record<string, unknown>[] = [];
    hostWs.on("message", (data) => {
      hostMessages.push(JSON.parse(data.toString()));
    });

    await new Promise((resolve) => hostWs.on("open", resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(hostMessages).toContainEqual({
      type: "joined",
      role: "host",
      peerPresent: false,
    });

    const guestWs = new WebSocket(`${wsUrl}/ws?token=${room.guest_token}`);
    const guestMessages: Record<string, unknown>[] = [];
    guestWs.on("message", (data) => {
      guestMessages.push(JSON.parse(data.toString()));
    });

    await new Promise((resolve) => guestWs.on("open", resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(guestMessages).toContainEqual({
      type: "joined",
      role: "guest",
      peerPresent: true,
    });
    expect(hostMessages).toContainEqual({
      type: "peer-joined",
    });

    // Relay offer
    hostWs.send(JSON.stringify({ type: "offer", sdp: "v=0-db-test-offer" }));
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(guestMessages).toContainEqual({
      type: "offer",
      sdp: "v=0-db-test-offer",
    });

    hostWs.close();
    guestWs.close();
  });

  it("rejects 3rd participant trying to join full room with ROOM_FULL error", async () => {
    const room = db.createRoom(3600);

    const hostWs = new WebSocket(`${wsUrl}/ws?token=${room.host_token}`);
    const guestWs = new WebSocket(`${wsUrl}/ws?token=${room.guest_token}`);

    await Promise.all([
      new Promise((res) => hostWs.on("open", res)),
      new Promise((res) => guestWs.on("open", res)),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 3rd peer attempts to join with guest token
    const extraWs = new WebSocket(`${wsUrl}/ws?token=${room.guest_token}`);
    const extraMessages: Record<string, unknown>[] = [];
    extraWs.on("message", (data) => {
      extraMessages.push(JSON.parse(data.toString()));
    });

    await new Promise((res) => extraWs.on("open", res));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(extraMessages[0]).toMatchObject({
      type: "error",
      code: "ROOM_FULL",
    });

    hostWs.close();
    guestWs.close();
    extraWs.close();
  });

  it("rejects WebSocket connection with expired token", async () => {
    const expiredRoom = db.createRoom(-10);

    const ws = new WebSocket(`${wsUrl}/ws?token=${expiredRoom.host_token}`);
    const messages: Record<string, unknown>[] = [];
    ws.on("message", (data) => {
      messages.push(JSON.parse(data.toString()));
    });

    await new Promise((res) => ws.on("open", res));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(messages).toContainEqual({
      type: "error",
      code: "EXPIRED",
      message: "Room has expired",
    });

    ws.close();
  });

  it("notifies host when guest disconnects (peer-left)", async () => {
    const room = db.createRoom(3600);

    const hostWs = new WebSocket(`${wsUrl}/ws?token=${room.host_token}`);
    const hostMessages: Record<string, unknown>[] = [];
    hostWs.on("message", (data) => {
      hostMessages.push(JSON.parse(data.toString()));
    });

    await new Promise((res) => hostWs.on("open", res));

    const guestWs = new WebSocket(`${wsUrl}/ws?token=${room.guest_token}`);
    await new Promise((res) => guestWs.on("open", res));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Guest closes connection
    guestWs.close();
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(hostMessages).toContainEqual({
      type: "peer-left",
    });

    hostWs.close();
  });

  it("POST /api/translate translates text and validates inputs", async () => {
    // Missing text
    const badRes = await app.request(`${baseUrl}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(badRes.status).toBe(400);

    // Valid translation request
    const res = await app.request(`${baseUrl}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Hola",
        sourceLang: "es",
        targetLang: "en",
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.original).toBe("Hola");
    expect(data.translated).toBeTypeOf("string");
    expect(data.targetLang).toBe("en");
  });
});
