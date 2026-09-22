import { syntaxes, type SyntaxId } from './syntaxRegistry';

export function saveFilters(syntax: SyntaxId, name: string, translate: (key: string) => string) {
  const filters = syntaxes.map((entry) => ({
    id: entry.id,
    name: translate(entry.label),
    extensions: [...entry.extensions],
  }));
  const all = { name: translate('All files'), extensions: ['*'] };
  const matching = syntaxes.find((entry) =>
    entry.extensions.some((ext) => name.toLowerCase().endsWith(`.${ext}`)),
  );
  // Existing file names take precedence. Keep arbitrary extensions intact.
  if (name.includes('.') && !matching) return [all, ...filters];
  const preferred = matching?.id ?? syntax;
  return [
    ...filters.filter((entry) => entry.id === preferred),
    ...filters.filter((entry) => entry.id !== preferred),
    all,
  ];
}
