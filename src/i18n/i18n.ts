import { useSyncExternalStore } from 'react';
import { getSettings, subscribeSettings } from '../settings/settingsStore';
import { messages, resolveLocale, translate } from './messages';

export const getLocale = () =>
  resolveLocale(
    getSettings().language,
    navigator.languages?.length ? navigator.languages : [navigator.language],
  );
export const t = (key: string, values?: Record<string, string | number>) =>
  translate(getLocale(), key, values);
export function subscribeLocale(listener: () => void) {
  let previous = getLocale();
  const changed = () => {
    const next = getLocale();
    if (next !== previous) {
      previous = next;
      listener();
    }
  };
  const off = subscribeSettings(changed);
  window.addEventListener('languagechange', changed);
  return () => {
    off();
    window.removeEventListener('languagechange', changed);
  };
}
export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale);
  return { locale, t };
}
export function editorPhrases() {
  return Object.fromEntries(Object.keys(messages).map((key) => [key, t(key)]));
}
export function errorText(error: unknown): string {
  const text = String(error);
  return text.startsWith('Error: ') ? t(text.slice(7)) : t(text);
}
