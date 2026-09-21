import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { editorActions, focusEditor } from '../../src/editors/editorCommands';
import { tabs } from '../../src/tabs/tabStore';

let frames: FrameRequestCallback[];
beforeEach(() => {
  for (const tab of [...tabs.get().tabs]) tabs.close(tab.id);
  editorActions.clear();
  document.body.replaceChildren();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  tabs.new();
});
afterEach(() => vi.unstubAllGlobals());
function editor() {
  const input = document.createElement('textarea');
  document.body.append(input);
  editorActions.set(`${tabs.get().active}:raw`, () => input.focus());
  return input;
}
function nextFrame() {
  for (const callback of frames.splice(0)) callback(0);
}

it('does not take focus back from a tab before a delayed animation frame', () => {
  const input = editor();
  const tab = document.createElement('button');
  document.body.append(tab);
  focusEditor();
  expect(document.activeElement).toBe(input);
  tab.focus();
  nextFrame();
  expect(document.activeElement).toBe(tab);
});

it('focuses an editor registered after the initial request', () => {
  focusEditor();
  const input = editor();
  nextFrame();
  expect(document.activeElement).toBe(input);
});

it('restores focus after a dialog unmounts', () => {
  const input = editor();
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  const button = document.createElement('button');
  dialog.append(button);
  document.body.append(dialog);
  button.focus();
  focusEditor();
  expect(document.activeElement).toBe(button);
  dialog.remove();
  nextFrame();
  expect(document.activeElement).toBe(input);
});

it('respects a new focus target even if the previous focused element unmounted', () => {
  const input = editor();
  const search = document.createElement('input');
  document.body.append(search);
  focusEditor();
  input.remove();
  search.focus();
  nextFrame();
  expect(document.activeElement).toBe(search);
});
