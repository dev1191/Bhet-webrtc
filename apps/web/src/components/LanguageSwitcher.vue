<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from "../i18n";

withDefaults(
  defineProps<{
    size?: "small" | "default" | "large";
  }>(),
  {
    size: "default",
  }
);

const { locale } = useI18n();

const currentLocale = computed({
  get: () => locale.value as SupportedLocale,
  set: (val: SupportedLocale) => {
    setLocale(val);
  },
});
</script>

<template>
  <div class="inline-flex items-center">
    <el-select
      v-model="currentLocale"
      :size="size"
      class="w-26 md:w-40"
      popper-class="locale-select-popper"
      aria-label="Select language"
    >
      <template #prefix>
        <span class="text-sm mr-1" aria-hidden="true">🌐</span>
      </template>
      <el-option
        v-for="item in SUPPORTED_LOCALES"
        :key="item.code"
        :label="item.label"
        :value="item.code"
      >
        <div class="flex items-center justify-between w-full">
          <span>{{ item.label }}</span>
          <el-tag v-if="item.beta" size="small" type="warning" effect="plain" class="text-[11px] px-1 h-4.5 leading-4">
            beta
          </el-tag>
        </div>
      </el-option>
    </el-select>
  </div>
</template>
