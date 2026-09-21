import { useSyncExternalStore } from 'react';
export interface Settings {
  theme: 'system' | 'light' | 'dark';
  fontSize: number;
  editorFont: string;
  wordWrap: boolean;
}
const defaults: Settings = {
  theme: 'system',
  fontSize: 15,
  editorFont: 'D2Coding, Consolas, monospace',
  wordWrap: true,
};
function load(): Settings {
  try {
    const data = JSON.parse(localStorage.getItem('markraft.settings') || '{}');
    return {
      theme: ['light', 'dark', 'system'].includes(data.theme) ? data.theme : defaults.theme,
      fontSize: Number.isFinite(data.fontSize)
        ? Math.max(10, Math.min(32, data.fontSize))
        : defaults.fontSize,
      editorFont: typeof data.editorFont === 'string' ? data.editorFont : defaults.editorFont,
      wordWrap: typeof data.wordWrap === 'boolean' ? data.wordWrap : true,
    };
  } catch {
    return defaults;
  }
}
let value = load();
const listeners = new Set<() => void>();
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
