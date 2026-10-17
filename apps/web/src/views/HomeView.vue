<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import LanguageSwitcher from "../components/LanguageSwitcher.vue";

const emit = defineEmits<{
  (e: "navigate", url: string): void;
}>();

const { t } = useI18n();

const guestLang = ref<string>("");
const isCreating = ref(false);
const createError = ref<string | null>(null);
const createdRoom = ref<{ roomId: string; hostLink: string; guestLink: string } | null>(null);
const isCopied = ref(false);

const supportedLanguages = computed(() => [
  { code: "", label: t("home.guestLangPlaceholder") },
  { code: "en", label: t("languages.en") },
  { code: "ne", label: t("languages.ne") },
  { code: "hi", label: t("languages.hi") },
  { code: "es", label: t("languages.es") },
  { code: "fr", label: t("languages.fr") },
  { code: "pt", label: t("languages.pt") },
  { code: "ja", label: t("languages.ja") },
]);

async function handleCreateRoom() {
  isCreating.value = true;
  createError.value = null;
  try {
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestLang: guestLang.value || undefined,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create room: ${res.statusText}`);
    }

    const data = await res.json();
    createdRoom.value = data;
    ElMessage.success(t("home.roomReady"));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : t("errors.UNKNOWN");
    createError.value = msg;
    ElMessage.error(msg);
  } finally {
    isCreating.value = false;
  }
}

const origin = computed(() => (typeof window !== "undefined" ? window.location.origin : ""));
const guestFullUrl = computed(() => `${origin.value}${createdRoom.value?.guestLink ?? ""}`);

async function copyGuestLink() {
  if (guestFullUrl.value && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(guestFullUrl.value);
      isCopied.value = true;
      ElMessage.success(t("home.copied"));
      setTimeout(() => {
        isCopied.value = false;
      }, 2500);
    } catch {
      ElMessage.error(t("home.copyFailed"));
    }
  }
}

function shareViaWhatsApp() {
  if (guestFullUrl.value) {
    const text = encodeURIComponent(`Join my private video call on Bhet: ${guestFullUrl.value}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col relative overflow-hidden bg-slate-950 text-slate-50">
    <!-- Ambient Radial Background Glows -->
    <div class="absolute -top-36 left-1/10 w-120 h-120 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />
    <div class="absolute top-1/3 -right-24 w-140 h-140 rounded-full bg-indigo-500/12 blur-3xl pointer-events-none" />

    <!-- Top Navigation Bar -->
    <header class="relative z-10 flex items-center justify-between p-4 md:px-10 md:py-6 max-w-7xl mx-auto w-full">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
          <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="3" ry="3" />
          </svg>
        </div>
        <span class="text-xl md:text-2xl font-bold tracking-tight text-white font-display">
          {{ t('app.title') }}
          <span class="text-base md:text-lg font-semibold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent ml-1">
            {{ t('app.nepaliTitle') }}
          </span>
        </span>
      </div>

      <div class="flex items-center">
        <LanguageSwitcher size="default" />
      </div>
    </header>

    <!-- Hero Content -->
    <main class="relative z-10 flex-1 flex flex-col items-center text-center px-4 py-8 md:py-16 max-w-4xl mx-auto w-full">
      <!-- Feature Pill Tag -->
      <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/60 backdrop-blur-md border border-white/10 shadow-md mb-6 max-w-full">
        <span class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse shrink-0" />
        <span class="text-xs font-medium text-slate-300 truncate">1:1 Encrypted WebRTC • Self-Hosted TURN Relay</span>
      </div>

      <h1 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-4 text-white font-display">
        Instant, Private Video Calls
        <span class="block bg-gradient-to-r from-blue-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">
          Without Barriers
        </span>
      </h1>

      <p class="text-sm md:text-lg text-slate-400 max-w-xl mx-auto mb-8 leading-relaxed">
        {{ t('app.subtitle') }}
      </p>

      <!-- Glass Action Card -->
      <div class="w-full max-w-md bg-slate-900/80 backdrop-blur-2xl border border-white/12 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <!-- Room Creation Form -->
        <div v-if="!createdRoom" class="flex flex-col gap-5 text-left">
          <div class="flex flex-col gap-2">
            <label class="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              {{ t('home.guestLangLabel') }}
            </label>
            <el-select
              v-model="guestLang"
              :placeholder="t('home.guestLangPlaceholder')"
              class="w-full"
              size="large"
            >
              <el-option
                v-for="item in supportedLanguages"
                :key="item.code"
                :label="item.label"
                :value="item.code"
              />
            </el-select>
          </div>

          <button
            type="button"
            class="w-full h-12 rounded-xl border-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="isCreating"
            @click="handleCreateRoom"
          >
            <span v-if="!isCreating" class="flex items-center gap-2">
              <span>{{ t('home.createRoom') }}</span>
              <svg class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </span>
            <span v-else class="flex items-center gap-2">
              <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>{{ t('home.creatingRoom') }}</span>
            </span>
          </button>

          <el-alert
            v-if="createError"
            :title="createError"
            type="error"
            show-icon
            class="mt-2"
            :closable="false"
          />
        </div>

        <!-- Created Room Details -->
        <div v-else class="flex flex-col gap-4 text-left">
          <div class="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30">
            <span class="w-7 h-7 rounded-full bg-emerald-500 text-emerald-950 font-bold text-sm flex items-center justify-center shrink-0">✓</span>
            <div>
              <h4 class="m-0 text-sm font-semibold text-emerald-100">{{ t('home.roomReady') }}</h4>
              <p class="m-0 text-xs text-emerald-300">Room ID: <code class="bg-black/30 px-1.5 py-0.5 rounded font-mono">{{ createdRoom.roomId }}</code></p>
            </div>
          </div>

          <!-- Join as Host Action -->
          <div class="p-4 rounded-2xl bg-slate-800/60 border border-white/8 flex flex-col gap-2.5">
            <div>
              <span class="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30 mb-1">
                Host Access
              </span>
              <p class="m-0 text-xs text-slate-400">{{ t('home.hostLinkLabel') }}</p>
            </div>
            <button
              type="button"
              class="w-full h-11 rounded-xl border-0 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-emerald-600/30"
              @click="emit('navigate', createdRoom.hostLink)"
            >
              <span>{{ t('home.joinAsHost') }}</span>
            </button>
          </div>

          <!-- Share with Guest Link -->
          <div class="p-4 rounded-2xl bg-slate-800/60 border border-white/8 flex flex-col gap-2.5">
            <div>
              <span class="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30 mb-1">
                Share with Guest
              </span>
              <p class="m-0 text-xs text-slate-400">{{ t('home.guestLinkLabel') }}</p>
            </div>
            <div class="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                readonly
                :value="guestFullUrl"
                class="flex-1 h-10.5 bg-slate-950/80 border border-white/10 rounded-xl px-3 text-slate-200 text-xs font-mono outline-none"
                aria-label="Guest link"
              />
              <button
                type="button"
                class="h-10.5 px-4 rounded-xl border-0 font-semibold text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 shrink-0"
                :class="isCopied ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'"
                @click="copyGuestLink"
              >
                <span>{{ isCopied ? '✓ ' + t('home.copied') : '📋 ' + t('home.copy') }}</span>
              </button>
            </div>

            <!-- Quick WhatsApp share -->
            <button
              type="button"
              class="w-full h-10 rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 font-semibold text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
              @click="shareViaWhatsApp"
            >
              <span>💬 Share via WhatsApp</span>
            </button>
          </div>

          <button
            type="button"
            class="self-center bg-transparent border-0 text-slate-400 hover:text-white text-xs cursor-pointer py-1 transition-colors"
            @click="createdRoom = null"
          >
            {{ t('home.createAnother') }}
          </button>
        </div>
      </div>

      <!-- Feature Grid -->
      <section class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-12 w-full text-left">
        <div class="p-5 rounded-2xl bg-slate-900/50 backdrop-blur-md border border-white/6 hover:border-white/15 transition-all">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-3 bg-blue-500/15 text-blue-400">⚡</div>
          <h3 class="m-0 mb-1 text-sm font-bold text-slate-100">Direct P2P Media</h3>
          <p class="m-0 text-xs leading-relaxed text-slate-400">Low-latency media stream direct between peers via WebRTC with Perfect Negotiation.</p>
        </div>

        <div class="p-5 rounded-2xl bg-slate-900/50 backdrop-blur-md border border-white/6 hover:border-white/15 transition-all">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-3 bg-purple-500/15 text-purple-400">🔒</div>
          <h3 class="m-0 mb-1 text-sm font-bold text-slate-100">Encrypted Chat</h3>
          <p class="m-0 text-xs leading-relaxed text-slate-400">In-call text chat travels through an ordered RTCDataChannel without server storage.</p>
        </div>

        <div class="p-5 rounded-2xl bg-slate-900/50 backdrop-blur-md border border-white/6 hover:border-white/15 transition-all">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-3 bg-emerald-500/15 text-emerald-400">🔄</div>
          <h3 class="m-0 mb-1 text-sm font-bold text-slate-100">TURN Relay Fallback</h3>
          <p class="m-0 text-xs leading-relaxed text-slate-400">Coturn integration ensures connections succeed through strict firewalls and mobile NATs.</p>
        </div>

        <div class="p-5 rounded-2xl bg-slate-900/50 backdrop-blur-md border border-white/6 hover:border-white/15 transition-all">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-3 bg-amber-500/15 text-amber-400">🌐</div>
          <h3 class="m-0 mb-1 text-sm font-bold text-slate-100">7 Languages</h3>
          <p class="m-0 text-xs leading-relaxed text-slate-400">Localized with on-demand Devanagari and Japanese fonts and live in-call switching.</p>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="relative z-10 py-6 text-center border-t border-white/5 text-xs text-slate-500">
      <p class="m-0">Bhet (भेट) • Self-Hostable WebRTC Room</p>
    </footer>
  </div>
</template>
