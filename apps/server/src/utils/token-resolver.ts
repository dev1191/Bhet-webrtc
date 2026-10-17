import type { RoomModel } from "../models/room.model.js";
import type { TokenResolution, TokenResolver } from "../signaling.js";

/**
 * Creates a TokenResolver that verifies tokens against the SQLite RoomModel.
 * Also supports the `dev:<roomId>:<role>` token format for quick local testing.
 */
export function createDbTokenResolver(model: RoomModel): TokenResolver {
  return (token: string): TokenResolution => {
    if (token.startsWith("dev:")) {
      const parts = token.split(":");
      const roomId = parts[1];
      const role = parts[2];
      if (roomId && (role === "host" || role === "guest")) {
        return { valid: true, roomId, role };
      }
    }

    const found = model.findByToken(token);
    if (!found) {
      return { valid: false, code: "INVALID_TOKEN", message: "Token not found" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (found.room.expires_at < now) {
      return { valid: false, code: "EXPIRED", message: "Room has expired" };
    }

    return { valid: true, roomId: found.room.id, role: found.role };
  };
}
