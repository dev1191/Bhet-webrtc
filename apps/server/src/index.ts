import fs from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { RoomDatabase } from "./db.js";

// Load .env if present
if (!process.env.GROQ_API_KEY) {
  if (fs.existsSync(".env")) {
    process.loadEnvFile(".env");
  } else if (fs.existsSync("../../.env")) {
    process.loadEnvFile("../../.env");
  }
}

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DB_PATH ?? "bhet.sqlite";
const db = new RoomDatabase(dbPath);

const { app, nodeWs } = createApp({ db });

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Bhet server listening on http://localhost:${info.port}`);
});

nodeWs.injectWebSocket(server);
