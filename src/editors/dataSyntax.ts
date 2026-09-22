import { StreamLanguage, type StreamParser } from '@codemirror/language';

// Quoted fields may span lines and escape a quote by doubling it. Separators
// inside those fields must remain strings, not appear as extra columns.
export function delimitedParser(
  separator: ',' | '\t',
): StreamParser<{ quoted: boolean; fieldStart: boolean }> {
  return {
    name: separator === ',' ? 'csv' : 'tsv',
    startState: () => ({ quoted: false, fieldStart: true }),
    token(stream, state) {
      if (stream.sol() && !state.quoted) state.fieldStart = true;
      if (!state.quoted && stream.peek() === separator) {
        stream.next();
        state.fieldStart = true;
        return 'punctuation';
      }
      if (!state.quoted && state.fieldStart && stream.peek() === '"') {
        state.quoted = true;
        stream.next();
      }
      state.fieldStart = false;
      if (state.quoted) {
        while (!stream.eol()) {
          if (stream.next() === '"') {
            if (stream.peek() === '"') stream.next();
            else {
              state.quoted = false;
              break;
            }
          }
        }
        return 'string';
      }
      while (!stream.eol() && stream.peek() !== separator) stream.next();
      return /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*$/i.test(stream.current())
        ? 'number'
        : 'string';
    },
  };
}

export const delimited = (separator: ',' | '\t') =>
  StreamLanguage.define(delimitedParser(separator));

export function dotenv() {
  return StreamLanguage.define<{ quote: string | null }>({
    name: 'dotenv',
    startState: () => ({ quote: null }),
    token(stream, state) {
      if (!state.quote) {
        if (stream.eatSpace()) return null;
        if (stream.match(/#.*/)) return 'comment';
        if (stream.match(/export\b/)) return 'keyword';
        if (stream.match(/[A-Za-z_][\w]*(?=\s*=)/)) return 'def';
        if (stream.eat('=')) return 'operator';
        if (stream.peek() === '"' || stream.peek() === "'") state.quote = stream.next()!;
        else {
          stream.eatWhile((ch) => ch !== '#');
          return 'string';
        }
      }
      while (!stream.eol()) {
        const ch = stream.next();
        if (ch === '\\' && state.quote === '"') stream.next();
        else if (ch === state.quote) {
          state.quote = null;
          break;
        }
      }
      return 'string';
    },
    languageData: { commentTokens: { line: '#' } },
  });
}
