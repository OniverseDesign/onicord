import es from "./locales/es.json";

const LOCALE_LOADERS = {
  es: () => Promise.resolve({ default: es }),
  en: () => import("./locales/en.json"),
  pt: () => import("./locales/pt.json"),
};

const loadedTranslations = {
  es,
};

/**
 * Registry of languages supported by Onicord.
 * To add a new language:
 * 1. Add your translation file to src/i18n/locales/<code>.json
 * 2. Register its loader in LOCALE_LOADERS and add an entry to SUPPORTED_LANGUAGES below.
 */
export const SUPPORTED_LANGUAGES = [
  {
    code: "es",
    name: "Spanish",
    nativeName: "Espa\u00f1ol",
    get translation() {
      return loadedTranslations.es;
    },
  },
  {
    code: "en",
    name: "English",
    nativeName: "English",
    get translation() {
      return loadedTranslations.en || null;
    },
  },
  {
    code: "pt",
    name: "Portuguese",
    nativeName: "Portugu\u00eas",
    get translation() {
      return loadedTranslations.pt || null;
    },
  },
];

/**
 * Converts loaded languages into i18next resource bundle format.
 */
export const getLanguageResources = () => {
  return Object.entries(loadedTranslations).reduce((acc, [code, translation]) => {
    if (translation) {
      acc[code] = { translation };
    }
    return acc;
  }, {});
};

/**
 * Dynamically loads a language bundle on demand.
 */
export const loadLanguageBundle = async (code) => {
  if (!isLanguageSupported(code)) return null;
  if (loadedTranslations[code]) return loadedTranslations[code];
  const loader = LOCALE_LOADERS[code];
  if (!loader) return null;
  const mod = await loader();
  const data = mod?.default || mod;
  loadedTranslations[code] = data;
  return data;
};

/**
 * Checks if a language code is currently registered.
 */
export const isLanguageSupported = (code) => {
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === code);
};
