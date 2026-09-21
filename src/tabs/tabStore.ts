import { useSyncExternalStore } from 'react';
import { fileType, normalize, type FileType } from '../files/fileTypes';
import type { DocumentFile } from '../files/fileService';
export type Pane = 'primary' | 'secondary';
export interface EditorTab {
  id: string;
  pane: Pane;
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
  richError?: string;
  line: number;
  column: number;
}
interface TabState {
  tabs: EditorTab[];
  active: string | null;
  activePane: Pane;
  split: boolean;
  selected: Record<Pane, string | null>;
}
let state: TabState = {
  tabs: [],
  active: null,
  activePane: 'primary',
  split: false,
  selected: { primary: null, secondary: null },
};
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
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab || state.active === id) return;
    state = {
      ...state,
      active: id,
      activePane: tab.pane,
      selected: { ...state.selected, [tab.pane]: id },
    };
    emit();
  },
  focusPane(pane: Pane) {
    if ((pane === 'secondary' && !state.split) || state.activePane === pane) return;
    state = { ...state, activePane: pane, active: state.selected[pane] };
    emit();
  },
  move(id: string, pane: Pane, target: string | null = null, before = true) {
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab || (pane === 'secondary' && !state.split) || target === id) return;
    if (target && !state.tabs.some((t) => t.id === target && t.pane === pane)) return;
    const oldGroup = state.tabs.filter((t) => t.pane === tab.pane);
    const remaining = state.tabs.filter((t) => t.id !== id);
    let index = target ? remaining.findIndex((t) => t.id === target) + (before ? 0 : 1) : -1;
    if (index < 0) {
      const lastTab = remaining.filter((t) => t.pane === pane).at(-1);
      const last = lastTab ? remaining.indexOf(lastTab) : -1;
      index = last < 0 ? remaining.length : last + 1;
    }
    remaining.splice(index, 0, tab.pane === pane ? tab : { ...tab, pane });
    const selected = { ...state.selected };
    if (tab.pane !== pane && selected[tab.pane] === id) {
      const peers = oldGroup.filter((t) => t.id !== id);
      selected[tab.pane] = peers[Math.min(oldGroup.indexOf(tab), peers.length - 1)]?.id ?? null;
    }
    selected[pane] = id;
    state = { ...state, tabs: remaining, selected, active: id, activePane: pane };
    emit();
  },
  splitView() {
    if (state.split || !state.tabs.length) return;
    state = { ...state, split: true };
    if (state.active && state.tabs.length > 1) this.move(state.active, 'secondary');
    else emit();
  },
  mergePanes() {
    if (!state.split) return;
    const active = state.active || state.selected.primary || state.selected.secondary;
    state = {
      ...state,
      split: false,
      activePane: 'primary',
      active,
      tabs: state.tabs.map((t) => (t.pane === 'primary' ? t : { ...t, pane: 'primary' })),
      selected: { primary: active, secondary: null },
    };
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
    if (tab && tab.text !== text)
      this.patch(id, { text, dirty: text !== tab.savedText, richError: undefined });
  },
  new(type: FileType = 'text') {
    const id = crypto.randomUUID();
    const pane = state.activePane;
    state = {
      ...state,
      tabs: [
        ...state.tabs,
        {
          id,
          pane,
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
      selected: { ...state.selected, [pane]: id },
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
    const pane = state.activePane;
    const text = normalize(doc.text);
    state = {
      ...state,
      tabs: [
        ...state.tabs,
        {
          ...doc,
          id,
          pane,
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
      selected: { ...state.selected, [pane]: id },
    };
    emit();
  },
  reload(id: string, doc: DocumentFile) {
    const text = normalize(doc.text);
    this.patch(id, {
      ...doc,
      text,
      savedText: text,
      dirty: false,
      conflict: null,
      richError: undefined,
    });
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
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab) return;
    const group = state.tabs.filter((t) => t.pane === tab.pane);
    const index = group.findIndex((t) => t.id === id);
    const remaining = state.tabs.filter((t) => t.id !== id);
    const peers = group.filter((t) => t.id !== id);
    const selected = { ...state.selected };
    if (selected[tab.pane] === id)
      selected[tab.pane] = peers[Math.min(index, peers.length - 1)]?.id ?? null;
    let activePane = state.activePane;
    if (!selected[activePane]) activePane = activePane === 'primary' ? 'secondary' : 'primary';
    if (!state.split || !remaining.length) activePane = 'primary';
    state = {
      ...state,
      tabs: remaining,
      selected,
      activePane,
      active: selected[activePane],
      split: remaining.length ? state.split : false,
    };
    emit();
  },
};
export function useTabs() {
  return useSyncExternalStore(tabs.subscribe, tabs.get);
}
