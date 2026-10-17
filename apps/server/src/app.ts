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
