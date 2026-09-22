import type { Extension } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter, lintGutter } from '@codemirror/lint';

type Translate = (key: string, values?: Record<string, string | number>) => string;
interface SyntaxDefinition {
  label: string;
  extensions: readonly string[];
  icon: string;
  extensionsForEditor: (t: Translate) => Extension;
}

// Add a syntax here: detection, picker, tab icons and source editor share this registry.
// File names remain independent of the selected syntax, including unknown extensions.
export const syntaxRegistry = {
  text: {
    label: 'Plain Text',
    extensions: ['txt'],
    icon: 'T',
    extensionsForEditor: () => [],
  },
  markdown: {
    label: 'Markdown',
    extensions: ['md', 'markdown'],
    icon: 'M↓',
    extensionsForEditor: () => markdown(),
  },
  json: {
    label: 'JSON',
    extensions: ['json'],
    icon: '{}',
    extensionsForEditor: (t: Translate) => {
      const lint = jsonParseLinter();
      return [
        json(),
        linter((view) =>
          lint(view).map((diagnostic) => {
            const line = view.state.doc.lineAt(diagnostic.from);
            return {
              ...diagnostic,
              message: t(
                'Invalid JSON at line {line}, column {column}. Check quotes, commas and brackets.',
                { line: line.number, column: diagnostic.from - line.from + 1 },
              ),
            };
          }),
        ),
        lintGutter(),
      ];
    },
  },
  yaml: {
    label: 'YAML',
    extensions: ['yaml', 'yml'],
    icon: 'Y',
    extensionsForEditor: () => yaml(),
  },
  xml: {
    label: 'XML',
    extensions: ['xml'],
    icon: '‹/›',
    extensionsForEditor: () => xml(),
  },
} satisfies Record<string, SyntaxDefinition>;

export type SyntaxId = keyof typeof syntaxRegistry;
export const syntaxes = (Object.entries(syntaxRegistry) as [SyntaxId, SyntaxDefinition][]).map(
  ([id, definition]) => ({ id, ...definition }),
);
