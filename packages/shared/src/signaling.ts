import { z } from "zod";

/** Bump when the signaling message format changes in a breaking way. */
export const PROTOCOL_VERSION = 1;

export const ROLES = ["host", "guest"] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/**
 * Error codes sent by the server. The server never sends display text:
 * the client maps each code to a message in the user's language.
 */
export const ERROR_CODES = [
  "ROOM_FULL",
  "INVALID_TOKEN",
  "EXPIRED",
  "BAD_MESSAGE",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Mirrors the browser's RTCIceCandidateInit. */
export const IceCandidateSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullish(),
  sdpMLineIndex: z.number().int().nullish(),
  usernameFragment: z.string().nullish(),
});
export type IceCandidate = z.infer<typeof IceCandidateSchema>;

/** Messages a browser sends to the server. */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("offer"), sdp: z.string() }),
  z.object({ type: z.literal("answer"), sdp: z.string() }),
  z.object({ type: z.literal("ice"), candidate: IceCandidateSchema }),
  z.object({ type: z.literal("leave") }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Messages the server sends to a browser. */
export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("joined"),
    role: RoleSchema,
    peerPresent: z.boolean(),
  }),
  z.object({ type: z.literal("peer-joined") }),
  z.object({ type: z.literal("peer-left") }),
  z.object({ type: z.literal("offer"), sdp: z.string() }),
  z.object({ type: z.literal("answer"), sdp: z.string() }),
  z.object({ type: z.literal("ice"), candidate: IceCandidateSchema }),
  z.object({
    type: z.literal("error"),
    code: ErrorCodeSchema,
    /** Developer-facing detail for logs. Never shown to users. */
    message: z.string().optional(),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Parse and validate a raw WebSocket frame from a browser. Returns null if invalid. */
export function parseClientMessage(raw: string): ClientMessage | null {
  const result = ClientMessageSchema.safeParse(parseJson(raw));
  return result.success ? result.data : null;
}

/** Parse and validate a raw WebSocket frame from the server. Returns null if invalid. */
export function parseServerMessage(raw: string): ServerMessage | null {
  const result = ServerMessageSchema.safeParse(parseJson(raw));
  return result.success ? result.data : null;
}
