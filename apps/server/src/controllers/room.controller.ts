import type { Context } from "hono";
import type { RoomService } from "../room-service.js";
import type { TokenResolver } from "../signaling.js";

export class RoomController {
  constructor(
    private roomService: RoomService,
    private tokenResolver: TokenResolver
  ) {}

  create = async (c: Context) => {
    let guestLang: string | undefined;
    try {
      const body = await c.req.json().catch(() => ({}));
      if (typeof body?.guestLang === "string") {
        guestLang = body.guestLang.trim();
      }
    } catch {
      // Body is optional
    }

    const baseUrl = process.env.APP_URL ?? "";
    const result = this.roomService.createRoom(guestLang, baseUrl);
    return c.json(result, 201);
  };

  validate = (c: Context) => {
    const roomId = c.req.param("id");
    const token = c.req.query("token");

    if (!roomId) {
      return c.json({ valid: false, code: "INVALID_TOKEN", message: "Room ID is required" }, 400);
    }

    const result = this.roomService.validateRoom(roomId, token);
    if (!result.valid) {
      return c.json(
        { valid: false, code: result.code, message: result.message },
        result.status
      );
    }

    return c.json({
      valid: true,
      role: result.role,
      roomId: result.roomId,
      guestToken: result.guestToken,
    });
  };

  getIceServers = async (c: Context) => {
    const token = c.req.query("token");
    if (!token) {
      return c.json({ error: "Token is required" }, 400);
    }

    const auth = await this.tokenResolver(token);
    if (!auth.valid) {
      return c.json({ error: auth.message, code: auth.code }, 401);
    }

    const iceServers = this.roomService.getIceServers(token);
    return c.json({ iceServers });
  };
}
