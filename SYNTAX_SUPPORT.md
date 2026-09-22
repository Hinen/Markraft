# Syntax support

Documents accept arbitrary file names and extensions. New documents are named
`Untitled`, `Untitled 2`, etc.; choosing a syntax never renames or converts them.
The native save dialog offers filters generated from the syntax registry, with
the existing file extension or selected syntax first. Choosing a format lets the
native dialog supply its extension. All files remains available for arbitrary or
extensionless names; unknown existing extensions default to that filter.

`src/files/syntaxRegistry.ts` is the source of truth for syntax IDs, display names,
extension aliases, special file names, tab icons and asynchronous CodeMirror
loaders (including diagnostics). Imports are split into on-demand chunks. A
pending loader is cancelled on syntax changes or unmount; a failed import leaves
the text editable and reports an error.
To support another language, install its CodeMirror language package if needed
and add one registry entry. The inferred `SyntaxId`, search picker, extension
detection and source editor automatically pick it up. Unknown extensions fall
back to Plain Text; opening and saving them requires no registry entry.

Syntax selection is per tab. Automatic mode detects the syntax from the file
name when opening or saving. Explicit selection survives Save As; selecting
Automatic again immediately detects from the current name. A syntax change
does not dirty the document or modify its text. Overrides last for the open tab;
they are not global extension associations.

Markdown additionally has a dedicated rich editor and toolbar. Adding another
language's syntax highlighting requires only a registry entry; adding a new rich
editing experience requires its own editor integration.

## Available syntaxes

- Plain Text, Markdown, JSON, JSONC, YAML, XML (including SVG/XSD/XSL).
- TOML, INI/properties, environment files (`.env` and `.env.*`).
- CSV and TSV, including quoted delimiters, escaped quotes and multiline fields.
- HTML, CSS, SQL, JavaScript/JSX, TypeScript/TSX, Python, Shell/Bash, PowerShell.

Special file names take precedence over extensions: `tsconfig.json`,
`tsconfig.*.json`, `jsconfig.json` and `jsconfig.*.json` use JSONC;
`.editorconfig`/`.gitconfig` use INI; shell startup files such as `.bashrc`,
`.zshrc` and `.profile` use Shell. Arbitrary `.json` files remain strict JSON.
Save filters preserve special file names without forcing another extension.

JSONC diagnostics allow comments and trailing commas. Validation never rewrites
the source or converts its numbers. Syntax support for the other added formats
provides highlighting, with folding/completion where the underlying language
package supports them. It does not execute code or provide compiler/type/schema
checking. CSV/TSV currently have a source editor, not a table preview.
