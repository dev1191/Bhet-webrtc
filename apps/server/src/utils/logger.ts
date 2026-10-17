import fs from "node:fs";
import path from "node:path";
import { pino } from "pino";
import pretty from "pino-pretty";

const LOG_DIR = process.env.LOG_DIR
  ? path.resolve(process.env.LOG_DIR)
  : path.resolve(process.cwd(), "logs");

const LOG_FILE = path.join(LOG_DIR, "bhet.log");

function ensureLogDir(): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("Failed to create log directory:", err);
  }
}

ensureLogDir();

// Formatted pretty stream for console output
const consoleStream = pretty({
  colorize: process.env.NODE_ENV !== "production",
  translateTime: "SYS:standard",
  ignore: "pid,hostname",
});

// Synchronous file destination for bhet.log (zero dropped logs on crash)
const fileStream = pino.destination({
  dest: LOG_FILE,
  sync: true,
  mkdir: true,
});

// Pino logger writing to both console and file
export const pinoLogger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
  },
  pino.multistream([
    { stream: consoleStream, level: "info" },
    { stream: fileStream, level: "info" },
  ])
);

export const logger = {
  pino: pinoLogger,

  info(tag: string, message: string, details?: unknown) {
    pinoLogger.info({ tag, details }, message);
  },

  warn(tag: string, message: string, details?: unknown) {
    pinoLogger.warn({ tag, details }, message);
  },

  error(tag: string, message: string, details?: unknown) {
    pinoLogger.error({ tag, details }, message);
  },

  getFilePath() {
    return LOG_FILE;
  },

  readRecentLogs(limit = 100): string {
    ensureLogDir();
    if (!fs.existsSync(LOG_FILE)) {
      return "No logs recorded yet.\n";
    }
    try {
      const content = fs.readFileSync(LOG_FILE, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      return lines.slice(-limit).join("\n") + "\n";
    } catch (err) {
      return `Error reading log file: ${String(err)}\n`;
    }
  },
};
