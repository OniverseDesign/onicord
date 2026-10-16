import es from "./locales/es.json";
import en from "./locales/en.json";

/**
 * Registry of languages supported by Onicord.
 * To add a new language:
 * 1. Add your translation file to src/i18n/locales/<code >.json
 * 2. Import it and add an entry to SUPPORTED_LANGUAGES below.
 */
export const SUPPORTED_LANGUAGES = [
  {
    code: "es",
    name: "Spanish",
    nativeName: "Espa\u00f1ol",
    translation: es,
  },
  {
    code: "en",
    name: "English",
    nativeName: "English",
    translation: en,
  },
];

/**
 * Converts SUPPORTED_LANGUAGES into i18next resource bundle format.
 */
export const getLanguageResources = () => {
  return SUPPORTED_LANGUAGES.reduce((acc, lang) => {
    acc[lang.code] = { translation: lang.translation };
    return acc;
  }, {});
};

/**
 * Checks if a language code is currently registered.
 */
export const isLanguageSupported = (code) => {
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === code);
};
