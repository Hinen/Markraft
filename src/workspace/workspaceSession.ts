import { invoke, isTauri } from '@tauri-apps/api/core';
import { fileType, normalize } from '../files/fileTypes';
import { files } from '../files/fileService';
import { syntaxRegistry } from '../files/syntaxRegistry';
import { tabs, type EditorTab, type Pane, type TabState } from '../tabs/tabStore';

const key = 'markraft.workspace';
export interface WorkspaceSnapshot {
  version: 1;
  state: TabState;
  splitRatio: number;
}

export function snapshotWorkspace(splitRatio: number): WorkspaceSnapshot {
  return { version: 1, state: tabs.get(), splitRatio };
}

export async function saveWorkspace(snapshot: WorkspaceSnapshot) {
  if (isTauri()) await invoke('save_workspace', { snapshot });
  else localStorage.setItem(key, JSON.stringify(snapshot));
}

async function loadSnapshot(): Promise<unknown> {
  if (isTauri()) return invoke('load_workspace');
  const value = localStorage.getItem(key);
  return value ? JSON.parse(value) : null;
}

const pane = (value: unknown): value is Pane => value === 'primary' || value === 'secondary';
const text = (value: unknown): value is string => typeof value === 'string';
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function validTab(value: unknown): value is EditorTab {
  if (!record(value)) return false;
  return (
    text(value.id) &&
    pane(value.pane) &&
    (value.path === null || text(value.path)) &&
    text(value.name) &&
    text(value.fileType) &&
    Object.hasOwn(syntaxRegistry, value.fileType) &&
    (value.syntaxOverride === undefined ||
      value.syntaxOverride === null ||
      (text(value.syntaxOverride) && Object.hasOwn(syntaxRegistry, value.syntaxOverride))) &&
    text(value.text) &&
    text(value.savedText) &&
    typeof value.dirty === 'boolean' &&
    ['UTF-8', 'UTF-8 BOM', 'UTF-16 LE', 'UTF-16 BE'].includes(String(value.encoding)) &&
    ['LF', 'CRLF'].includes(String(value.lineEnding)) &&
    (value.revision === null || text(value.revision)) &&
    (value.mode === 'rich' || value.mode === 'raw') &&
    (value.conflict === null || text(value.conflict)) &&
    Number.isInteger(value.line) &&
    Number(value.line) > 0 &&
    Number.isInteger(value.column) &&
    Number(value.column) > 0
  );
}

export function parseWorkspace(value: unknown): WorkspaceSnapshot | null {
  if (!record(value) || value.version !== 1 || !record(value.state)) return null;
  const saved = value.state;
  if (!Array.isArray(saved.tabs) || !saved.tabs.every(validTab) || !pane(saved.activePane))
    return null;
  if (!record(saved.selected)) return null;
  const savedTabs = saved.tabs as EditorTab[];
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const tab of savedTabs) {
    if (ids.has(tab.id) || (tab.path && paths.has(tab.path))) return null;
    ids.add(tab.id);
    if (tab.path) paths.add(tab.path);
  }
  const selected = saved.selected;
  const belongs = (id: unknown, group: Pane) =>
    id === null || (text(id) && savedTabs.some((tab) => tab.id === id && tab.pane === group));
  if (!belongs(selected.primary, 'primary') || !belongs(selected.secondary, 'secondary'))
    return null;
  if (saved.active !== selected[saved.activePane] || typeof saved.split !== 'boolean') return null;
  if (saved.split && (!selected.primary || !selected.secondary)) return null;
  if (
    !saved.split &&
    (saved.activePane !== 'primary' ||
      selected.secondary !== null ||
      savedTabs.some((tab) => tab.pane !== 'primary'))
  )
    return null;
  if (!Number.isFinite(value.splitRatio)) return null;
  return value as unknown as WorkspaceSnapshot;
}

export async function restoreWorkspace(): Promise<number | null> {
  const stored = await loadSnapshot();
  if (stored === null) return null;
  const snapshot = parseWorkspace(stored);
  if (!snapshot) throw new Error('Cannot restore the saved workspace. Its snapshot was kept.');
  const restored = await Promise.all(
    snapshot.state.tabs.map(async (tab) => {
      if (!tab.path) return { ...tab, dirty: tab.text !== tab.savedText };
      try {
        const disk = await files.read(tab.path);
        const diskText = normalize(disk.text);
        if (!tab.dirty) {
          return {
            ...tab,
            ...disk,
            fileType: tab.syntaxOverride ?? fileType(disk.name),
            text: diskText,
            savedText: diskText,
            dirty: false,
            conflict: null,
          };
        }
        return {
          ...tab,
          conflict: disk.revision !== tab.revision ? '파일이 외부에서 변경되었습니다.' : null,
        };
      } catch {
        return {
          ...tab,
          conflict:
            '파일이 삭제되었거나 접근할 수 없습니다. Save As로 복사본을 저장할 수 있습니다.',
        };
      }
    }),
  );
  tabs.restore({ ...snapshot.state, tabs: restored });
  return Math.max(0.25, Math.min(0.75, snapshot.splitRatio));
}
