import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  parseClientMessage,
  parseServerMessage,
} from "./signaling.js";

describe("parseClientMessage", () => {
  it("accepts a valid offer", () => {
    const message = parseClientMessage(
      JSON.stringify({ type: "offer", sdp: "v=0..." }),
    );
    expect(message).toEqual({ type: "offer", sdp: "v=0..." });
  });

  it("accepts an ICE candidate with optional fields missing or null", () => {
    const message = parseClientMessage(
      JSON.stringify({
        type: "ice",
        candidate: { candidate: "candidate:1 1 udp ...", sdpMid: null },
      }),
    );
    expect(message?.type).toBe("ice");
  });

  it("accepts leave", () => {
    expect(parseClientMessage(JSON.stringify({ type: "leave" }))).toEqual({
      type: "leave",
    });
  });

  it("rejects unknown message types", () => {
    expect(parseClientMessage(JSON.stringify({ type: "boom" }))).toBeNull();
  });

  it("rejects messages with missing fields", () => {
    expect(parseClientMessage(JSON.stringify({ type: "offer" }))).toBeNull();
  });

  it("rejects text that is not JSON", () => {
    expect(parseClientMessage("not json")).toBeNull();
  });

  it("does not accept server-only messages from a client", () => {
    expect(parseClientMessage(JSON.stringify({ type: "peer-joined" }))).toBeNull();
  });
});

describe("parseServerMessage", () => {
  it("accepts a joined message", () => {
    const message = parseServerMessage(
      JSON.stringify({ type: "joined", role: "host", peerPresent: false }),
    );
    expect(message).toEqual({ type: "joined", role: "host", peerPresent: false });
  });

  it.each(ERROR_CODES)("accepts the error code %s", (code) => {
    expect(parseServerMessage(JSON.stringify({ type: "error", code }))).toEqual({
      type: "error",
      code,
    });
  });

  it("rejects an unknown error code", () => {
    expect(
      parseServerMessage(JSON.stringify({ type: "error", code: "NOPE" })),
    ).toBeNull();
  });

  it("rejects an unknown role", () => {
    expect(
      parseServerMessage(
        JSON.stringify({ type: "joined", role: "admin", peerPresent: true }),
      ),
    ).toBeNull();
  });
});
