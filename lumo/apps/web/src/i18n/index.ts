import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import fr from './fr.json';

export type Locale = 'en' | 'fr';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('lumo.locale');
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {}
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: initialLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLocale(l: Locale) {
  void i18n.changeLanguage(l);
  document.documentElement.lang = l;
  try {
    localStorage.setItem('lumo.locale', l);
  } catch {}
}

document.documentElement.lang = i18n.language;
export default i18n;
