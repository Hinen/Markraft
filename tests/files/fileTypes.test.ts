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
    ['config.custom', 'text'],
    ['md', 'text'],
    ['folder.json/README', 'text'],
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
  it('detects syntax on save, preserves overrides and never forces an extension', () => {
    tabs.new();
    const id = tabs.get().active!;
    const current = () => tabs.get().tabs.find((tab) => tab.id === id)!;
    expect(current().name).toBe('Untitled');
    tabs.edit(id, 'keep this text');
    const doc = {
      path: '/config.json',
      name: 'config.json',
      text: 'keep this text',
      encoding: 'UTF-8' as const,
      lineEnding: 'LF' as const,
      revision: 'one',
    };
    tabs.saved(id, doc, doc.text);
    expect(current().fileType).toBe('json');
    tabs.setSyntax(id, 'yaml');
    expect(current().name).toBe('config.json');
    expect(current().dirty).toBe(false);
    tabs.saved(id, { ...doc, name: 'config.xml', path: '/config.xml' }, doc.text);
    expect(current().fileType).toBe('yaml');
    tabs.setSyntax(id, null);
    expect(current().fileType).toBe('xml');
    tabs.saved(id, { ...doc, name: 'config.custom', path: '/config.custom' }, doc.text);
    expect(current().fileType).toBe('text');
    expect(current().name).toBe('config.custom');
    expect(current().text).toBe(doc.text);
    tabs.setSyntax(id, 'text');
    tabs.saved(id, doc, doc.text);
    expect(current().fileType).toBe('text');
    tabs.close(id);
  });
});
