import { useSyncExternalStore } from 'react';
import { fileType, normalize, type FileType } from '../files/fileTypes';
import type { DocumentFile } from '../files/fileService';
export interface EditorTab {
  id: string;
  path: string | null;
  name: string;
  fileType: FileType;
  text: string;
  savedText: string;
  dirty: boolean;
  encoding: DocumentFile['encoding'];
  lineEnding: DocumentFile['lineEnding'];
  revision: string | null;
  mode: 'rich' | 'raw';
  conflict: string | null;
  line: number;
  column: number;
}
let state: { tabs: EditorTab[]; active: string | null } = { tabs: [], active: null };
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((fn) => fn());
}
export const tabs = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  select(id: string) {
    state = { ...state, active: id };
    emit();
  },
  patch(id: string, patch: Partial<EditorTab>) {
    state = {
      ...state,
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
    };
    emit();
  },
  edit(id: string, text: string) {
    const tab = state.tabs.find((t) => t.id === id);
    if (tab && tab.text !== text) this.patch(id, { text, dirty: text !== tab.savedText });
  },
  new(type: FileType = 'text') {
    const id = crypto.randomUUID();
    state = {
      tabs: [
        ...state.tabs,
        {
          id,
          path: null,
          name: `Untitled.${type === 'markdown' ? 'md' : 'txt'}`,
          fileType: type,
          text: '',
          savedText: '',
          dirty: false,
          encoding: 'UTF-8',
          lineEnding: 'CRLF',
          revision: null,
          mode: 'rich',
          conflict: null,
          line: 1,
          column: 1,
        },
      ],
      active: id,
    };
    emit();
  },
  open(doc: DocumentFile) {
    const found = state.tabs.find((t) => t.path === doc.path);
    if (found) {
      this.select(found.id);
      return;
    }
    const id = crypto.randomUUID();
    const text = normalize(doc.text);
    state = {
      tabs: [
        ...state.tabs,
        {
          ...doc,
          id,
          fileType: fileType(doc.name),
          text,
          savedText: text,
          dirty: false,
          mode: 'rich',
          conflict: null,
          line: 1,
          column: 1,
        },
      ],
      active: id,
    };
    emit();
  },
  reload(id: string, doc: DocumentFile) {
    const text = normalize(doc.text);
    this.patch(id, { ...doc, text, savedText: text, dirty: false, conflict: null });
  },
  saved(id: string, doc: DocumentFile, submitted: string) {
    const current = state.tabs.find((t) => t.id === id);
    if (!current) return;
    this.patch(id, {
      path: doc.path,
      name: doc.name,
      fileType: fileType(doc.name),
      encoding: doc.encoding,
      lineEnding: doc.lineEnding,
      revision: doc.revision,
      savedText: submitted,
      dirty: current.text !== submitted,
      conflict: null,
    });
  },
  close(id: string) {
    const index = state.tabs.findIndex((t) => t.id === id);
    const remaining = state.tabs.filter((t) => t.id !== id);
    state = {
      tabs: remaining,
      active:
        state.active === id
          ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? null)
          : state.active,
    };
    emit();
  },
};
export function useTabs() {
  return useSyncExternalStore(tabs.subscribe, tabs.get);
}
