import {
  type ErrorCode,
  type Role,
  type ServerMessage,
  parseClientMessage,
} from "@bhet/shared";

export interface WebSocketSession {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type TokenResolution =
  | { valid: true; roomId: string; role: Role }
  | { valid: false; code: ErrorCode; message: string };

export type TokenResolver = (token: string) => Promise<TokenResolution> | TokenResolution;

interface RoomSession {
  host?: WebSocketSession;
  guest?: WebSocketSession;
}

export class SignalingHub {
  private rooms = new Map<string, RoomSession>();
  private socketToRoom = new Map<WebSocketSession, { roomId: string; role: Role }>();

  constructor(private resolveToken: TokenResolver) {}

  async handleConnection(ws: WebSocketSession, token: string | undefined): Promise<void> {
    if (!token) {
      this.sendError(ws, "INVALID_TOKEN", "Token query parameter is required");
      ws.close(4001, "Token required");
      return;
    }

    const auth = await this.resolveToken(token);
    if (!auth.valid) {
      this.sendError(ws, auth.code, auth.message);
      ws.close(4001, auth.message);
      return;
    }

    const { roomId, role } = auth;
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {};
      this.rooms.set(roomId, room);
    }

    // Maximum 2 peers per room: one host and one guest
    if (room[role]) {
      this.sendError(ws, "ROOM_FULL", `A ${role} is already connected to this room`);
      ws.close(4002, "Room full");
      return;
    }

    // Attach peer to room
    room[role] = ws;
    this.socketToRoom.set(ws, { roomId, role });

    const otherRole: Role = role === "host" ? "guest" : "host";
    const peer = room[otherRole];
    const peerPresent = Boolean(peer);

    // Notify connected peer of join success
    this.sendMessage(ws, {
      type: "joined",
      role,
      peerPresent,
    });

    // Notify existing peer that second peer joined
    if (peer) {
      this.sendMessage(peer, { type: "peer-joined" });
    }
  }

  handleMessage(ws: WebSocketSession, raw: string): void {
    const session = this.socketToRoom.get(ws);
    if (!session) {
      this.sendError(ws, "BAD_MESSAGE", "Session not found");
      return;
    }

    const message = parseClientMessage(raw);
    if (!message) {
      this.sendError(ws, "BAD_MESSAGE", "Malformed message payload");
      return;
    }

    if (message.type === "leave") {
      this.handleDisconnect(ws);
      ws.close(1000, "Left");
      return;
    }

    const room = this.rooms.get(session.roomId);
    if (!room) return;

    const targetRole: Role = session.role === "host" ? "guest" : "host";
    const target = room[targetRole];
    if (!target) return;

    // Relay offer, answer, or ice directly to the other peer
    this.sendMessage(target, message);
  }

  handleDisconnect(ws: WebSocketSession): void {
    const session = this.socketToRoom.get(ws);
    if (!session) return;

    this.socketToRoom.delete(ws);
    const { roomId, role } = session;
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room[role] === ws) {
      delete room[role];
    }

    const otherRole: Role = role === "host" ? "guest" : "host";
    const peer = room[otherRole];

    if (peer) {
      this.sendMessage(peer, { type: "peer-left" });
    }

    if (!room.host && !room.guest) {
      this.rooms.delete(roomId);
    }
  }

  getConnectedPeerCount(roomId: string): number {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    return (room.host ? 1 : 0) + (room.guest ? 1 : 0);
  }

  private sendMessage(ws: WebSocketSession, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }

  private sendError(ws: WebSocketSession, code: ErrorCode, message?: string): void {
    this.sendMessage(ws, {
      type: "error",
      code,
      message,
    });
  }
}
