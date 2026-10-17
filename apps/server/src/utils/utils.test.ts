import { describe, expect, it } from "vitest";
import { RoomModel } from "../models/room.model.js";
import { generateRoomId, generateToken } from "./crypto.js";
import { createDbTokenResolver } from "./token-resolver.js";
import { formatRoomLink } from "./url.js";

describe("Server Utils", () => {
  it("generateRoomId returns 8-character hex string", () => {
    const id = generateRoomId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("generateToken returns 32-character hex string", () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("formatRoomLink formats clean URLs with optional lang and baseUrl", () => {
    const relative = formatRoomLink("", "room-1", "token-abc");
    expect(relative).toBe("/room/room-1?token=token-abc");

    const withLang = formatRoomLink("https://bhet.app/", "room-1", "token-abc", "ne");
    expect(withLang).toBe("https://bhet.app/room/room-1?token=token-abc&lang=ne");
  });

  it("createDbTokenResolver resolves dev tokens and db tokens", () => {
    const model = new RoomModel(":memory:");
    const resolver = createDbTokenResolver(model);

    // Dev token
    const devRes = resolver("dev:sample-room:host");
    expect(devRes).toEqual({ valid: true, roomId: "sample-room", role: "host" });

    // DB token
    const room = model.createRoom(3600);
    const hostRes = resolver(room.host_token);
    expect(hostRes).toEqual({ valid: true, roomId: room.id, role: "host" });

    // Invalid token
    const invalidRes = resolver("unknown-token");
    expect(invalidRes).toEqual({
      valid: false,
      code: "INVALID_TOKEN",
      message: "Token not found",
    });
  });
});
