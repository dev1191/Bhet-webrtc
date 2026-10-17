import { presetWind4 } from "@unocss/preset-wind4";
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  transformerDirectives,
  transformerVariantGroup,
} from "unocss";

export default defineConfig({
  presets: [
    presetWind4(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  theme: {
    colors: {
      brand: {
        50: "#eef2ff",
        100: "#e0e7ff",
        500: "#6366f1",
        600: "#4f46e5",
        700: "#4338ca",
      },
    },
    fontFamily: {
      sans: "Inter, system-ui, sans-serif",
      display: "Outfit, system-ui, sans-serif",
    },
  },
  shortcuts: {
    "glass-panel": "bg-slate-900/80 backdrop-blur-2xl border border-white/10 shadow-2xl",
    "glass-pill": "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/70 border border-white/12 text-slate-200 text-xs transition-all hover:bg-slate-700/80 cursor-pointer",
    "controls-dock": "flex items-center justify-center gap-1.5 sm:gap-2 md:gap-3.5 px-2.5 sm:px-3 md:px-5 py-2 sm:py-2.5 rounded-full bg-slate-900/85 backdrop-blur-xl border border-white/12 shadow-2xl max-w-[calc(100vw-2rem)]",
    "control-btn": "relative flex items-center justify-center w-10.5 h-10.5 sm:w-11 sm:h-11 md:w-12.5 md:h-12.5 rounded-full border border-white/10 bg-slate-800/85 text-slate-100 hover:bg-slate-700/90 hover:-translate-y-0.75 hover:scale-104 active:scale-98 transition-all duration-200 shadow-md cursor-pointer shrink-0",
    "control-btn-active": "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-indigo-400/50 shadow-indigo-500/40 shadow-lg",
    "control-btn-off": "bg-gradient-to-br from-red-500 to-red-600 text-white border-red-400/40 shadow-red-500/35 shadow-lg",
    "control-btn-danger": "bg-gradient-to-br from-red-600 to-red-700 text-white border-red-500/60 hover:from-red-500 hover:to-red-600 hover:-translate-y-0.75 hover:scale-106 shadow-red-600/55 shadow-lg ml-1",
    "chat-badge": "w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/25 to-indigo-500/25 border border-blue-400/40 flex items-center justify-center text-blue-400",
  },
});
