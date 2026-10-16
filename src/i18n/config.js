import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLanguageResources, isLanguageSupported } from "./languages";

const getInitialLanguage = () => {
  const saved = localStorage.getItem("onicord_language");
  if (saved && isLanguageSupported(saved)) return saved;
  const browserLang = typeof navigator !== "undefined" ? (navigator.language || navigator.userLanguage || "en") : "en";
  const langCode = browserLang.split("-")[0].toLowerCase();
  return isLanguageSupported(langCode) ? langCode : "es";
};

const savedLanguage = getInitialLanguage();

i18n.use(initReactI18next).init({
  resources: getLanguageResources(),
  lng: savedLanguage,
  fallbackLng: "es",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
