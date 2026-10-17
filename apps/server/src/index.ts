import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { RoomDatabase } from "./db.js";

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DB_PATH ?? "bhet.sqlite";
const db = new RoomDatabase(dbPath);

const { app, nodeWs } = createApp({ db });

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Bhet server listening on http://localhost:${info.port}`);
});

nodeWs.injectWebSocket(server);
