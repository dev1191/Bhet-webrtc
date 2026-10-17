import { createHmac } from "node:crypto";
import type { IceServerConfig } from "../room-service.js";

export interface TurnOptions {
  secret?: string;
  urls?: string[];
  ttlSeconds?: number;
}

export const DEFAULT_STUN_SERVERS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
];

/**
 * Generates ephemeral TURN credentials using Coturn's REST API / shared-secret scheme.
 * (RFC 5389 / draft-uberti-behave-turn-rest)
 */
export function generateIceServers(token: string, options: TurnOptions = {}): IceServerConfig[] {
  const secret = options.secret ?? process.env.TURN_SECRET;
  const rawUrls = options.urls ?? (process.env.TURN_URLS ? process.env.TURN_URLS.split(",") : []);
  const ttlSeconds = options.ttlSeconds ?? Number(process.env.TURN_CREDENTIAL_TTL_SECONDS ?? 3600);

  const iceServers: IceServerConfig[] = [
    {
      urls: DEFAULT_STUN_SERVERS,
    },
  ];

  if (secret && rawUrls.length > 0) {
    const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${expiry}:${token}`;
    const credential = createHmac("sha1", secret).update(username).digest("base64");

    iceServers.push({
      urls: rawUrls.map((u) => u.trim()),
      username,
      credential,
    });
  }

  return iceServers;
}
