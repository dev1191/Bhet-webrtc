<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import ChatPanel from "../components/ChatPanel.vue";
import ControlsBar from "../components/ControlsBar.vue";
import LanguageSwitcher from "../components/LanguageSwitcher.vue";
import QualityBadge from "../components/QualityBadge.vue";
import VideoTile from "../components/VideoTile.vue";
import { useWebRTC } from "../composables/useWebRTC";

const props = defineProps<{
  roomId: string;
  token: string;
}>();

const emit = defineEmits<{
  (e: "leave"): void;
}>();

const { t } = useI18n();

const isValidating = ref(true);
const validationErrorCode = ref<string | null>(null);

const isChatOpen = ref(false);
const unreadCount = ref(0);
const copiedInvite = ref(false);
const guestToken = ref<string | null>(null);
const notificationToast = ref<{ id: number; text: string; sender: string } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const {
  status,
  role,
  peerPresent,
  errorMessage,
  errorCode,
  isMuted,
  isCameraOff,
  isAudioOnly,
  localStream,
  remoteStream,
  chatMessages,
  isChatReady,
  quality,
  qualityMetrics,
  start,
  toggleAudio,
  toggleVideo,
  toggleAudioOnly,
  sendChatMessage,
  leave,
} = useWebRTC({
  token: props.token,
  roomId: props.roomId,
});

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === "suspended") {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Chime tone 1 (D5 - 587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.28);

    // Chime tone 2 (A5 - 880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.09);
    gain2.gain.setValueAtTime(0.24, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.42);
  } catch {
    // Audio autoplay restrictions or not supported
  }
}

function playJoinSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.18);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // Audio autoplay restrictions or not supported
  }
}

function showNotificationToast(sender: string, text: string) {
  if (toastTimer) clearTimeout(toastTimer);
  notificationToast.value = { id: Date.now(), sender, text };
  toastTimer = setTimeout(() => {
    notificationToast.value = null;
  }, 4500);
}

watch(
  () => chatMessages.value.length,
  () => {
    if (chatMessages.value.length > 0) {
      const last = chatMessages.value[chatMessages.value.length - 1];
      if (last?.sender === "peer") {
        if (!isChatOpen.value) {
          unreadCount.value++;
          showNotificationToast(last.sender, last.text);
        }
        playNotificationSound();
      }
    }
  }
);

watch(
  () => peerPresent.value,
  (present, prev) => {
    if (present && !prev) {
      playJoinSound();
    }
  }
);

watch(
  () => unreadCount.value,
  (count) => {
    if (count > 0) {
      document.title = `(${count}) 💬 Bhet`;
    } else {
      document.title = "Bhet — Secure P2P Video";
    }
  }
);

watch(isChatOpen, (open) => {
  if (open) {
    unreadCount.value = 0;
    notificationToast.value = null;
  }
});

onMounted(async () => {
  try {
    const res = await fetch(`/api/rooms/${props.roomId}/validate?token=${encodeURIComponent(props.token)}`);
    const data = await res.json();

    if (!res.ok || !data.valid) {
      validationErrorCode.value = data.code ?? "INVALID_TOKEN";
      isValidating.value = false;
      return;
    }

    if (data.guestToken) {
      guestToken.value = data.guestToken;
    }

    // Fetch ICE servers
    let iceServers: RTCIceServer[] = [];
    try {
      const iceRes = await fetch(`/api/ice-servers?token=${encodeURIComponent(props.token)}`);
      if (iceRes.ok) {
        const iceData = await iceRes.json();
        if (Array.isArray(iceData.iceServers)) {
          iceServers = iceData.iceServers;
        }
      }
    } catch {
      // Fallback to default STUN
    }

    isValidating.value = false;
    await start(iceServers);
  } catch {
    validationErrorCode.value = "DISCONNECTED";
    isValidating.value = false;
  }

  window.addEventListener("click", unlockAudio, { passive: true });
  window.addEventListener("touchstart", unlockAudio, { passive: true });
});

function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

