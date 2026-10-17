import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_STUN_SERVERS, generateIceServers } from "./turn.js";

describe("generateIceServers", () => {
  it("returns default STUN servers when no TURN credentials are provided", () => {
    const servers = generateIceServers("test-token", { secret: undefined, urls: [] });
    expect(servers.length).toBe(1);
    expect(servers[0]!.urls).toEqual(DEFAULT_STUN_SERVERS);
  });

  it("generates HMAC-SHA1 credentials when secret and urls are configured", () => {
    const secret = "super-secret-key";
    const urls = ["turn:turn.bhet.local:3478?transport=udp", "turn:turn.bhet.local:3478?transport=tcp"];
    const token = "my-token-123";

    const servers = generateIceServers(token, {
      secret,
      urls,
      ttlSeconds: 1800,
    });

    expect(servers.length).toBe(2);
    expect(servers[0]!.urls).toEqual(DEFAULT_STUN_SERVERS);

    const turnConfig = servers[1]!;
    expect(turnConfig.urls).toEqual(urls);
    expect(turnConfig.username).toBeDefined();
    expect(turnConfig.credential).toBeDefined();

    // Verify username structure: <timestamp>:<token>
    const [timestampStr, parsedToken] = turnConfig.username!.split(":");
    expect(parsedToken).toBe(token);
    const timestamp = Number(timestampStr);
    expect(timestamp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // Verify HMAC-SHA1 calculation
    const expectedCredential = createHmac("sha1", secret).update(turnConfig.username!).digest("base64");
    expect(turnConfig.credential).toBe(expectedCredential);
  });
});
