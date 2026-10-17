<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import HomeView from "./views/HomeView.vue";
import RoomView from "./views/RoomView.vue";

const currentPath = ref(window.location.pathname);
const currentSearch = ref(window.location.search);

function updateRoute() {
  currentPath.value = window.location.pathname;
  currentSearch.value = window.location.search;
}

onMounted(() => {
  window.addEventListener("popstate", updateRoute);
});

const searchParams = computed(() => new URLSearchParams(currentSearch.value));

const isRoomView = computed(() => currentPath.value.startsWith("/room/"));
const roomId = computed(() => {
  const match = currentPath.value.match(/^\/room\/([^/?#]+)/);
  return match ? match[1]! : "";
});
const token = computed(() => searchParams.value.get("token") ?? "");

function navigateTo(url: string) {
  window.history.pushState({}, "", url);
  updateRoute();
}

function handleLeave() {
  navigateTo("/");
}
</script>

<template>
  <RoomView
    v-if="isRoomView && token"
    :room-id="roomId"
    :token="token"
    @leave="handleLeave"
  />
  <HomeView
    v-else
    @navigate="navigateTo"
  />
</template>

<style>
:root {
  color-scheme: dark;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
  -webkit-text-size-adjust: 100%;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: #07090e;
  background-image:
    radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.12) 0%, transparent 50%),
    radial-gradient(circle at 100% 100%, rgba(99, 102, 241, 0.08) 0%, transparent 40%);
  color: #f9fafb;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4, .brand-title, .hero-title {
  font-family: "Outfit", "Inter", -apple-system, sans-serif;
  letter-spacing: -0.02em;
}

/* Custom modern scrollbars */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 9999px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* Devanagari (Nepali & Hindi) Font */
html.font-devanagari,
html.font-devanagari body,
html.font-devanagari button,
html.font-devanagari input,
html.font-devanagari select,
html.font-devanagari textarea {
  font-family: "Noto Sans Devanagari", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* Japanese Font & Word Breaking */
html.font-japanese,
html.font-japanese body,
html.font-japanese button,
html.font-japanese input,
html.font-japanese select,
html.font-japanese textarea {
  font-family: "Noto Sans JP", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", "Meiryo", sans-serif;
  word-break: break-word;
  line-break: strict;
}
</style>
