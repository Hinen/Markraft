import { describe, expect, it } from 'vitest';
import { saveFilters } from '../../src/files/dialogFilters';
import { syntaxes } from '../../src/files/syntaxRegistry';

describe('save dialog filters', () => {
  it.each(syntaxes)(
    'defaults new documents to $id and includes every registered syntax',
    ({ id, extensions }) => {
      const filters = saveFilters(id, 'Untitled', (label) => label);
      expect(filters[0].extensions).toEqual(extensions);
      expect(filters.at(-1)?.extensions).toEqual(['*']);
      expect(filters).toHaveLength(syntaxes.length + 1);
      for (const syntax of syntaxes)
        expect(filters.some((filter) => filter.name === syntax.label)).toBe(true);
    },
  );
  it('respects existing extensions and keeps unknown extensions unrestricted', () => {
    expect(saveFilters('xml', 'config.YML', (s) => s)[0].extensions).toEqual(['yaml', 'yml']);
    expect(saveFilters('text', 'config.custom', (s) => s)[0].extensions).toEqual(['*']);
    expect(saveFilters('text', '.gitignore', (s) => s)[0].extensions).toEqual(['*']);
  });
  it('localizes filter labels', () => {
    const filters = saveFilters('text', 'Untitled', (s) => `translated:${s}`);
    expect(filters[0].name).toBe('translated:Plain Text');
    expect(filters.at(-1)?.name).toBe('translated:All files');
  });
});
