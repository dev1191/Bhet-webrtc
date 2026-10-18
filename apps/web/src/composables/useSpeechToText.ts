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

function getSupportedMimeType(): string {
  if (typeof window === "undefined" || !window.MediaRecorder) return "";
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export interface SpeechResultMeta {
  language?: string;
  translated?: string;
}

export interface UseSpeechToTextOptions {
  lang?: string;
  targetLang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  provider?: "whisper" | "native";
  onResult?: (text: string, isFinal: boolean, meta?: SpeechResultMeta) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export function useSpeechToText() {
  const isSupported = computed(() => {
    if (typeof window === "undefined") return false;
    const hasMediaRecorder = !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;
    return hasMediaRecorder || getSpeechRecognitionClass() !== null;
  });

  const isListening = ref(false);
  const transcript = ref("");
  const interimTranscript = ref("");
  const error = ref<string | null>(null);

  // Whisper MediaRecorder state
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let sliceTimer: ReturnType<typeof setTimeout> | null = null;
  let activeOptions: UseSpeechToTextOptions = {};
  let shouldKeepListening = false;
  let whisperFailCount = 0;

  // Native SpeechRecognition state (fallback)
  let nativeRecognition: SpeechRecognitionInstance | null = null;
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

  function stopWhisperRecording() {
    if (sliceTimer) {
      clearTimeout(sliceTimer);
      sliceTimer = null;
    }
    if (mediaRecorder && mediaRecorder.state === "recording") {
      try {
        mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorder = null;
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
  }

  async function sendAudioSlice(blob: Blob, options: UseSpeechToTextOptions) {
    if (blob.size < 1500) return; // Ignore very small silence buffers

    try {
      const formData = new FormData();
      formData.append("file", blob, "audio.webm");
      if (options.targetLang) {
        formData.append("targetLang", options.targetLang);
      }

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        whisperFailCount++;
        logClient("WARN", "STT", `Transcribe returned status ${res.status} (failure ${whisperFailCount}/2)`);
        if (whisperFailCount >= 2 && getSpeechRecognitionClass()) {
          logClient("INFO", "STT", "Falling back from Whisper to native browser SpeechRecognition");
          stopWhisperRecording();
          startNativeRecognition(activeOptions);
        }
        return;
      }

      whisperFailCount = 0;

      const data = (await res.json()) as {
        text?: string;
        language?: string;
        translated?: string;
      };

      const cleanText = (data.text || "").trim();
      if (cleanText) {
        transcript.value = transcript.value ? `${transcript.value} ${cleanText}` : cleanText;
        interimTranscript.value = "";
        options.onResult?.(cleanText, true, {
          language: data.language,
          translated: data.translated,
        });
      }
    } catch (err) {
      whisperFailCount++;
      logClient("ERROR", "STT", "Failed to send audio for transcription", err);
      if (whisperFailCount >= 2 && getSpeechRecognitionClass()) {
        logClient("INFO", "STT", "Falling back from Whisper to native browser SpeechRecognition");
        stopWhisperRecording();
        startNativeRecognition(activeOptions);
      }
    }
  }

  function startSliceCycle() {
    if (!shouldKeepListening || !mediaRecorder) return;
    recordedChunks = [];

    try {
      if (mediaRecorder.state !== "recording") {
        mediaRecorder.start();
      }
    } catch {
      return;
    }

    if (activeOptions.continuous) {
      sliceTimer = setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 3500);
    }
  }

  async function startWhisperRecording(options: UseSpeechToTextOptions) {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeType = getSupportedMimeType();
      mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (recordedChunks.length > 0) {
          const blob = new Blob(recordedChunks, {
            type: mediaRecorder?.mimeType || "audio/webm",
          });
          recordedChunks = [];
          void sendAudioSlice(blob, activeOptions);
        }

        if (shouldKeepListening && activeOptions.continuous) {
          startSliceCycle();
        } else if (!shouldKeepListening) {
          isListening.value = false;
          activeOptions.onEnd?.();
        }
      };

      isListening.value = true;
      startSliceCycle();
    } catch (err) {
      const isDenied =
        err instanceof Error &&
        (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
      error.value = isDenied ? "not-allowed" : "SPEECH_ERROR";
      options.onError?.(error.value);
      isListening.value = false;
    }
  }

  function startNativeRecognition(options: UseSpeechToTextOptions) {
    const SpeechClass = getSpeechRecognitionClass();
    if (!SpeechClass) {
      error.value = "SPEECH_NOT_SUPPORTED";
      options.onError?.("SPEECH_NOT_SUPPORTED");
      return;
    }

    try {
      nativeRecognition = new SpeechClass();
      nativeRecognition.continuous = options.continuous ?? false;
      nativeRecognition.interimResults = options.interimResults ?? true;
      nativeRecognition.lang = options.lang || "en-US";

      nativeRecognition.onstart = () => {
        isListening.value = true;
      };

      nativeRecognition.onresult = (event: SpeechRecognitionEvent) => {
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
          activeOptions.onResult?.(finalChunk.trim(), true);
        } else if (currentInterim) {
          interimTranscript.value = currentInterim;
          activeOptions.onResult?.(currentInterim, false);
        }
      };

      nativeRecognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== "no-speech") {
          error.value = event.error;
          activeOptions.onError?.(event.error);
        }
      };

      nativeRecognition.onend = () => {
        isListening.value = false;
        interimTranscript.value = "";
        activeOptions.onEnd?.();

        if (activeOptions.continuous && shouldKeepListening && error.value !== "not-allowed") {
          restartTimeout = setTimeout(() => {
            if (shouldKeepListening) {
              try {
                nativeRecognition?.start();
              } catch {
                startNativeRecognition(activeOptions);
              }
            }
          }, 300);
        }
      };

      nativeRecognition.start();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "SPEECH_ERROR";
      options.onError?.(error.value);
      isListening.value = false;
    }
  }

  function start(options: UseSpeechToTextOptions = {}) {
    stop();
    activeOptions = options;
    shouldKeepListening = true;
    error.value = null;

    // Use Whisper by default unless explicitly set to "native"
    const useNative = options.provider === "native";
    if (!useNative && typeof window !== "undefined" && window.MediaRecorder && navigator.mediaDevices?.getUserMedia) {
      void startWhisperRecording(options);
    } else {
      startNativeRecognition(options);
    }
  }

  function stop() {
    shouldKeepListening = false;
    stopWhisperRecording();

    if (restartTimeout) {
      clearTimeout(restartTimeout);
      restartTimeout = null;
    }

    if (nativeRecognition) {
      try {
        nativeRecognition.stop();
      } catch {
        // ignore
      }
      nativeRecognition = null;
    }

    isListening.value = false;
    interimTranscript.value = "";
  }

  function reset() {
    transcript.value = "";
    interimTranscript.value = "";
    error.value = null;
  }

  onUnmounted(() => {
    stop();
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