onUnmounted(() => {
  window.removeEventListener("click", unlockAudio);
  window.removeEventListener("touchstart", unlockAudio);
  if (toastTimer) clearTimeout(toastTimer);
  document.title = "Bhet — Secure P2P Video";
  if (sharedAudioCtx && sharedAudioCtx.state !== "closed") {
    sharedAudioCtx.close().catch(() => {});
  }
});

const displayValidationError = computed(() => {
  if (!validationErrorCode.value) return "";
  return t(`errors.${validationErrorCode.value}`, t("errors.UNKNOWN"));
});

const displayCallError = computed(() => {
  if (errorCode.value) {
    return t(`errors.${errorCode.value}`, errorMessage.value ?? t("errors.UNKNOWN"));
  }
  return errorMessage.value ?? t("errors.UNKNOWN");
});

const guestShareUrl = computed(() => {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  if (guestToken.value) {
    return `${origin}/room/${props.roomId}?token=${guestToken.value}`;
  }
  return window.location.href;
});

function copyInviteLink() {
  const url = guestShareUrl.value;
  navigator.clipboard?.writeText(url);
  copiedInvite.value = true;
  setTimeout(() => {
    copiedInvite.value = false;
  }, 2500);
}

function shareViaWhatsApp() {
  const text = encodeURIComponent(`Join my secure video room on Bhet: ${guestShareUrl.value}`);
  window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
}

function handleLeave() {
  leave();
  emit("leave");
}
</script>

