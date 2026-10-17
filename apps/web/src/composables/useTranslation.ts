const clientCache = new Map<string, string>();

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
    if (cached) return cached;

    try {
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
        const data = (await res.json()) as { translated?: string };
        if (typeof data.translated === "string") {
          clientCache.set(cacheKey, data.translated);
          return data.translated;
        }
      }
    } catch (err) {
      console.warn("Client translation fetch failed:", err);
    }

    return trimmed;
  }

  return {
    translate,
  };
}
