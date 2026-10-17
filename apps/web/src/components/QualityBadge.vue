<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { ConnectionQuality, QualityMetrics } from "../composables/useWebRTC";

const props = defineProps<{
  quality: ConnectionQuality;
  metrics: QualityMetrics;
}>();

const { t } = useI18n();

const label = computed(() => {
  switch (props.quality) {
    case "good":
      return t("quality.good");
    case "fair":
      return t("quality.fair");
    case "poor":
      return t("quality.poor");
    default:
      return t("quality.measuring");
  }
});

const tooltipContent = computed(() => {
  return `${t("quality.rtt")}: ${props.metrics.rttMs}ms | ${t("quality.loss")}: ${props.metrics.packetLossPct}% | ${t("quality.jitter")}: ${props.metrics.jitterMs}ms`;
});
</script>

<template>
  <el-tooltip :content="tooltipContent" placement="bottom" effect="dark">
    <div
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/70 backdrop-blur-md border border-white/8 text-xs font-medium text-slate-100 cursor-help transition-all"
    >
      <span
        class="w-2 h-2 rounded-full transition-all"
        :class="{
          'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]': quality === 'good',
          'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]': quality === 'fair',
          'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]': quality === 'poor',
          'bg-slate-400': quality === 'unknown',
        }"
      />
      <span class="text-slate-100">{{ label }}</span>
    </div>
  </el-tooltip>
</template>