<template>
  <div class="flex flex-col h-[100dvh] w-full max-w-full bg-slate-950 text-slate-50 overflow-hidden relative font-sans">
    <!-- Floating Notification Toast -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="transform -translate-y-6 opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform -translate-y-6 opacity-0"
    >
      <div
        v-if="notificationToast && !isChatOpen"
        class="absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-sm w-[90%] sm:w-auto px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-indigo-500/40 backdrop-blur-xl shadow-2xl flex items-center gap-3 cursor-pointer hover:bg-slate-800/95 transition-all"
        @click="isChatOpen = true; notificationToast = null"
      >
        <div class="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div class="flex-1 min-w-0 pr-1">
          <p class="text-xs font-semibold text-indigo-300">New message</p>
          <p class="text-xs text-slate-200 truncate">{{ notificationToast.text }}</p>
        </div>
        <span class="text-[10px] text-slate-400 font-medium shrink-0">Tap to open</span>
      </div>
    </Transition>

    <!-- Header -->
    <header class="flex items-center justify-between p-2 sm:px-4 md:px-6 py-2.5 bg-slate-900/70 backdrop-blur-xl border-b border-white/8 z-10 gap-2 shrink-0">
      <div class="flex items-center gap-2 sm:gap-3 shrink-0">
        <!-- Brand Badge -->
        <div class="flex items-center gap-1.5">
          <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="w-3.5 h-3.5">
              <path d="M15 10l5-5v14l-5-5" />
              <rect x="2" y="5" width="13" height="14" rx="3" />
            </svg>
          </div>
          <span class="font-display text-sm sm:text-base font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
            Bhet <span class="hidden sm:inline text-xs text-blue-400 font-normal">भेट</span>
          </span>
        </div>

        <!-- Room ID Pill -->
        <button
          type="button"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800/80 border border-white/12 text-slate-200 text-xs hover:bg-slate-700/90 transition-all cursor-pointer"
          :title="copiedInvite ? 'Copied guest invite link!' : 'Click to copy guest invite link'"
          @click="copyInviteLink"
        >
          <span class="text-indigo-400 font-bold">#</span>
          <span class="font-mono font-medium">{{ roomId }}</span>
          <span class="ml-1 text-xs" :class="copiedInvite ? 'text-emerald-400 font-bold' : 'text-slate-400'">
            {{ copiedInvite ? '✓' : '⧉' }}
          </span>
        </button>
      </div>

      <div class="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <!-- Quality Badge -->
        <QualityBadge
          v-if="status === 'connected'"
          :quality="quality"
          :metrics="qualityMetrics"
        />

        <!-- Role Badge -->
        <span
          v-if="role"
          class="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          :class="role === 'host' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'"
        >
          {{ role === 'host' ? t('room.host') : t('room.guest') }}
        </span>

        <!-- Status Indicator -->
        <div class="flex items-center gap-1.5 bg-slate-800/60 border border-white/8 px-2.5 py-1 rounded-full text-xs">
          <span
            class="w-2 h-2 rounded-full shrink-0"
            :class="{
              'bg-emerald-500 shadow-[0_0_8px_#10b981]': status === 'connected',
              'bg-amber-500 shadow-[0_0_8px_#f59e0b]': status === 'waiting-for-peer',
              'bg-indigo-500 shadow-[0_0_8px_#6366f1]': status === 'connecting-signaling',
              'bg-red-500 shadow-[0_0_8px_#ef4444]': status === 'error' || status === 'peer-left'
            }"
          />
          <span class="hidden md:inline text-xs text-slate-300">
            {{
              status === 'connected'
                ? t('room.connected')
                : status === 'waiting-for-peer'
                ? t('room.waitingForPeer')
                : status === 'connecting-signaling'
                ? t('room.connecting')
                : status === 'peer-left'
                ? t('room.peerLeft')
                : status === 'error'
                ? t('room.error')
                : isValidating
                ? t('room.checkingRoom')
                : status
            }}
          </span>
        </div>

        <!-- Language Switcher -->
        <LanguageSwitcher size="small" />
      </div>
    </header>

    <!-- Validating Pre-call State -->
    <div v-if="isValidating" class="flex-1 flex items-center justify-center p-4">
      <div class="w-full max-w-sm p-8 rounded-3xl bg-slate-900/80 backdrop-blur-2xl border border-white/10 shadow-2xl text-center flex flex-col items-center">
        <div class="w-12 h-12 border-3 border-white/10 border-t-indigo-500 rounded-full animate-spin mb-4" />
        <h3 class="m-0 text-base font-bold text-slate-100">{{ t('room.checkingRoom') }}</h3>
        <p class="m-0 mt-2 text-xs text-slate-400">{{ t('room.verifying') }}</p>
      </div>
    </div>

    <!-- Pre-call Validation Error -->
    <div v-else-if="validationErrorCode" class="flex-1 flex items-center justify-center p-4">
      <div class="w-full max-w-sm p-8 rounded-3xl bg-slate-900/80 backdrop-blur-2xl border border-white/10 shadow-2xl text-center flex flex-col items-center">
        <div class="w-12 h-12 rounded-full bg-red-500/15 border-2 border-red-500/50 text-red-400 text-xl font-bold flex items-center justify-center mb-4">✕</div>
        <h3 class="m-0 text-base font-bold text-slate-100">{{ t('room.unableToJoin') }}</h3>
        <p class="m-0 mt-2 text-xs text-slate-400">{{ displayValidationError }}</p>
        <el-button type="primary" class="mt-6 rounded-full font-semibold" @click="handleLeave">
          {{ t('room.returnHome') }}
        </el-button>
      </div>
    </div>

    <!-- Active Call Error State -->
    <div v-else-if="status === 'error'" class="flex-1 flex items-center justify-center p-4">
      <div class="w-full max-w-sm p-8 rounded-3xl bg-slate-900/80 backdrop-blur-2xl border border-white/10 shadow-2xl text-center flex flex-col items-center">
        <div class="w-12 h-12 rounded-full bg-red-500/15 border-2 border-red-500/50 text-red-400 text-xl font-bold flex items-center justify-center mb-4">!</div>
        <h3 class="m-0 text-base font-bold text-slate-100">{{ t('room.callError') }}</h3>
        <p class="m-0 mt-2 text-xs text-slate-400">{{ displayCallError }}</p>
        <el-button type="primary" class="mt-6 rounded-full font-semibold" @click="handleLeave">
          {{ t('room.returnHome') }}
        </el-button>
      </div>
    </div>

    <!-- Active Call Viewport -->
    <main v-else class="flex-1 relative flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <!-- Remote Peer View (Edge to Edge Cinema) -->
      <div v-if="peerPresent && remoteStream" class="w-full h-full max-w-7xl max-h-[calc(100vh-140px)] relative">
        <VideoTile
          :stream="remoteStream"
          :label="t('room.peer')"
        />
      </div>

      <!-- Waiting State View with Quick-Share Invite Card -->
      <div v-else class="flex-1 flex flex-col items-center justify-start w-full h-full z-5 overflow-y-auto p-4 pb-28">
        <div class="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-slate-900/80 backdrop-blur-2xl border border-white/10 shadow-2xl text-center flex flex-col items-center">
          <!-- Radar Animation -->
          <div class="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center mb-4">
            <div class="absolute w-full h-full rounded-full border-2 border-indigo-500/40 animate-ping" />
            <div class="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/50">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </div>
          </div>

          <h3 class="m-0 mb-1.5 font-display text-lg sm:text-xl font-bold text-slate-100">
            {{ t('room.waitingForPeer') }}
          </h3>
          <p class="m-0 mb-5 text-xs sm:text-sm text-slate-400 leading-relaxed">
            Share this instant invite link with your peer to start the direct video call.
          </p>

          <div class="flex flex-col sm:flex-row items-center gap-2.5 w-full">
            <button
              type="button"
              class="w-full flex-1 flex items-center justify-between bg-slate-800/80 hover:bg-slate-700/90 border border-white/12 px-3.5 py-2 rounded-full text-slate-200 text-xs transition-all cursor-pointer"
              @click="copyInviteLink"
            >
              <span class="font-mono font-semibold text-indigo-300 truncate mr-2">{{ roomId }}</span>
              <span class="font-semibold text-sky-400 text-xs shrink-0">
                {{ copiedInvite ? '✓ Copied' : 'Copy link' }}
              </span>
            </button>
            <button
              type="button"
              class="w-full sm:w-auto bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-400 font-semibold text-xs px-3.5 py-2 rounded-full cursor-pointer transition-all whitespace-nowrap"
              @click="shareViaWhatsApp"
            >
              💬 WhatsApp
            </button>
          </div>
        </div>

        <!-- Solo Video Preview in Waiting View -->
        <div class="w-full max-w-md h-50 sm:h-64 mt-4 rounded-2.5xl overflow-hidden shadow-2xl border border-white/10">
          <VideoTile
            :stream="localStream"
            :muted="true"
            :label="t('room.you')"
            :is-camera-off="isCameraOff"
          />
        </div>
      </div>

      <!-- Local Video (Picture-in-Picture when peer is present) -->
      <div
        v-if="peerPresent && remoteStream"
        class="absolute bottom-[max(84px,calc(env(safe-area-inset-bottom,16px)+68px))] right-3 sm:right-6 w-26 h-38 sm:w-55 sm:h-35 z-20 rounded-2xl border-2 border-white/25 shadow-2xl transition-all duration-300 hover:scale-104 hover:border-indigo-400 overflow-hidden"
      >
        <VideoTile
          :stream="localStream"
          :muted="true"
          :label="t('room.you')"
          :is-camera-off="isCameraOff"
        />
      </div>
    </main>

    <!-- Slide-over Chat Panel with isChatReady -->
    <ChatPanel
      :messages="chatMessages"
      :is-open="isChatOpen"
      :is-ready="isChatReady"
      @close="isChatOpen = false"
      @send-message="sendChatMessage"
    />

    <!-- Floating Bottom Controls -->
    <footer v-if="!isValidating && !validationErrorCode" class="absolute bottom-[max(16px,env(safe-area-inset-bottom,16px))] left-0 right-0 flex justify-center z-30 pointer-events-none px-4">
      <ControlsBar
        class="pointer-events-auto"
        :is-muted="isMuted"
        :is-camera-off="isCameraOff"
        :is-audio-only="isAudioOnly"
        :is-chat-open="isChatOpen"
        :unread-count="unreadCount"
        @toggle-audio="toggleAudio"
        @toggle-video="toggleVideo"
        @toggle-audio-only="toggleAudioOnly"
        @toggle-chat="isChatOpen = !isChatOpen"
        @leave="handleLeave"
      />
    </footer>
  </div>
</template>
