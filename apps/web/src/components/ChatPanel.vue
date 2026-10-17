<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { ChatMessage } from "../composables/useWebRTC";
import { useSpeechToText } from "../composables/useSpeechToText";

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[];
    isOpen: boolean;
    isReady?: boolean;
  }>(),
  {
    isReady: false,
  }
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "sendMessage", text: string): void;
}>();

const { t, locale } = useI18n();

const inputText = ref("");
const messagesContainer = ref<HTMLDivElement | null>(null);

const { isSupported: isSpeechSupported, isListening, start: startSpeech, stop: stopSpeech } = useSpeechToText();

const speechLang = computed(() => {
  const map: Record<string, string> = {
    en: "en-US",
    ne: "ne-NP",
    hi: "hi-IN",
    es: "es-ES",
    fr: "fr-FR",
    pt: "pt-BR",
    ja: "ja-JP",
  };
  return map[locale.value] || "en-US";
});

function toggleVoiceInput() {
  if (isListening.value) {
    stopSpeech();
  } else {
    startSpeech({
      lang: speechLang.value,
      continuous: true,
      interimResults: true,
      onResult(text, isFinal) {
        if (isFinal) {
          inputText.value = inputText.value ? `${inputText.value} ${text}` : text;
        }
      },
    });
  }
}

const quickEmojis = ["👋", "👍", "❤️", "😂", "🎉", "🔥"];

function handleSend() {
  const text = inputText.value.trim();
  if (!text) return;
  if (isListening.value) stopSpeech();
  emit("sendMessage", text);
  inputText.value = "";
}

function sendEmoji(emoji: string) {
  emit("sendMessage", emoji);
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}

watch(() => props.messages.length, scrollToBottom);
watch(
  () => props.isOpen,
  (open) => {
    if (open) scrollToBottom();
    else if (isListening.value) stopSpeech();
  }
);

function formatTime(timestamp: number) {
  try {
    return new Intl.DateTimeFormat(locale.value, {
      hour: "numeric",
      minute: "numeric",
    }).format(new Date(timestamp));
  } catch {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}
</script>

<template>
  <aside
    class="fixed md:absolute top-0 md:top-4 right-0 md:right-4 bottom-0 md:bottom-22 w-full md:w-90 max-w-full md:max-w-[calc(100vw-2rem)] h-full md:h-auto bg-slate-950/92 md:bg-slate-900/85 backdrop-blur-2xl border-0 md:border md:border-white/12 md:rounded-2.5xl flex flex-col z-50 transition-transform duration-350 ease-out shadow-2xl overflow-hidden"
    :class="isOpen ? 'translate-x-0' : 'translate-x-[120%] pointer-events-none'"
  >
    <!-- Header -->
    <div class="flex items-center justify-between p-4.5 border-b border-white/8 bg-white/2">
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/30 to-indigo-500/30 border border-blue-400/40 flex items-center justify-center text-blue-400 shadow-sm">
          <svg class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div>
          <h3 class="m-0 text-sm font-bold text-slate-100">{{ t('chat.title') }}</h3>
          <div class="flex items-center gap-1.5 mt-0.5">
            <span
              class="w-1.5 h-1.5 rounded-full transition-all"
              :class="isReady ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-500'"
            />
            <span class="text-[11px] text-slate-400 font-medium">
              {{ isReady ? "P2P Direct Encrypted" : "Connecting Channel..." }}
            </span>
          </div>
        </div>
      </div>
      <button
        type="button"
        class="w-8 h-8 rounded-lg border-0 bg-white/5 hover:bg-white/12 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        aria-label="Close chat"
        @click="$emit('close')"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <!-- Messages Body -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
      <div v-if="messages.length === 0" class="m-auto text-center p-6 max-w-65">
        <div class="text-3.5xl mb-2.5 opacity-80">💬</div>
        <p class="text-sm font-semibold text-slate-300 m-0 mb-1.5">{{ t('chat.emptyState') }}</p>
        <p class="text-xs text-slate-500 leading-relaxed m-0">End-to-end encrypted directly between you and your peer. No server logs.</p>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="flex flex-col"
        :class="msg.sender === 'you' ? 'items-end' : 'items-start'"
      >
        <div
          class="max-w-[82%] px-3.5 py-2.5 rounded-2xl shadow-md border"
          :class="msg.sender === 'you' ? 'bg-gradient-to-br from-blue-600 to-indigo-700 border-indigo-400/40 text-white' : 'bg-slate-800/75 border-white/8 text-slate-100'"
        >
          <div class="text-[11px] text-white/65 font-semibold mb-0.5">
            {{ msg.sender === 'you' ? t('room.you') : t('room.peer') }}
          </div>
          <p class="m-0 mb-0.5 text-sm leading-relaxed text-slate-100 break-words [overflow-wrap:anywhere]">
            {{ msg.text }}
          </p>
          <span class="block text-[10px] text-white/45 text-right mt-0.5">
            {{ formatTime(msg.timestamp) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Quick Emoji Bar -->
    <div class="flex items-center justify-around px-3 py-1.5 bg-slate-900/50 border-t border-white/5">
      <button
        v-for="emoji in quickEmojis"
        :key="emoji"
        type="button"
        class="bg-transparent border-0 text-lg cursor-pointer p-1 rounded-md transition-all hover:scale-125 hover:bg-white/10"
        @click="sendEmoji(emoji)"
      >
        {{ emoji }}
      </button>
    </div>

    <!-- Chat Footer Composer -->
    <div class="p-3.5 bg-slate-950/95 border-t border-white/8">
      <form class="flex items-center gap-2" @submit.prevent="handleSend">
        <input
          v-model="inputText"
          type="text"
          :placeholder="isListening ? t('chat.listening') : t('chat.placeholder')"
          class="flex-1 h-10.5 bg-slate-800/60 border border-white/10 rounded-xl px-3.5 text-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-500"
          @keydown.enter.prevent="handleSend"
        />
        <!-- Speech-to-Text Voice Dictation -->
        <button
          v-if="isSpeechSupported"
          type="button"
          class="w-10.5 h-10.5 rounded-xl border flex items-center justify-center cursor-pointer transition-all shrink-0"
          :class="isListening ? 'bg-rose-500/25 text-rose-400 border-rose-500/40 shadow-lg shadow-rose-500/20 animate-pulse' : 'bg-slate-800/80 hover:bg-slate-700/90 text-slate-400 hover:text-white border-white/10'"
          :title="isListening ? t('chat.stopVoice') : t('chat.startVoice')"
          @click="toggleVoiceInput"
        >
          <svg class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </button>
        <button
          type="submit"
          class="w-10.5 h-10.5 rounded-xl border-0 bg-gradient-to-br from-blue-600 to-indigo-600 text-white cursor-pointer flex items-center justify-center shadow-lg shadow-blue-500/40 hover:not-disabled:-translate-y-0.5 hover:not-disabled:shadow-blue-500/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          :disabled="!inputText.trim()"
          aria-label="Send message"
        >
          <svg class="w-4.5 h-4.5 -ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  </aside>
</template>
