import { json, jsonParseLinter } from '@codemirror/lang-json';
import { StreamLanguage } from '@codemirror/language';
import { json as jsonWithComments } from '@codemirror/legacy-modes/mode/javascript';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { visit, type ParseError } from 'jsonc-parser';
import type { Translate } from '../files/syntaxRegistry';

export function jsoncErrors(text: string): ParseError[] {
  const errors: ParseError[] = [];
  // Validate without converting numbers or rewriting comments/whitespace.
  visit(
    text,
    { onError: (error, offset, length) => errors.push({ error, offset, length }) },
    { allowTrailingComma: true, disallowComments: false },
  );
  return errors;
}

export function jsonSyntax(t: Translate, comments: boolean) {
  const strictLint = jsonParseLinter();
  return [
    comments ? StreamLanguage.define(jsonWithComments) : json(),
    linter((view): Diagnostic[] => {
      const diagnostics: Diagnostic[] = comments
        ? jsoncErrors(view.state.doc.toString()).map((error) => ({
            from: error.offset,
            to: Math.min(view.state.doc.length, error.offset + error.length),
            severity: 'error',
            message: '',
          }))
        : strictLint(view);
      return diagnostics.map((diagnostic) => {
        const line = view.state.doc.lineAt(diagnostic.from);
        return {
          ...diagnostic,
          message: t(
            comments
              ? 'Invalid JSONC at line {line}, column {column}. Check quotes, commas and brackets.'
              : 'Invalid JSON at line {line}, column {column}. Check quotes, commas and brackets.',
            { line: line.number, column: diagnostic.from - line.from + 1 },
          ),
        };
      });
    }),
    lintGutter(),
  ];
}
