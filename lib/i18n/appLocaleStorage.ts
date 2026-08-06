import { detectDeviceI18nLocale, isI18nLocale, type I18nLocale } from "@/lib/i18n/locales";
import { updateUserSettingsPreferences } from "@/lib/settingsPreferences";

/** Dedicated key so first-open auto-detect is distinct from default settings fallback. */
export const APP_LOCALE_STORAGE_KEY = "spotdrop_i18n_locale";

const SETTINGS_STORAGE_KEY = "spotdrop_user_settings";

export function readStoredAppLocale(): I18nLocale | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const dedicated = window.localStorage.getItem(APP_LOCALE_STORAGE_KEY);
    if (isI18nLocale(dedicated)) {
      return dedicated;
    }

    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { language?: unknown };
    if (typeof parsed.language === "string" && isI18nLocale(parsed.language)) {
      // Legacy: settings existed before dedicated locale key — treat as resolved.
      return parsed.language;
    }
  } catch {
    return null;
  }

  return null;
}

export function writeStoredAppLocale(locale: I18nLocale) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore quota / private mode
  }

  updateUserSettingsPreferences({ language: locale });
}

/**
 * Guest / pre-auth locale:
 * 1) previously stored locale (manual or auto)
 * 2) device/browser language
 * 3) en
 *
 * When persistIfMissing is true, first-open detection is written to localStorage.
 */
export function resolveGuestAppLocale(options?: { persistIfMissing?: boolean }): I18nLocale {
  const stored = readStoredAppLocale();
  if (stored) {
    return stored;
  }

  const detected = detectDeviceI18nLocale();

  if (options?.persistIfMissing !== false && typeof window !== "undefined") {
    writeStoredAppLocale(detected);
  }

  return detected;
}

/**
 * Synchronous head script: resolve locale before first paint, persist on first open,
 * set html[lang]/data-locale], and hide body until React applies the same locale.
 * Keep detection rules in sync with detectDeviceI18nLocale().
 */
export const LOCALE_BOOTSTRAP_SCRIPT = `(function(){try{var KEY="spotdrop_i18n_locale";var SETTINGS="spotdrop_user_settings";var locale=null;try{var dedicated=localStorage.getItem(KEY);if(dedicated==="en"||dedicated==="ru"||dedicated==="de"){locale=dedicated;}}catch(e){}if(!locale){try{var raw=localStorage.getItem(SETTINGS);if(raw){var parsed=JSON.parse(raw);if(parsed&&(parsed.language==="en"||parsed.language==="ru"||parsed.language==="de")){locale=parsed.language;}}}catch(e){}}if(!locale){var candidates=[];try{if(navigator.languages&&navigator.languages.length){for(var i=0;i<navigator.languages.length;i++){candidates.push(navigator.languages[i]);}}else if(navigator.language){candidates.push(navigator.language);}}catch(e){}locale="en";for(var j=0;j<candidates.length;j++){var c=String(candidates[j]||"").trim().toLowerCase();if(!c)continue;if(c==="ru"||c.indexOf("ru-")===0){locale="ru";break;}if(c==="de"||c.indexOf("de-")===0){locale="de";break;}if(c==="en"||c.indexOf("en-")===0){locale="en";break;}}try{localStorage.setItem(KEY,locale);var settingsRaw=localStorage.getItem(SETTINGS);var settings={};if(settingsRaw){try{settings=JSON.parse(settingsRaw)||{};}catch(e){settings={};}}settings.language=locale;localStorage.setItem(SETTINGS,JSON.stringify(settings));}catch(e){}}var root=document.documentElement;root.lang=locale;root.dataset.locale=locale;if(locale!=="en"){root.dataset.i18nPending="1";}window.setTimeout(function(){try{delete root.dataset.i18nPending;root.dataset.i18nReady="1";}catch(e){}},2500);}catch(e){}})();`;
