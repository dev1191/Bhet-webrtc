<script setup lang="ts">
import { ref, watchEffect } from "vue";
import { useI18n } from "vue-i18n";

const props = withDefaults(
  defineProps<{
    stream: MediaStream | null;
    muted?: boolean;
    label: string;
    isCameraOff?: boolean;
    isAudioMuted?: boolean;
    mirrored?: boolean;
  }>(),
  {
    muted: false,
    isCameraOff: false,
    isAudioMuted: false,
    mirrored: false,
  }
);

const { t } = useI18n();

const videoRef = ref<HTMLVideoElement | null>(null);

watchEffect(() => {
  if (videoRef.value) {
    videoRef.value.srcObject = props.stream;
  }
});
</script>

<template>
  <div class="relative w-full h-full bg-[radial-gradient(ellipse_at_center,#1e293b_0%,#090d16_100%)] rounded-2.5xl sm:rounded-3xl overflow-hidden flex items-center justify-center shadow-2xl border border-white/10 transition-all duration-300 group">
    <!-- Active Video Element -->
    <video
      ref="videoRef"
      autoplay
      playsinline
      :muted="muted"
      class="w-full h-full object-cover transition-transform duration-300"
      :class="[
        mirrored ? '-scale-x-100' : 'scale-x-100',
        { hidden: isCameraOff || !stream }
      ]"
    />

    <!-- Camera Off / Avatar Placeholder -->
    <div v-if="isCameraOff || !stream" class="flex flex-col items-center gap-3 select-none p-4 text-center">
      <div class="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-indigo-600 via-blue-600 to-sky-400 text-white text-3xl sm:text-4xl font-bold flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.35)] border-3 border-white/20">
        <span>{{ label.charAt(0).toUpperCase() }}</span>
        <!-- Mic mute status indicator on avatar -->
        <span
          v-if="isAudioMuted"
          class="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-rose-600 border-2 border-slate-900 text-white flex items-center justify-center shadow-md"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2" />
          </svg>
        </span>
      </div>
      <p class="text-slate-300 text-xs sm:text-sm font-semibold tracking-wide m-0 drop-shadow">
        {{ isCameraOff ? t('room.cameraOff') : t('room.noVideoFeed') }}
      </p>
    </div>

    <!-- Bottom Left Participant & Audio Status Badge -->
    <div class="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-10 flex items-center gap-1.5 bg-slate-950/70 backdrop-blur-xl px-2.5 py-1 sm:px-3 sm:py-1 rounded-full text-xs font-semibold text-slate-100 border border-white/12 shadow-lg select-none">
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
      <span class="truncate max-w-[120px] sm:max-w-[160px]">{{ label }}</span>
      <span v-if="isAudioMuted" class="text-rose-400 pl-0.5" title="Muted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-3.5 h-3.5">
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2" />
        </svg>
      </span>
    </div>
  </div>
</template>
