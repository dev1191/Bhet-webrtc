import { randomBytes } from "node:crypto";

/** Generates an 8-character random hexadecimal room ID. */
export function generateRoomId(): string {
  return randomBytes(4).toString("hex");
}

/** Generates a 32-character random hexadecimal token for host or guest authentication. */
export function generateToken(): string {
  return randomBytes(16).toString("hex");
}
