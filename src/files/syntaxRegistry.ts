import type { Extension } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';

export type Translate = (key: string, values?: Record<string, string | number>) => string;
interface SyntaxDefinition {
  label: string;
  extensions: readonly string[];
  fileNames?: readonly string[];
  matchesName?: (name: string) => boolean;
  icon: string;
  extensionsForEditor: (t: Translate) => Promise<Extension>;
}

// Metadata stays lightweight. Each grammar loads only when its syntax is selected.
// Add an entry here to update detection, the picker, icons and save filters together.
export const syntaxRegistry = {
  text: {
    label: 'Plain Text',
    extensions: ['txt'],
    icon: 'T',
    extensionsForEditor: async () => [],
  },
  markdown: {
    label: 'Markdown',
    extensions: ['md', 'markdown'],
    icon: 'M↓',
    extensionsForEditor: async () => (await import('@codemirror/lang-markdown')).markdown(),
  },
  json: {
    label: 'JSON',
    extensions: ['json'],
    icon: '{}',
    extensionsForEditor: async (t: Translate) =>
      (await import('../editors/jsonSyntax')).jsonSyntax(t, false),
  },
  jsonc: {
    label: 'JSONC',
    extensions: ['jsonc', 'code-workspace'],
    icon: '{}',
    fileNames: ['tsconfig.json', 'jsconfig.json'],
    matchesName: (name: string) => /^(tsconfig|jsconfig)\..+\.json$/.test(name),
    extensionsForEditor: async (t: Translate) =>
      (await import('../editors/jsonSyntax')).jsonSyntax(t, true),
  },
  yaml: {
    label: 'YAML',
    extensions: ['yaml', 'yml'],
    icon: 'Y',
    extensionsForEditor: async () => (await import('@codemirror/lang-yaml')).yaml(),
  },
  xml: {
    label: 'XML',
    extensions: ['xml', 'xsd', 'xsl', 'svg'],
    icon: '‹/›',
    extensionsForEditor: async () => (await import('@codemirror/lang-xml')).xml(),
  },
  toml: {
    label: 'TOML',
    extensions: ['toml'],
    icon: 'T',
    extensionsForEditor: async () =>
      StreamLanguage.define((await import('@codemirror/legacy-modes/mode/toml')).toml),
  },
  ini: {
    label: 'INI',
    extensions: ['ini', 'cfg', 'properties'],
    icon: '=',
    fileNames: ['.editorconfig', '.gitconfig'],
    extensionsForEditor: async () =>
      StreamLanguage.define((await import('@codemirror/legacy-modes/mode/properties')).properties),
  },
  dotenv: {
    label: 'Environment (.env)',
    extensions: ['env'],
    fileNames: ['.env', '.env.local', '.env.production'],
    matchesName: (name: string) => name.startsWith('.env.'),
    icon: '$',
    extensionsForEditor: async () => (await import('../editors/dataSyntax')).dotenv(),
  },
  csv: {
    label: 'CSV',
    extensions: ['csv'],
    icon: '▦',
    extensionsForEditor: async () => (await import('../editors/dataSyntax')).delimited(','),
  },
  tsv: {
    label: 'TSV',
    extensions: ['tsv', 'tab'],
    icon: '▦',
    extensionsForEditor: async () => (await import('../editors/dataSyntax')).delimited('\t'),
  },
  html: {
    label: 'HTML',
    extensions: ['html', 'htm'],
    icon: '‹›',
    extensionsForEditor: async () => (await import('@codemirror/lang-html')).html(),
  },
  css: {
    label: 'CSS',
    extensions: ['css'],
    icon: '#',
    extensionsForEditor: async () => (await import('@codemirror/lang-css')).css(),
  },
  sql: {
    label: 'SQL',
    extensions: ['sql'],
    icon: 'DB',
    extensionsForEditor: async () => (await import('@codemirror/lang-sql')).sql(),
  },
  javascript: {
    label: 'JavaScript',
    extensions: ['js', 'mjs', 'cjs'],
    icon: 'JS',
    extensionsForEditor: async () => (await import('@codemirror/lang-javascript')).javascript(),
  },
  jsx: {
    label: 'JavaScript JSX',
    extensions: ['jsx'],
    icon: 'JS',
    extensionsForEditor: async () =>
      (await import('@codemirror/lang-javascript')).javascript({ jsx: true }),
  },
  typescript: {
    label: 'TypeScript',
    extensions: ['ts', 'mts', 'cts'],
    icon: 'TS',
    extensionsForEditor: async () =>
      (await import('@codemirror/lang-javascript')).javascript({ typescript: true }),
  },
  tsx: {
    label: 'TypeScript TSX',
    extensions: ['tsx'],
    icon: 'TS',
    extensionsForEditor: async () =>
      (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true }),
  },
  python: {
    label: 'Python',
    extensions: ['py', 'pyw', 'pyi'],
    icon: 'Py',
    extensionsForEditor: async () => (await import('@codemirror/lang-python')).python(),
  },
  shell: {
    label: 'Shell / Bash',
    extensions: ['sh', 'bash', 'zsh'],
    icon: '$',
    fileNames: ['.bashrc', '.bash_profile', '.zshrc', '.zprofile', '.profile'],
    extensionsForEditor: async () =>
      StreamLanguage.define((await import('@codemirror/legacy-modes/mode/shell')).shell),
  },
  powershell: {
    label: 'PowerShell',
    extensions: ['ps1', 'psm1', 'psd1'],
    icon: 'PS',
    extensionsForEditor: async () =>
      StreamLanguage.define((await import('@codemirror/legacy-modes/mode/powershell')).powerShell),
  },
} satisfies Record<string, SyntaxDefinition>;

export type SyntaxId = keyof typeof syntaxRegistry;
export const syntaxes = (Object.entries(syntaxRegistry) as [SyntaxId, SyntaxDefinition][]).map(
  ([id, definition]) => ({ id, ...definition }),
);

export function detectSyntax(name: string) {
  const basename = name.split(/[\\/]/).pop()!.toLowerCase();
  return (
    syntaxes.find(
      (syntax) => syntax.fileNames?.includes(basename) || syntax.matchesName?.(basename),
    ) ?? syntaxes.find((syntax) => syntax.extensions.some((ext) => basename.endsWith(`.${ext}`)))
  );
}
