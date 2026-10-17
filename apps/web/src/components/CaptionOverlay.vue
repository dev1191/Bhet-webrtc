<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { LiveCaption } from "../composables/useWebRTC";

defineProps<{
  caption: LiveCaption | null;
}>();

const { t } = useI18n();
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="transform translate-y-4 opacity-0 scale-95"
    enter-to-class="transform translate-y-0 opacity-100 scale-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="transform translate-y-0 opacity-100 scale-100"
    leave-to-class="transform translate-y-4 opacity-0 scale-95"
  >
    <div
      v-if="caption && caption.text"
      class="absolute bottom-[max(92px,calc(env(safe-area-inset-bottom,16px)+76px))] left-1/2 -translate-x-1/2 z-25 max-w-xl w-[92%] sm:w-auto px-4 py-2.5 rounded-2.5xl bg-slate-950/85 backdrop-blur-xl border border-white/15 shadow-2xl flex items-center gap-2.5 text-center pointer-events-none"
    >
      <!-- Speaker Tag -->
      <span
        class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider shrink-0"
        :class="caption.sender === 'you' ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-400/30' : 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/30'"
      >
        {{ caption.sender === 'you' ? t('room.you') : t('room.peer') }}
      </span>

      <!-- Subtitle Text -->
      <p class="m-0 text-xs sm:text-sm font-medium text-slate-100 leading-snug drop-shadow-sm truncate">
        <span>{{ caption.text }}</span>
        <span v-if="!caption.isFinal" class="inline-block text-indigo-400 animate-pulse ml-1 font-bold">...</span>
      </p>
    </div>
  </Transition>
</template>
