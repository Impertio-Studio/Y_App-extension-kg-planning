/**
 * Standalone i18n setup. Inside Y-app the extension used Y-app's shared
 * i18next instance; in standalone mode we spin up our own, reading the
 * current language from the `?lang=` query param Y-app attaches when
 * loading the iframe (defaults to Dutch — the primary user base).
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import nl from "./nl.json";
import en from "./en.json";

function detectLang(): string {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("lang");
  if (q && (q === "nl" || q === "en")) return q;
  const nav = navigator.language?.toLowerCase() || "";
  if (nav.startsWith("en")) return "en";
  return "nl";
}

void i18n.use(initReactI18next).init({
  resources: {
    nl: { translation: nl },
    en: { translation: en },
  },
  lng: detectLang(),
  fallbackLng: "nl",
  interpolation: { escapeValue: false },
  keySeparator: false,
  nsSeparator: false,
});

export default i18n;
