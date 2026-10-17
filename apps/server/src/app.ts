import fs from "node:fs";
import path from "node:path";
import { PROTOCOL_VERSION } from "@bhet/shared";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { RoomController } from "./controllers/room.controller.js";
import { RoomModel } from "./models/room.model.js";
import { RoomService } from "./room-service.js";
import { createRoomRoutes } from "./routes/room.routes.js";
import { SignalingHub, type TokenResolver } from "./signaling.js";
import { createDbTokenResolver } from "./utils/token-resolver.js";
import { logger } from "./utils/logger.js";
import { translateText } from "./utils/translate.js";

export { createDbTokenResolver };

export interface AppOptions {
  db?: RoomModel;
  roomService?: RoomService;
  tokenResolver?: TokenResolver;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono();
  const nodeWs = createNodeWebSocket({ app });

  // Model & Service
  const db = options.db ?? new RoomModel(":memory:");
  const roomService = options.roomService ?? new RoomService(db);
  const tokenResolver = options.tokenResolver ?? createDbTokenResolver(db);
  const hub = new SignalingHub(tokenResolver);

  // Controller
  const roomController = new RoomController(roomService, tokenResolver);

  // Global Middleware
  app.use("*", cors());

  // Health
  app.get("/health", (c) => c.json({ status: "ok", protocol: PROTOCOL_VERSION }));

  // REST API (MVC Routes)
  app.route("/api", createRoomRoutes(roomController));
  app.get("/api/ice-servers", roomController.getIceServers);

  // Debug Logs (View/Download bhet.log)
  app.get("/api/logs", (c) => {
    const limit = Number.parseInt(c.req.query("limit") || "100", 10);
    const logs = logger.readRecentLogs(limit);
    if (c.req.query("download") === "1") {
      c.header("Content-Disposition", 'attachment; filename="bhet.log"');
    }
    return c.text(logs);
  });

  // Client-to-Server Log Ingestion (for browser STT / WebRTC diagnostics)
  app.post("/api/logs", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const level = body?.level === "ERROR" ? "ERROR" : body?.level === "WARN" ? "WARN" : "INFO";
      const tag = typeof body?.tag === "string" ? body.tag.slice(0, 30) : "Client";
      const message = typeof body?.message === "string" ? body.message : "Empty log message";
      logger[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "info"](
        `Client:${tag}`,
        message,
        body?.details
      );
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 400);
    }
  });

  // Free Live Speech Translation
  app.post("/api/translate", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      if (!text) {
        return c.json({ error: "Text is required" }, 400);
      }
      const targetLang = typeof body?.targetLang === "string" ? body.targetLang.slice(0, 5) : "en";
      const sourceLang = typeof body?.sourceLang === "string" ? body.sourceLang.slice(0, 5) : "auto";
      const result = await translateText(text, targetLang, sourceLang);
      return c.json(result);
    } catch (err) {
      logger.error("HTTP", "POST /api/translate unhandled error", { error: String(err) });
      return c.json({ error: "Translation failed" }, 500);
    }
  });

  // WebSocket Signaling
  app.get(
    "/ws",
    nodeWs.upgradeWebSocket((c) => {
      const token = c.req.query("token");

      return {
        onOpen(_event, ws) {
          hub.handleConnection(ws, token);
        },
        onMessage(event, ws) {
          if (typeof event.data === "string") {
            hub.handleMessage(ws, event.data);
          }
        },
        onClose(_event, ws) {
          hub.handleDisconnect(ws);
        },
      };
    })
  );

  // Serve Vue 3 frontend in production
  const possibleStaticDirs = [
    path.resolve(process.cwd(), "apps/web/dist"),
    path.resolve(process.cwd(), "../web/dist"),
    path.resolve(process.cwd(), "../../apps/web/dist"),
  ];
  const staticDir = possibleStaticDirs.find((d) => fs.existsSync(path.join(d, "index.html")));

  if (staticDir) {
    const relativeRoot = path.relative(process.cwd(), staticDir).replace(/\\/g, "/") || ".";
    app.use("/*", serveStatic({ root: relativeRoot }));
    app.get("*", (c) => {
      const html = fs.readFileSync(path.join(staticDir, "index.html"), "utf-8");
      return c.html(html);
    });
  }

  return { app, nodeWs, hub, db, roomService, roomController, tokenResolver };
}
