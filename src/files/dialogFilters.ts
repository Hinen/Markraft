import { syntaxes, detectSyntax, type SyntaxId } from './syntaxRegistry';

export function saveFilters(syntax: SyntaxId, name: string, translate: (key: string) => string) {
  const filters = syntaxes.map((entry) => ({
    id: entry.id,
    name: translate(entry.label),
    extensions: [...entry.extensions],
  }));
  const all = { name: translate('All files'), extensions: ['*'] };
  const matching = detectSyntax(name);
  const hasKnownExtension = matching?.extensions.some((ext) =>
    name.toLowerCase().endsWith(`.${ext}`),
  );
  // Preserve dotfiles, special names and unknown extensions without appending suffixes.
  if ((matching && !hasKnownExtension) || (name.includes('.') && !matching))
    return [all, ...filters];
  const preferred = matching?.id ?? syntax;
  return [
    ...filters.filter((entry) => entry.id === preferred),
    ...filters.filter((entry) => entry.id !== preferred),
    all,
  ];
}
