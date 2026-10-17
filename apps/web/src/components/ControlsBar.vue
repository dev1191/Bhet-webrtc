<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{
  isMuted: boolean;
  isCameraOff: boolean;
  isAudioOnly?: boolean;
  isCaptionsEnabled?: boolean;
  isSpeechSupported?: boolean;
  isChatOpen?: boolean;
  unreadCount?: number;
}>();

defineEmits<{
  (e: "toggleAudio"): void;
  (e: "toggleVideo"): void;
  (e: "toggleAudioOnly"): void;
  (e: "toggleCaptions"): void;
  (e: "toggleChat"): void;
  (e: "leave"): void;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="controls-dock flex items-center gap-2 sm:gap-2.5 p-2 sm:p-2.5 rounded-full bg-slate-900/85 backdrop-blur-2xl border border-white/12 shadow-2xl">
    <!-- Mic Toggle -->
    <el-tooltip :content="isMuted ? t('controls.unmute') : t('controls.mute')" placement="top" :show-after="200">
      <el-button
        circle
        size="large"
        :type="isMuted ? 'danger' : 'default'"
        class="!w-11 !h-11 sm:!w-12 sm:!h-12 !border !transition-all hover:scale-105"
        :class="isMuted ? '!bg-rose-500/20 !border-rose-500/40 !text-rose-400' : '!bg-slate-800/85 !border-white/15 !text-slate-100 hover:!bg-slate-700'"
        @click="$emit('toggleAudio')"
      >
        <svg v-if="!isMuted" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </el-button>
    </el-tooltip>

    <!-- Camera Toggle -->
    <el-tooltip :content="isCameraOff ? t('controls.cameraOn') : t('controls.cameraOff')" placement="top" :show-after="200">
      <el-button
        circle
        size="large"
        :type="isCameraOff ? 'danger' : 'default'"
        class="!w-11 !h-11 sm:!w-12 sm:!h-12 !border !transition-all hover:scale-105"
        :class="isCameraOff ? '!bg-rose-500/20 !border-rose-500/40 !text-rose-400' : '!bg-slate-800/85 !border-white/15 !text-slate-100 hover:!bg-slate-700'"
        @click="$emit('toggleVideo')"
      >
        <svg v-if="!isCameraOff" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
        <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1m5 0h6a2 2 0 0 1 2 2v3m4-4l-7 5 7 5V6z" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </el-button>
    </el-tooltip>

    <!-- Audio-Only Toggle -->
    <el-tooltip :content="isAudioOnly ? t('controls.audioOnlyOn') : t('controls.audioOnlyOff')" placement="top" :show-after="200">
      <el-button
        circle
        size="large"
        :type="isAudioOnly ? 'primary' : 'default'"
        class="!w-11 !h-11 sm:!w-12 sm:!h-12 !border !transition-all hover:scale-105"
        :class="isAudioOnly ? '!bg-indigo-600 !border-indigo-400/50 !text-white' : '!bg-slate-800/85 !border-white/15 !text-slate-100 hover:!bg-slate-700'"
        @click="$emit('toggleAudioOnly')"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
      </el-button>
    </el-tooltip>

    <!-- Closed Captions (Live Subtitles) Toggle -->
    <el-tooltip v-if="isSpeechSupported" :content="isCaptionsEnabled ? t('controls.captionsOff') : t('controls.captionsOn')" placement="top" :show-after="200">
      <el-button
        circle
        size="large"
        :type="isCaptionsEnabled ? 'primary' : 'default'"
        class="!w-11 !h-11 sm:!w-12 sm:!h-12 !border !transition-all hover:scale-105"
        :class="isCaptionsEnabled ? '!bg-indigo-600 !border-indigo-400/50 !text-white !shadow-lg !shadow-indigo-500/40' : '!bg-slate-800/85 !border-white/15 !text-slate-100 hover:!bg-slate-700'"
        @click="$emit('toggleCaptions')"
      >
        <span class="font-bold text-xs tracking-wider">CC</span>
      </el-button>
    </el-tooltip>

    <!-- Chat Toggle with Badge -->
    <el-tooltip :content="t('controls.toggleChat')" placement="top" :show-after="200">
      <el-badge :value="unreadCount || 0" :hidden="!unreadCount || unreadCount <= 0" class="shrink-0">
        <el-button
          circle
          size="large"
          :type="isChatOpen ? 'primary' : 'default'"
          class="!w-11 !h-11 sm:!w-12 sm:!h-12 !border !transition-all hover:scale-105"
          :class="isChatOpen ? '!bg-indigo-600 !border-indigo-400/50 !text-white' : '!bg-slate-800/85 !border-white/15 !text-slate-100 hover:!bg-slate-700'"
          @click="$emit('toggleChat')"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </el-button>
      </el-badge>
    </el-tooltip>

    <!-- Hang up / Leave -->
    <el-tooltip :content="t('controls.leaveCall')" placement="top" :show-after="200">
      <el-button
        circle
        size="large"
        type="danger"
        class="!w-11 !h-11 sm:!w-12 sm:!h-12 !bg-red-600 hover:!bg-red-500 !text-white !border-0 !shadow-lg !shadow-red-600/40 !transition-all hover:scale-105"
        @click="$emit('leave')"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
          <line x1="23" y1="1" x2="1" y2="23" />
        </svg>
      </el-button>
    </el-tooltip>
  </div>
</template>
