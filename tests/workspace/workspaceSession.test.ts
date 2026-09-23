import { afterEach, expect, it, vi } from 'vitest';
import { files, type DocumentFile } from '../../src/files/fileService';
import { tabs } from '../../src/tabs/tabStore';
import {
  parseWorkspace,
  restoreWorkspace,
  snapshotWorkspace,
} from '../../src/workspace/workspaceSession';

const disk: DocumentFile = {
  path: '/notes/example.md',
  name: 'example.md',
  text: 'saved',
  encoding: 'UTF-8',
  lineEnding: 'LF',
  revision: 'first',
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  for (const tab of [...tabs.get().tabs]) tabs.close(tab.id);
});

it('restores tab order, split selection, untitled edits, and pane size', async () => {
  vi.spyOn(files, 'read').mockResolvedValue(disk);
  tabs.open(disk);
  const savedId = tabs.get().active!;
  tabs.new();
  const draftId = tabs.get().active!;
  tabs.edit(draftId, 'unfinished work');
  tabs.splitView();
  localStorage.setItem('markraft.workspace', JSON.stringify(snapshotWorkspace(0.65)));
  for (const tab of [...tabs.get().tabs]) tabs.close(tab.id);

  expect(await restoreWorkspace()).toBe(0.65);
  const state = tabs.get();
  expect(state.tabs.map((tab) => tab.id)).toEqual([savedId, draftId]);
  expect(state.split).toBe(true);
  expect(state.selected).toEqual({ primary: savedId, secondary: draftId });
  expect(state.active).toBe(draftId);
  expect(state.tabs[1]).toMatchObject({ text: 'unfinished work', dirty: true });
});

it('keeps unsaved edits and the old revision when the disk changed during shutdown', async () => {
  tabs.open(disk);
  const id = tabs.get().active!;
  tabs.edit(id, 'my edits');
  localStorage.setItem('markraft.workspace', JSON.stringify(snapshotWorkspace(0.5)));
  tabs.close(id);
  vi.spyOn(files, 'read').mockResolvedValue({
    ...disk,
    text: 'external edits',
    revision: 'second',
  });

  await restoreWorkspace();
  expect(tabs.get().tabs[0]).toMatchObject({
    text: 'my edits',
    savedText: 'saved',
    revision: 'first',
    dirty: true,
    conflict: '파일이 외부에서 변경되었습니다.',
  });
});

it('reloads a clean tab from disk and rejects an invalid session', async () => {
  tabs.open(disk);
  localStorage.setItem('markraft.workspace', JSON.stringify(snapshotWorkspace(0.5)));
  tabs.close(tabs.get().active!);
  vi.spyOn(files, 'read').mockResolvedValue({ ...disk, text: 'new disk text', revision: 'second' });
  await restoreWorkspace();
  expect(tabs.get().tabs[0]).toMatchObject({
    text: 'new disk text',
    savedText: 'new disk text',
    revision: 'second',
    dirty: false,
  });
  expect(parseWorkspace({ version: 1, state: { tabs: [] } })).toBeNull();
});

it('keeps the current workspace when a saved snapshot is invalid', async () => {
  tabs.new();
  const current = tabs.get();
  localStorage.setItem('markraft.workspace', JSON.stringify({ version: 1, state: { tabs: [] } }));
  await expect(restoreWorkspace()).rejects.toThrow('Cannot restore the saved workspace');
  expect(tabs.get()).toBe(current);
});
