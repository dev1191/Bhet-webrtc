import { describe, expect, it } from "vitest";
import { RoomDatabase } from "./db.js";

describe("RoomDatabase", () => {
  it("creates a room with unique tokens and expiration", () => {
    const db = new RoomDatabase(":memory:");
    const room = db.createRoom(3600);

    expect(room.id).toBeTruthy();
    expect(room.host_token).toBeTruthy();
    expect(room.guest_token).toBeTruthy();
    expect(room.host_token).not.toEqual(room.guest_token);
    expect(room.expires_at - room.created_at).toBe(3600);

    const fetched = db.getRoom(room.id);
    expect(fetched).toEqual(room);
  });

  it("finds room and role by host or guest token", () => {
    const db = new RoomDatabase(":memory:");
    const room = db.createRoom();

    const hostLookup = db.findByToken(room.host_token);
    expect(hostLookup).toEqual({ room, role: "host" });

    const guestLookup = db.findByToken(room.guest_token);
    expect(guestLookup).toEqual({ room, role: "guest" });

    const notFound = db.findByToken("non-existent-token");
    expect(notFound).toBeUndefined();
  });

  it("deletes expired rooms", () => {
    const db = new RoomDatabase(":memory:");
    const room = db.createRoom(-10); // Expired 10 seconds ago
    db.createRoom(3600); // Valid

    const deleted = db.deleteExpired();
    expect(deleted).toBe(1);

    expect(db.getRoom(room.id)).toBeUndefined();
  });
});
