import { describe, expect, it } from "vitest";
import { RoomDatabase } from "./db.js";
import { RoomService } from "./room-service.js";

describe("RoomService", () => {
  it("creates a room and formats host and guest links", () => {
    const db = new RoomDatabase(":memory:");
    const service = new RoomService(db);

    const result = service.createRoom();
    expect(result.roomId).toBeTypeOf("string");
    expect(result.hostLink).toBe(`/room/${result.roomId}?token=${db.getRoom(result.roomId)?.host_token}`);
    expect(result.guestLink).toBe(`/room/${result.roomId}?token=${db.getRoom(result.roomId)?.guest_token}`);
  });

  it("appends guestLang and honors baseUrl", () => {
    const db = new RoomDatabase(":memory:");
    const service = new RoomService(db);

    const result = service.createRoom("ne", "https://bhet.app");
    expect(result.hostLink.startsWith("https://bhet.app/room/")).toBe(true);
    expect(result.guestLink.startsWith("https://bhet.app/room/")).toBe(true);
    expect(result.guestLink).toContain("&lang=ne");
  });

  it("validates token and checks expiry", () => {
    const db = new RoomDatabase(":memory:");
    const service = new RoomService(db);
    const room = db.createRoom(3600);

    // Host
    const hostResult = service.validateRoom(room.id, room.host_token);
    expect(hostResult).toEqual({ valid: true, role: "host", roomId: room.id, guestToken: room.guest_token });

    // Missing token
    const missingResult = service.validateRoom(room.id, undefined);
    expect(missingResult).toEqual({
      valid: false,
      code: "INVALID_TOKEN",
      message: "Token is required",
      status: 400,
    });

    // Wrong room id
    const wrongRoom = service.validateRoom("different-id", room.host_token);
    expect(wrongRoom).toEqual({
      valid: false,
      code: "INVALID_TOKEN",
      message: "Invalid room or token",
      status: 404,
    });

    // Expired room
    const expiredRoom = db.createRoom(-10);
    const expiredResult = service.validateRoom(expiredRoom.id, expiredRoom.host_token);
    expect(expiredResult).toEqual({
      valid: false,
      code: "EXPIRED",
      message: "Room has expired",
      status: 410,
    });
  });

  it("provides ICE servers", () => {
    const db = new RoomDatabase(":memory:");
    const service = new RoomService(db);

    const iceServers = service.getIceServers();
    expect(iceServers.length).toBeGreaterThan(0);
    expect(iceServers[0]!.urls.length).toBeGreaterThan(0);
  });
});
