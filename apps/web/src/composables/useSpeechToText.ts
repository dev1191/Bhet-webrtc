import { computed, onUnmounted, ref } from "vue";

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionClass(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export interface UseSpeechToTextOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export function useSpeechToText() {
  const isSupported = computed(() => getSpeechRecognitionClass() !== null);
  const isListening = ref(false);
  const transcript = ref("");
  const interimTranscript = ref("");
  const error = ref<string | null>(null);

  let recognition: SpeechRecognitionInstance | null = null;
  let activeOptions: UseSpeechToTextOptions = {};
  let shouldKeepListening = false;
  let restartTimeout: ReturnType<typeof setTimeout> | null = null;

  async function logClient(level: "INFO" | "WARN" | "ERROR", tag: string, message: string, details?: unknown) {
    try {
      console[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log"](`[${tag}] ${message}`, details ?? "");
      fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, tag, message, details }),
      }).catch(() => {});
    } catch {
      // Ignore client log network error
    }
  }

  function start(options: UseSpeechToTextOptions = {}) {
    const SpeechClass = getSpeechRecognitionClass();
    if (!SpeechClass) {
      error.value = "SPEECH_NOT_SUPPORTED";
      logClient("ERROR", "STT", "SpeechRecognition is NOT supported in this browser. Use Chrome, Edge, or Safari.");
      options.onError?.("SPEECH_NOT_SUPPORTED");
      return;
    }

    if (restartTimeout) {
      clearTimeout(restartTimeout);
      restartTimeout = null;
    }

    if (recognition && isListening.value) {
      try {
        recognition.stop();
      } catch {
        // Ignore stop on active
      }
    }

    activeOptions = options;
    shouldKeepListening = true;
    error.value = null;

    try {
      recognition = new SpeechClass();
      recognition.continuous = options.continuous ?? false;
      recognition.interimResults = options.interimResults ?? true;
      recognition.lang = options.lang || "en-US";

      recognition.onstart = () => {
        isListening.value = true;
        logClient("INFO", "STT", `Listening started (lang: ${recognition?.lang || "unknown"})`);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let currentInterim = "";
        let finalChunk = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (!item) continue;
          const text = item[0]?.transcript || "";
          if (item.isFinal) {
            finalChunk += text;
          } else {
            currentInterim += text;
          }
        }

        if (finalChunk) {
          transcript.value = transcript.value ? `${transcript.value} ${finalChunk.trim()}` : finalChunk.trim();
          interimTranscript.value = "";
          logClient("INFO", "STT", `Final speech result: "${finalChunk.trim()}"`);
          activeOptions.onResult?.(finalChunk.trim(), true);
        } else if (currentInterim) {
          interimTranscript.value = currentInterim;
          activeOptions.onResult?.(currentInterim, false);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // "no-speech" is normal when user is quiet
        if (event.error !== "no-speech") {
          error.value = event.error;
          logClient("ERROR", "STT", `SpeechRecognition error: "${event.error}"`);
          activeOptions.onError?.(event.error);
        }
      };

      recognition.onend = () => {
        isListening.value = false;
        interimTranscript.value = "";
        activeOptions.onEnd?.();

        // Auto-restart continuous recognition if not explicitly stopped
        if (activeOptions.continuous && shouldKeepListening && error.value !== "not-allowed") {
          logClient("INFO", "STT", "SpeechRecognition paused by browser, restarting automatically...");
          restartTimeout = setTimeout(() => {
            if (shouldKeepListening) {
              try {
                recognition?.start();
              } catch {
                // If recreate needed
                start(activeOptions);
              }
            }
          }, 300);
        }
      };

      recognition.start();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "SPEECH_ERROR";
      logClient("ERROR", "STT", `Failed to start SpeechRecognition: ${error.value}`);
      isListening.value = false;
    }
  }

  function stop() {
    shouldKeepListening = false;
    if (restartTimeout) {
      clearTimeout(restartTimeout);
      restartTimeout = null;
    }
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Ignore
      }
    }
    isListening.value = false;
    interimTranscript.value = "";
    logClient("INFO", "STT", "SpeechRecognition stopped by user.");
  }

  function reset() {
    transcript.value = "";
    interimTranscript.value = "";
    error.value = null;
  }

  onUnmounted(() => {
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        // Ignore
      }
      recognition = null;
    }
  });

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  };
}
