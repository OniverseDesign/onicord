import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  getLanguageResources,
  isLanguageSupported,
  loadLanguageBundle,
} from "./languages";

const getInitialLanguage = () => {
  const saved = localStorage.getItem("onicord_language");
  if (saved && isLanguageSupported(saved)) return saved;
  const browserLang =
    typeof navigator !== "undefined"
      ? navigator.language || navigator.userLanguage || "en"
      : "en";
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

const ensureActiveLanguageLoaded = async (lng) => {
  if (!lng || !isLanguageSupported(lng)) return;
  if (i18n.hasResourceBundle(lng, "translation")) return;
  const bundle = await loadLanguageBundle(lng);
  if (bundle) {
    i18n.addResourceBundle(lng, "translation", bundle, true, true);
    if (i18n.language === lng) {
      i18n.emit("loaded", { [lng]: { translation: true } });
      await i18n.changeLanguage(lng);
    }
  }
};

if (savedLanguage !== "es") {
  ensureActiveLanguageLoaded(savedLanguage);
}

i18n.on("languageChanged", (lng) => {
  ensureActiveLanguageLoaded(lng);
});

export default i18n;
