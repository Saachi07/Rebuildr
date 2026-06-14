// Lightweight i18n scaffold. This is intentionally minimal: a typed dictionary,
// a t(key) lookup that falls back to the key itself, and language persistence
// in localStorage. Full app translation is not wired up here, only the
// foundation plus a small set of example strings (nav labels).

export type Language = "en" | "fr";

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Francais" },
];

// The set of translatable keys. Add keys here as strings get translated.
const DICTIONARY = {
  en: {
    "nav.plan": "Plan",
    "nav.inventory": "Inventory",
    "nav.documents": "Documents",
    "nav.getHelp": "Get help",
    "nav.dashboard": "Dashboard",
    "nav.settings": "Settings",
    "nav.prepare": "Prepare",
    "settings.title": "Settings",
    "settings.language": "Language",
    "prepare.title": "Get ready before anything happens",
  },
  fr: {
    "nav.plan": "Plan",
    "nav.inventory": "Inventaire",
    "nav.documents": "Documents",
    "nav.getHelp": "Obtenir de l'aide",
    "nav.dashboard": "Tableau de bord",
    "nav.settings": "Parametres",
    "nav.prepare": "Se preparer",
    "settings.title": "Parametres",
    "settings.language": "Langue",
    "prepare.title": "Preparez-vous avant que quoi que ce soit arrive",
  },
} as const;

export type TranslationKey = keyof (typeof DICTIONARY)["en"];

const STORAGE_KEY = "rebuildr.language";

let currentLanguage: Language = readStoredLanguage();

function isLanguage(value: string | null): value is Language {
  return value === "en" || value === "fr";
}

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    /* storage unavailable, fall through to default */
  }
  return "en";
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(lang: Language): void {
  currentLanguage = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* best-effort persistence */
  }
}

// Translate a key for the given language (defaults to the current language).
// Falls back to the key itself when no translation exists, so a missing
// string is visible and harmless rather than blank.
export function t(key: TranslationKey | string, lang: Language = currentLanguage): string {
  const table = DICTIONARY[lang] as Record<string, string>;
  if (table && key in table) return table[key];
  const english = DICTIONARY.en as Record<string, string>;
  if (key in english) return english[key];
  return key;
}
