# Syntax support

Documents accept arbitrary file names and extensions. New documents are named
`Untitled`, `Untitled 2`, etc.; choosing a syntax never renames or converts them.
The native save dialog offers filters generated from the syntax registry, with
the existing file extension or selected syntax first. Choosing a format lets the
native dialog supply its extension. All files remains available for arbitrary or
extensionless names; unknown existing extensions default to that filter.

`src/files/syntaxRegistry.ts` is the source of truth for syntax IDs, display names,
extension aliases, tab icons and CodeMirror extensions (including diagnostics).
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
