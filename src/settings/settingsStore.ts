import { useSyncExternalStore } from 'react';
export interface Settings {
  language: 'system' | 'en' | 'ko' | 'ja';
  theme: 'system' | 'light' | 'dark';
  fontSize: number;
  editorFont: string;
  proseFont: string;
  wordWrap: boolean;
}
const defaults: Settings = {
  language: 'system',
  theme: 'system',
  fontSize: 15,
  editorFont: 'D2Coding, Consolas, monospace',
  proseFont: 'system-ui, "Segoe UI", "Malgun Gothic", sans-serif',
  wordWrap: true,
};
function load(): Settings {
  try {
    const data = JSON.parse(localStorage.getItem('markraft.settings') || '{}');
    return {
      language: ['en', 'ko', 'ja'].includes(data.language) ? data.language : 'system',
      theme: ['light', 'dark', 'system'].includes(data.theme) ? data.theme : defaults.theme,
      fontSize: Number.isFinite(data.fontSize)
        ? Math.max(10, Math.min(32, data.fontSize))
        : defaults.fontSize,
      editorFont: typeof data.editorFont === 'string' ? data.editorFont : defaults.editorFont,
      proseFont: typeof data.proseFont === 'string' ? data.proseFont : defaults.proseFont,
      wordWrap: typeof data.wordWrap === 'boolean' ? data.wordWrap : true,
    };
  } catch {
    return defaults;
  }
}
let value = load();
const listeners = new Set<() => void>();
export const getSettings = () => value;
export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setSettings(patch: Partial<Settings>) {
  value = { ...value, ...patch };
  localStorage.setItem('markraft.settings', JSON.stringify(value));
  listeners.forEach((fn) => fn());
}
export function useSettings() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => value,
  );
}
