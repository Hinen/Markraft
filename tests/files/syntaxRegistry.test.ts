import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { fileType } from '../../src/files/fileTypes';
import { syntaxRegistry, type SyntaxId } from '../../src/files/syntaxRegistry';
import { saveFilters } from '../../src/files/dialogFilters';
import { jsoncErrors } from '../../src/editors/jsonSyntax';

const examples: [SyntaxId, string, string][] = [
  ['toml', 'Cargo.toml', '[package]\nname = "demo"\n'],
  ['ini', 'settings.ini', '[app]\nname=demo\n'],
  ['dotenv', '.env.production.local', 'export TOKEN="a#b"\nPORT=3000 # comment\n'],
  ['jsonc', 'tsconfig.json', '{ // comment\n "compilerOptions": {},\n}\n'],
  ['csv', 'data.csv', 'name,value\n"a,b",42\n'],
  ['tsv', 'data.tsv', 'name\tvalue\n"a\tb"\t42\n'],
  ['html', 'index.html', '<div class="demo">Hello</div>'],
  ['css', 'style.css', '.demo { color: red; }'],
  ['sql', 'query.sql', 'SELECT * FROM users WHERE id = 1;'],
  ['javascript', 'script.mjs', 'const value = 42;'],
  ['jsx', 'view.jsx', 'const view = <div>Hello</div>;'],
  ['typescript', 'main.ts', 'const value: number = 42;'],
  ['tsx', 'view.tsx', 'const view = <div>Hello</div>;'],
  ['python', 'main.py', 'def hello():\n    return "hello"'],
  ['shell', '.bashrc', '# comment\nexport NAME="hello"'],
  ['powershell', 'script.ps1', '$name = "hello"\nWrite-Host $name'],
];

describe('extended syntax support', () => {
  it.each(examples)(
    '%s detects and loads a grammar without changing source',
    async (id, name, doc) => {
      expect(fileType(name)).toBe(id);
      const state = EditorState.create({
        doc,
        extensions: await syntaxRegistry[id].extensionsForEditor((s) => s),
      });
      ensureSyntaxTree(state, doc.length, 1000);
      expect(syntaxTree(state).length).toBe(doc.length);
      expect(syntaxTree(state).topNode.firstChild).not.toBeNull();
      expect(state.doc.toString()).toBe(doc);
    },
  );
  it.each([
    ['.env', 'dotenv'],
    ['C:\\work\\.env.local', 'dotenv'],
    ['APP.ENV', 'dotenv'],
    ['.editorconfig', 'ini'],
    ['.zshrc', 'shell'],
    ['tsconfig.build.json', 'jsonc'],
    ['jsconfig.json', 'jsonc'],
    ['package.json', 'json'],
    ['settings.json', 'json'],
    ['data.custom', 'text'],
    ['env', 'text'],
    ['folder.py/README', 'text'],
  ])('detects %s as %s', (name, expected) => expect(fileType(name)).toBe(expected));
  it('preserves special file names in save dialogs', () => {
    for (const name of ['.env.local', '.bashrc', 'tsconfig.json', '.editorconfig'])
      expect(saveFilters(fileType(name), name, (s) => s)[0].extensions).toEqual(['*']);
  });
  it('allows JSONC comments and trailing commas but reports malformed values', () => {
    expect(jsoncErrors('{/* comment */"large":9007199254740993,"items":[1,],}')).toEqual([]);
    expect(jsoncErrors('{"a": }').length).toBeGreaterThan(0);
    expect(jsoncErrors('{"a": "unterminated}').length).toBeGreaterThan(0);
    expect(jsoncErrors('/* missing end').length).toBeGreaterThan(0);
  });
});
