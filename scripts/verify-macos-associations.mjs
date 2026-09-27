import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const app = process.argv[2];
if (!app) throw new Error('Usage: node scripts/verify-macos-associations.mjs Markraft.app');

const expected = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).bundle
  .fileAssociations[0];
const plist = JSON.parse(
  execFileSync('plutil', ['-convert', 'json', '-o', '-', `${app}/Contents/Info.plist`], {
    encoding: 'utf8',
  }),
);
const document = plist.CFBundleDocumentTypes?.find(
  (entry) => entry.CFBundleTypeName === expected.name,
);
if (!document) throw new Error('Markraft document association is missing from the app');

const extensions = new Set(document.CFBundleTypeExtensions);
const contentTypes = new Set(document.LSItemContentTypes);
const imported = new Map(
  (plist.UTImportedTypeDeclarations ?? []).map((entry) => [entry.UTTypeIdentifier, entry]),
);
if (document.LSHandlerRank !== 'Alternate' || !contentTypes.has('public.text'))
  throw new Error('macOS text document association or handler rank is missing');
for (const identifier of expected.contentTypes) {
  if (!contentTypes.has(identifier)) throw new Error(`Missing content type: ${identifier}`);
}

for (const extension of expected.ext) {
  if (!extensions.has(extension)) throw new Error(`Missing extension: ${extension}`);
  const identifier = `io.hinen.markraft.imported.${extension}`;
  if (!expected.contentTypes.includes(identifier)) continue;
  const declaration = imported.get(identifier);
  if (
    !declaration ||
    !declaration.UTTypeConformsTo?.includes('public.text') ||
    !declaration.UTTypeTagSpecification?.['public.filename-extension']?.includes(extension)
  )
    throw new Error(`Missing imported type declaration: ${identifier}`);
}

console.log(`Verified ${expected.ext.length} macOS file associations in ${app}`);
