import { describe, expect, it } from 'vitest';
import { fileType, lineEnding, normalize } from '../../src/files/fileTypes';
import { safeLink, remoteImage } from '../../src/editors/markdownPlugins';
import { tabs } from '../../src/tabs/tabStore';
describe('file types and preservation', () => {
  it.each([
    ['a.md', 'markdown'],
    ['A.MARKDOWN', 'markdown'],
    ['a.txt', 'text'],
    ['a.yaml', 'yaml'],
    ['a.yml', 'yaml'],
    ['a.xml', 'xml'],
    ['items.json', 'json'],
    ['ITEMS.JSON', 'json'],
    ['README', 'text'],
  ])('%s → %s', (name, type) => expect(fileType(name)).toBe(type));
  it('detects CRLF without losing final newline or whitespace', () => {
    expect(lineEnding('a\r\n')).toBe('CRLF');
    expect(lineEnding('a\n')).toBe('LF');
    expect(normalize('  a\r\n\r\n')).toBe('  a\n\n');
  });
  it('allows only external browser protocols', () => {
    expect(safeLink('https://example.com')).toBe(true);
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd'])
      expect(safeLink(url)).toBe(false);
    expect(remoteImage('https://example.com/a.png')).toBe(true);
    expect(remoteImage('//example.com/a.png')).toBe(false);
  });
  it('keeps no-op content, deduplicates files and preserves edits during a save', () => {
    const doc = {
      path: '/a.md',
      name: 'a.md',
      text: '*hi*\r\n',
      encoding: 'UTF-8' as const,
      lineEnding: 'CRLF' as const,
      revision: 'one',
    };
    tabs.open(doc);
    const tab = tabs.get().tabs.at(-1)!;
    expect(tab.dirty).toBe(false);
    tabs.open(doc);
    expect(tabs.get().tabs.filter((t) => t.path === doc.path)).toHaveLength(1);
    tabs.edit(tab.id, 'new');
    tabs.edit(tab.id, 'newer');
    tabs.saved(tab.id, { ...doc, text: 'new', revision: 'two' }, 'new');
    expect(tabs.get().tabs.at(-1)?.dirty).toBe(true);
    expect(tabs.get().tabs.at(-1)?.text).toBe('newer');
    tabs.close(tab.id);
  });
});
