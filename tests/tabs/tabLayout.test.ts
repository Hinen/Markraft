import { beforeEach, expect, it } from 'vitest';
import { tabs } from '../../src/tabs/tabStore';

beforeEach(() => {
  for (const tab of [...tabs.get().tabs]) tabs.close(tab.id);
});
function open(name: string) {
  tabs.open({
    path: `/qa/${name}`,
    name,
    text: name,
    encoding: 'UTF-8',
    lineEnding: 'LF',
    revision: 'initial',
  });
  return tabs.get().active!;
}
function valid() {
  const state = tabs.get();
  for (const pane of ['primary', 'secondary'] as const) {
    const selected = state.selected[pane];
    if (selected) expect(state.tabs.find((t) => t.id === selected)?.pane).toBe(pane);
  }
  expect(state.active).toBe(state.selected[state.activePane]);
}
it('reorders without replacing document objects or losing unsaved text', () => {
  const a = open('a.md'),
    b = open('b.txt'),
    c = open('c.xml');
  tabs.edit(a, 'unsaved');
  const original = tabs.get().tabs.find((t) => t.id === a);
  tabs.move(a, 'primary', c, false);
  expect(tabs.get().tabs.map((t) => t.id)).toEqual([b, c, a]);
  expect(tabs.get().tabs.at(-1)).toBe(original);
  expect(original?.dirty).toBe(true);
  expect(original?.text).toBe('unsaved');
  valid();
});
it('splits the current tab, moves across panes and merges without closing documents', () => {
  const a = open('a.md'),
    b = open('b.md'),
    c = open('c.md');
  tabs.edit(b, 'local');
  tabs.splitView();
  expect(tabs.get().selected).toEqual({ primary: b, secondary: c });
  valid();
  tabs.move(b, 'secondary', c, true);
  expect(tabs.get().selected).toEqual({ primary: a, secondary: b });
  valid();
  tabs.mergePanes();
  expect(tabs.get().tabs.map((t) => t.pane)).toEqual(['primary', 'primary', 'primary']);
  expect(tabs.get().active).toBe(b);
  expect(tabs.get().tabs.find((t) => t.id === b)?.text).toBe('local');
  valid();
});
it('new documents use the focused pane; duplicate opens select their existing pane', () => {
  const a = open('a.md');
  open('second.md');
  tabs.splitView();
  tabs.focusPane('secondary');
  const b = open('b.txt');
  expect(tabs.get().tabs.find((t) => t.id === b)?.pane).toBe('secondary');
  open('a.md');
  expect(tabs.get().tabs).toHaveLength(3);
  expect(tabs.get().active).toBe(a);
  expect(tabs.get().activePane).toBe('primary');
  valid();
});
it('closing selected and inactive tabs maintains both pane selections', () => {
  const a = open('a.md'),
    b = open('b.md'),
    c = open('c.md');
  tabs.splitView();
  tabs.close(a);
  expect(tabs.get().active).toBe(c);
  valid();
  tabs.close(c);
  expect(tabs.get().active).toBe(b);
  expect(tabs.get().selected.secondary).toBeNull();
  valid();
  tabs.close(b);
  expect(tabs.get().split).toBe(false);
  expect(tabs.get().active).toBeNull();
  valid();
});
it('invalid moves do not remove or duplicate a document', () => {
  const a = open('a.md'),
    b = open('b.md');
  const original = tabs.get();
  tabs.move(a, 'secondary');
  tabs.move('missing', 'primary');
  tabs.move(a, 'primary', 'missing');
  tabs.move(a, 'primary', a);
  expect(tabs.get()).toBe(original);
  tabs.move(b, 'primary', a, true);
  expect(tabs.get().tabs.map((t) => t.id)).toEqual([b, a]);
  valid();
});
it.each(['primary', 'secondary'] as const)(
  'dragging an inactive tab to %s splits that tab and keeps the active document opposite',
  (pane) => {
    const a = open('a.md'),
      b = open('b.txt');
    tabs.edit(a, 'unsaved');
    tabs.splitWith(a, pane);
    expect(tabs.get().split).toBe(true);
    expect(tabs.get().selected[pane]).toBe(a);
    expect(tabs.get().selected[pane === 'primary' ? 'secondary' : 'primary']).toBe(b);
    expect(tabs.get().tabs.find((t) => t.id === a)?.text).toBe('unsaved');
    expect(tabs.get().tabs.find((t) => t.id === a)?.dirty).toBe(true);
    expect(tabs.get().tabs).toHaveLength(2);
    valid();
  },
);
it('single-tab split is a no-op and moving the last document out of a pane merges it', () => {
  const a = open('a.md');
  tabs.splitWith('missing', 'secondary');
  expect(tabs.get().split).toBe(false);
  tabs.splitWith(a, 'secondary');
  expect(tabs.get().selected).toEqual({ primary: a, secondary: null });
  expect(tabs.get().split).toBe(false);
  const b = open('b.md');
  tabs.splitWith(a, 'secondary');
  expect(tabs.get().split).toBe(true);
  tabs.splitWith(a, 'primary');
  expect(tabs.get().selected).toEqual({ primary: a, secondary: null });
  expect(tabs.get().split).toBe(false);
  expect(tabs.get().tabs).toHaveLength(2);
  expect(tabs.get().tabs.find((t) => t.id === b)?.pane).toBe('primary');
  valid();
});
it.each(['primary', 'secondary'] as const)(
  'closing the last %s document expands the other pane preserving dirty content',
  (pane) => {
    const a = open('a.md'),
      b = open('b.txt');
    tabs.edit(a, 'keep');
    tabs.splitWith(b, pane);
    tabs.close(b);
    expect(tabs.get().split).toBe(false);
    expect(tabs.get().active).toBe(a);
    expect(tabs.get().tabs[0].text).toBe('keep');
    expect(tabs.get().tabs[0].dirty).toBe(true);
    valid();
  },
);
it('untitled names are unambiguous and cycling stays within the focused pane', () => {
  tabs.new();
  tabs.new();
  tabs.new('markdown');
  expect(tabs.get().tabs.map((t) => t.name)).toEqual([
    'Untitled.txt',
    'Untitled 2.txt',
    'Untitled.md',
  ]);
  tabs.cycle(1);
  expect(tabs.get().tabs.find((t) => t.id === tabs.get().active)?.name).toBe('Untitled.txt');
  tabs.splitView();
  const focused = tabs.get().active;
  tabs.cycle(1);
  expect(tabs.get().active).toBe(focused);
  valid();
});
