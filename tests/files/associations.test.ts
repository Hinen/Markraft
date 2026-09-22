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
