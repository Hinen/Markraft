import { expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { documentWords } from '../../src/editors/completions';

async function words(doc: string, explicit = true) {
  const state = EditorState.create({ doc });
  return documentWords(new CompletionContext(state, doc.length, explicit));
}
it('offers unique document words, including Korean, and excludes numbers/current prefix', async () => {
  const result = await words('userName userName 사용자이름 12345 user');
  expect(result?.options.map((option) => option.label)).toEqual(['userName', '사용자이름']);
  expect(result?.from).toBe(30);
});
it('only provides document words for explicit requests', async () => {
  expect(await words('hello he', false)).toBeNull();
  expect((await words('hello h', true))?.options).toEqual([{ label: 'hello' }]);
  expect((await words('hello ', true))?.options).toEqual([{ label: 'hello' }]);
});
it('does not share words between documents or replace selected text', async () => {
  await words('privateToken pr');
  expect((await words('publicToken pu'))?.options).toEqual([{ label: 'publicToken' }]);
  const state = EditorState.create({ doc: 'hello he', selection: { anchor: 6, head: 8 } });
  expect(await documentWords(new CompletionContext(state, 8, true))).toBeNull();
});
