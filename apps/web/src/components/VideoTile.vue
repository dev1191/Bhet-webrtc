<script setup lang="ts">
import { ref, watchEffect } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  stream: MediaStream | null;
  muted?: boolean;
  label: string;
  isCameraOff?: boolean;
}>();

const { t } = useI18n();

const videoRef = ref<HTMLVideoElement | null>(null);

watchEffect(() => {
  if (videoRef.value) {
    videoRef.value.srcObject = props.stream;
  }
});
</script>

<template>
  <div class="relative w-full h-full bg-[radial-gradient(circle_at_center,#1e293b_0%,#090d16_100%)] rounded-2.5xl overflow-hidden flex items-center justify-center shadow-2xl border border-white/8 transition-all duration-300">
    <video
      ref="videoRef"
      autoplay
      playsinline
      :muted="muted"
      class="w-full h-full object-cover scale-x-100"
      :class="{ hidden: isCameraOff || !stream }"
    />

    <div v-if="isCameraOff || !stream" class="flex flex-col items-center gap-3.5">
      <div class="w-21 h-21 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white text-3xl font-bold flex items-center justify-center shadow-[0_0_35px_rgba(99,102,241,0.4)] border-3 border-white/15 animate-pulse">
        <span>{{ label.charAt(0).toUpperCase() }}</span>
      </div>
      <p class="text-slate-400 text-sm font-medium tracking-wide m-0">
        {{ isCameraOff ? t('room.cameraOff') : t('room.noVideoFeed') }}
      </p>
    </div>

    <div class="absolute bottom-3.5 left-3.5 bg-slate-900/75 backdrop-blur-md text-slate-50 text-xs px-3 py-1 rounded-full font-semibold border border-white/12 shadow-lg">
      <span>{{ label }}</span>
    </div>
  </div>
</template>
