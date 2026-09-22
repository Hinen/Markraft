import { expect, it } from 'vitest';
import { StringStream } from '@codemirror/language';
import { delimitedParser } from '../../src/editors/dataSyntax';

it.each([',', '\t'] as const)(
  'keeps quoted %j delimiters and multiline fields intact',
  (separator) => {
    const parser = delimitedParser(separator);
    const state = parser.startState!(2);
    const tokens: { text: string; style: string | null }[] = [];
    for (const line of [
      `"first${separator}field"${separator}"line one`,
      `line ""two"""${separator}42`,
    ]) {
      const stream = new StringStream(line, 2, 2);
      while (!stream.eol()) {
        stream.start = stream.pos;
        const style = parser.token(stream, state);
        expect(stream.pos).toBeGreaterThan(stream.start);
        tokens.push({ text: stream.current(), style });
      }
    }
    expect(tokens.filter((token) => token.style === 'punctuation')).toHaveLength(2);
    expect(tokens.at(-1)).toEqual({ text: '42', style: 'number' });
    expect(state.quoted).toBe(false);
  },
);
