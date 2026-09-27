import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { syntaxes } from '../../src/files/syntaxRegistry';

it('keeps generated installer lists in sync with supported syntax and plain text files', () => {
  execFileSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/file-associations.mjs',
    '--check',
  ]);
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  const extensions: string[] = config.bundle.fileAssociations[0].ext;
  for (const extension of [
    ...syntaxes.flatMap((syntax) => syntax.extensions),
    'log',
    'conf',
    'config',
  ])
    expect(extensions).toContain(extension);
  expect(new Set(extensions).size).toBe(extensions.length);
  for (const extension of ['*', 'exe', 'dll', 'bin', 'dat'])
    expect(extensions).not.toContain(extension);
  const generated = readFileSync('src-tauri/windows/associations.generated.nsh', 'utf8');
  for (const extension of extensions) {
    expect(generated).toContain(`!insertmacro MARKRAFT_REGISTER_EXTENSION "${extension}"`);
    expect(generated).toContain(`!insertmacro MARKRAFT_UNREGISTER_EXTENSION "${extension}"`);
  }

  // macOS uses content types in preference to the extension list. Every
  // extension must therefore have either a system text type or an imported one.
  const association = config.bundle.fileAssociations[0];
  expect(association.rank).toBe('Alternate');
  expect(association.contentTypes).toContain('public.text');
  expect(association.contentTypes).toContain('public.mpeg-2-transport-stream');
  expect(association.contentTypes).toContain('public.avchd-mpeg-2-transport-stream');
  const importedPlist = readFileSync('src-tauri/Info.plist', 'utf8');
  for (const extension of extensions) {
    const identifier = `io.hinen.markraft.imported.${extension}`;
    if (association.contentTypes.includes(identifier)) {
      expect(importedPlist).toContain(`<string>${identifier}</string>`);
      expect(importedPlist).toContain(`<string>${extension}</string>`);
    } else {
      expect([
        'bash',
        'css',
        'csv',
        'diff',
        'htm',
        'html',
        'json',
        'patch',
        'py',
        'sh',
        'svg',
        'text',
        'toml',
        'tsv',
        'txt',
        'xml',
        'yaml',
        'yml',
        'zsh',
      ]).toContain(extension);
    }
  }
});

it('uses candidate-only Windows hooks rather than default-association macros', () => {
  const windows = JSON.parse(readFileSync('src-tauri/tauri.windows.conf.json', 'utf8'));
  expect(windows.bundle.fileAssociations).toEqual([]);
  const hooks = readFileSync('src-tauri/windows/hooks.nsh', 'utf8');
  expect(hooks).not.toMatch(/APP_ASSOCIATE|UserChoice/);
  expect(hooks).toContain('OpenWithProgids');
  expect(hooks).toContain('SupportedTypes');
  expect(hooks).not.toMatch(/WriteRegStr.*Classes\\\.\$\{EXT\}"\s+""/);
});
