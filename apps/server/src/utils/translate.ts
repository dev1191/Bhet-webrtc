import { logger } from "./logger.js";

export interface TranslationResult {
  original: string;
  translated: string;
  sourceLang: string;
  targetLang: string;
}

const cache = new Map<string, TranslationResult>();
const MAX_CACHE_SIZE = 1000;

export async function translateText(
  text: string,
  targetLang = "en",
  sourceLang = "auto"
): Promise<TranslationResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { original: text, translated: text, sourceLang, targetLang };
  }

  const cacheKey = `${sourceLang}:${targetLang}:${trimmed}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info("Translate", `Cache hit: "${trimmed}" -> "${cached.translated}"`, {
      sourceLang: cached.sourceLang,
      targetLang: cached.targetLang,
    });
    return cached;
  }

  const startTime = Date.now();
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${encodeURIComponent(
      sourceLang
    )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(trimmed)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (res.ok) {
      const data = (await res.json()) as unknown;
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = (data[0] as Array<[string | undefined]>)
          .map((item) => (Array.isArray(item) ? item[0] ?? "" : ""))
          .join("");
        const detectedSource = typeof data[2] === "string" ? data[2] : sourceLang;
        const result: TranslationResult = {
          original: trimmed,
          translated: translated || trimmed,
          sourceLang: detectedSource,
          targetLang,
        };

        if (cache.size >= MAX_CACHE_SIZE) {
          const firstKey = cache.keys().next().value;
          if (firstKey) cache.delete(firstKey);
        }
        cache.set(cacheKey, result);

        logger.info(
          "Translate",
          `Success: "${trimmed}" -> "${result.translated}" in ${Date.now() - startTime}ms`,
          { detectedSource, targetLang }
        );

        return result;
      }
    } else {
      logger.warn("Translate", `API returned status ${res.status}: "${trimmed}"`);
    }
  } catch (err) {
    logger.error("Translate", `Error translating "${trimmed}"`, { error: String(err) });
  }

  // Graceful fallback: return original text
  return {
    original: trimmed,
    translated: trimmed,
    sourceLang,
    targetLang,
  };
}
