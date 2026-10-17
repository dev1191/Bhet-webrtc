const clientCache = new Map<string, string>();

async function logClient(level: "INFO" | "WARN" | "ERROR", tag: string, message: string, details?: unknown) {
  try {
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, tag, message, details }),
    }).catch(() => {});
  } catch {
    // Ignore
  }
}

export function useTranslation() {
  async function translate(
    text: string,
    targetLang = "en",
    sourceLang = "auto"
  ): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return "";

    const cacheKey = `${sourceLang}:${targetLang}:${trimmed}`;
    const cached = clientCache.get(cacheKey);
    if (cached) {
      logClient("INFO", "Translate", `Client cache hit: "${trimmed}" -> "${cached}"`);
      return cached;
    }

    try {
      logClient("INFO", "Translate", `Translating "${trimmed}" (${sourceLang} -> ${targetLang})`);
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          targetLang,
          sourceLang,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { translated?: string; sourceLang?: string };
        if (typeof data.translated === "string") {
          clientCache.set(cacheKey, data.translated);
          logClient("INFO", "Translate", `Received translation: "${trimmed}" -> "${data.translated}" (source: ${data.sourceLang || "unknown"})`);
          return data.translated;
        }
      } else {
        logClient("WARN", "Translate", `Translate endpoint returned HTTP ${res.status}`);
      }
    } catch (err) {
      logClient("ERROR", "Translate", `Translate fetch failed: ${String(err)}`);
      console.warn("Client translation fetch failed:", err);
    }

    return trimmed;
  }

  return {
    translate,
  };
}
