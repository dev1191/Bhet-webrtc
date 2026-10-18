import { logger } from "./logger.js";

export interface TranscriptionResult {
  text: string;
  language: string;
  duration?: number;
  error?: string;
}

const COMMON_HALLUCINATIONS = new Set([
  "thank you.",
  "thank you",
  "thanks for watching.",
  "thanks for watching",
  "subtitles by",
  "bye.",
  "bye",
  "you",
  ".",
]);

export async function transcribeAudio(
  audioBlob: Blob,
  fileName = "audio.webm"
): Promise<TranscriptionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    logger.warn("Transcribe", "GROQ_API_KEY is not set in environment");
    return { text: "", language: "", error: "MISSING_API_KEY" };
  }

  const startTime = Date.now();
  const formData = new FormData();
  formData.append("file", audioBlob, fileName);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "verbose_json");
  formData.append("temperature", "0");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.error("Transcribe", `Groq API returned ${res.status}: ${errText}`);
      return { text: "", language: "", error: `GROQ_${res.status}` };
    }

    const data = (await res.json()) as {
      text?: string;
      language?: string;
      duration?: number;
      segments?: Array<{ no_speech_prob?: number }>;
    };

    const rawText = (data.text || "").trim();
    const language = (data.language || "").trim();
    const noSpeechProb = data.segments?.[0]?.no_speech_prob ?? 0;

    // Filter out silence or empty Whisper hallucinations
    if (!rawText || noSpeechProb > 0.65 || COMMON_HALLUCINATIONS.has(rawText.toLowerCase())) {
      return { text: "", language };
    }

    logger.info("Transcribe", `Transcribed in ${Date.now() - startTime}ms [${language}]: "${rawText}"`);
    return {
      text: rawText,
      language,
      duration: data.duration,
    };
  } catch (err) {
    logger.error("Transcribe", "Transcription error", { error: String(err) });
    return { text: "", language: "" };
  }
}
