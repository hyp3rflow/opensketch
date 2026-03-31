// i18n — UI localization system
// Supports en, ko, ja with localStorage persistence

export type Locale = "en" | "ko" | "ja";

const STORAGE_KEY = "opensketch-locale";

let currentLocale: Locale = (localStorage.getItem(STORAGE_KEY) as Locale) || "en";
let translations: Record<string, Record<string, string>> = {};
const listeners: Array<(locale: Locale) => void> = [];

// Flat key lookup: t("layers.title") → translations[locale]["layers.title"]
export function t(key: string, params?: Record<string, string | number>): string {
  const val = translations[currentLocale]?.[key] ?? translations["en"]?.[key] ?? key;
  if (!params) return val;
  return val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

export function getLocale(): Locale { return currentLocale; }

export function setLocale(locale: Locale) {
  currentLocale = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  listeners.forEach(fn => fn(locale));
}

export function onLocaleChange(fn: (locale: Locale) => void) {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

export function registerTranslations(locale: string, data: Record<string, string>) {
  translations[locale] = { ...(translations[locale] || {}), ...data };
}

// Load all built-in locales
async function loadBuiltinLocales() {
  const modules: Record<string, Record<string, string>> = {
    en: (await import("../locales/en.json")).default,
    ko: (await import("../locales/ko.json")).default,
    ja: (await import("../locales/ja.json")).default,
  };
  for (const [locale, data] of Object.entries(modules)) {
    registerTranslations(locale, data);
  }
}

let initPromise: Promise<void> | null = null;
export function initI18n(): Promise<void> {
  if (!initPromise) initPromise = loadBuiltinLocales();
  return initPromise;
}

// Language display names
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ko: "한국어",
  ja: "日本語",
};

// Language picker UI — returns a container element
export function createLanguagePicker(onChange?: () => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "i18n-lang-picker";
  wrapper.style.cssText = "display:flex;gap:4px;align-items:center;";

  const select = document.createElement("select");
  select.style.cssText = "padding:4px 8px;background:#2a2a2a;border:1px solid #444;border-radius:6px;color:#ccc;font-size:11px;cursor:pointer;outline:none;";

  for (const [code, name] of Object.entries(LOCALE_NAMES)) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    if (code === currentLocale) opt.selected = true;
    select.appendChild(opt);
  }

  select.addEventListener("change", () => {
    setLocale(select.value as Locale);
    onChange?.();
  });

  onLocaleChange((loc) => { select.value = loc; });

  const icon = document.createElement("span");
  icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
  icon.style.cssText = "opacity:0.6;display:flex;align-items:center;";

  wrapper.appendChild(icon);
  wrapper.appendChild(select);
  return wrapper;
}
