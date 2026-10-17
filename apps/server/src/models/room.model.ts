import DatabaseConstructor, { type Database } from "better-sqlite3";
import type { Role } from "@bhet/shared";
import { generateRoomId, generateToken } from "../utils/crypto.js";

export interface RoomRecord {
  id: string;
  host_token: string;
  guest_token: string;
  created_at: number;
  expires_at: number;
}

export const DEFAULT_ROOM_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export class RoomModel {
  private db: Database;

  constructor(filePath = ":memory:") {
    this.db = new DatabaseConstructor(filePath);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        host_token TEXT NOT NULL UNIQUE,
        guest_token TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rooms_host_token ON rooms(host_token);
      CREATE INDEX IF NOT EXISTS idx_rooms_guest_token ON rooms(guest_token);
      CREATE INDEX IF NOT EXISTS idx_rooms_expires_at ON rooms(expires_at);
    `);
  }

  createRoom(ttlSeconds = DEFAULT_ROOM_TTL_SECONDS): RoomRecord {
    const id = generateRoomId();
    const host_token = generateToken();
    const guest_token = generateToken();
    const created_at = Math.floor(Date.now() / 1000);
    const expires_at = created_at + ttlSeconds;

    const stmt = this.db.prepare(`
      INSERT INTO rooms (id, host_token, guest_token, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, host_token, guest_token, created_at, expires_at);

    return { id, host_token, guest_token, created_at, expires_at };
  }

  getRoom(id: string): RoomRecord | undefined {
    const stmt = this.db.prepare<[string], RoomRecord>(`
      SELECT id, host_token, guest_token, created_at, expires_at
      FROM rooms
      WHERE id = ?
    `);
    return stmt.get(id);
  }

  findByToken(token: string): { room: RoomRecord; role: Role } | undefined {
    const stmt = this.db.prepare<[string, string], RoomRecord>(`
      SELECT id, host_token, guest_token, created_at, expires_at
      FROM rooms
      WHERE host_token = ? OR guest_token = ?
    `);
    const room = stmt.get(token, token);
    if (!room) return undefined;

    const role: Role = room.host_token === token ? "host" : "guest";
    return { room, role };
  }

  deleteExpired(nowSeconds = Math.floor(Date.now() / 1000)): number {
    const stmt = this.db.prepare(`DELETE FROM rooms WHERE expires_at < ?`);
    const info = stmt.run(nowSeconds);
    return Number(info.changes);
  }

  close(): void {
    this.db.close();
  }
}
