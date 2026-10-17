import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import hi from "./locales/hi.json";
import ja from "./locales/ja.json";
import ne from "./locales/ne.json";
import pt from "./locales/pt.json";

export const SUPPORTED_LOCALES = [
  { code: "en", label: "English", beta: false },
  { code: "ne", label: "नेपाली (Nepali)", beta: false },
  { code: "hi", label: "हिन्दी (Hindi)", beta: false },
  { code: "es", label: "Español", beta: false },
  { code: "fr", label: "Français", beta: false },
  { code: "pt", label: "Português", beta: false },
  { code: "ja", label: "日本語 (Japanese)", beta: false },
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]["code"];

const LOCALE_CODES = SUPPORTED_LOCALES.map((l) => l.code);

/**
 * Resolves the user's initial locale in priority order:
 * 1. ?lang= query param
 * 2. localStorage.getItem("bhet_lang")
 * 3. navigator.language
 * 4. "en" fallback
 */
export function resolveInitialLocale(): SupportedLocale {
  if (typeof window !== "undefined") {
    // 1. ?lang= query parameter
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get("lang")?.toLowerCase();
      if (urlLang && LOCALE_CODES.includes(urlLang as SupportedLocale)) {
        return urlLang as SupportedLocale;
      }
    } catch {
      // Ignore URL parsing errors
    }

    // 2. localStorage
    try {
      const saved = localStorage.getItem("bhet_lang")?.toLowerCase();
      if (saved && LOCALE_CODES.includes(saved as SupportedLocale)) {
        return saved as SupportedLocale;
      }
    } catch {
      // localStorage may be disabled/restricted
    }

    // 3. navigator.language
    try {
      const navLang = navigator.language.split("-")[0]?.toLowerCase();
      if (navLang && LOCALE_CODES.includes(navLang as SupportedLocale)) {
        return navLang as SupportedLocale;
      }
    } catch {
      // Ignore navigator errors
    }
  }

  // 4. Default fallback
  return "en";
}

/**
 * Dynamic font loading:
 * Loads Noto Sans Devanagari only when 'ne' or 'hi' is active.
 * Loads Noto Sans JP only when 'ja' is active.
 * Applies appropriate CSS font-family class to documentElement.
 */
export function loadLocaleFonts(locale: string): void {
  if (typeof document === "undefined") return;

  // Set html lang and dir attribute (logical layout)
  document.documentElement.lang = locale;
  document.documentElement.setAttribute("dir", "ltr");

  // Devanagari (Nepali & Hindi)
  if (locale === "ne" || locale === "hi") {
    if (!document.getElementById("font-noto-devanagari")) {
      const link = document.createElement("link");
      link.id = "font-noto-devanagari";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
    document.documentElement.classList.add("font-devanagari");
    document.documentElement.classList.remove("font-japanese");
  } else if (locale === "ja") {
    // Japanese
    if (!document.getElementById("font-noto-jp")) {
      const link = document.createElement("link");
      link.id = "font-noto-jp";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap";
      document.head.appendChild(link);
    }
    document.documentElement.classList.add("font-japanese");
    document.documentElement.classList.remove("font-devanagari");
  } else {
    document.documentElement.classList.remove("font-devanagari", "font-japanese");
  }
}

const initialLocale = resolveInitialLocale();
loadLocaleFonts(initialLocale);

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: "en",
  messages: {
    en,
    ne,
    hi,
    es,
    fr,
    pt,
    ja,
  },
});

/**
 * Switch active locale without interrupting video call
 */
export function setLocale(locale: SupportedLocale): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (i18n.global.locale as any).value = locale;
  loadLocaleFonts(locale);

  try {
    localStorage.setItem("bhet_lang", locale);
  } catch {
    // Ignore storage errors
  }
}
