import type { Role } from "@bhet/shared";
import { RoomDatabase } from "./db.js";
import { generateIceServers } from "./utils/turn.js";
import { formatRoomLink } from "./utils/url.js";

export interface CreateRoomResult {
  roomId: string;
  hostLink: string;
  guestLink: string;
}

export type ValidateRoomResult =
  | { valid: true; role: Role; roomId: string; guestToken?: string }
  | { valid: false; code: "INVALID_TOKEN" | "EXPIRED"; message: string; status: 400 | 404 | 410 };

export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export class RoomService {
  constructor(private db: RoomDatabase) {}

  createRoom(guestLang?: string, baseUrl = ""): CreateRoomResult {
    const room = this.db.createRoom();
    const hostLink = formatRoomLink(baseUrl, room.id, room.host_token);
    const guestLink = formatRoomLink(baseUrl, room.id, room.guest_token, guestLang);

    return {
      roomId: room.id,
      hostLink,
      guestLink,
    };
  }

  validateRoom(roomId: string, token?: string): ValidateRoomResult {
    if (!token) {
      return {
        valid: false,
        code: "INVALID_TOKEN",
        message: "Token is required",
        status: 400,
      };
    }

    const found = this.db.findByToken(token);
    if (!found || found.room.id !== roomId) {
      return {
        valid: false,
        code: "INVALID_TOKEN",
        message: "Invalid room or token",
        status: 404,
      };
    }

    const now = Math.floor(Date.now() / 1000);
    if (found.room.expires_at < now) {
      return {
        valid: false,
        code: "EXPIRED",
        message: "Room has expired",
        status: 410,
      };
    }

    return {
      valid: true,
      role: found.role,
      roomId: found.room.id,
      guestToken: found.role === "host" ? found.room.guest_token : undefined,
    };
  }

  getIceServers(token?: string): IceServerConfig[] {
    return generateIceServers(token ?? "anonymous");
  }
}
