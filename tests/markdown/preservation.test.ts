import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parserCtx } from '@milkdown/kit/core';
import type { Editor } from '@milkdown/kit/core';
import type { Node } from '@milkdown/kit/prose/model';
import { EditorState } from '@milkdown/kit/prose/state';
import { markdownEditor } from '../../src/editors/markdownCodec';
import { preserveMarkdown } from '../../src/editors/preserveMarkdown';

let editor: Editor;
beforeAll(async () => {
  const root = document.body.appendChild(document.createElement('div'));
  editor = await markdownEditor(root, '').create();
});
afterAll(async () => {
  await editor.destroy();
});
function insert(doc: Node, text: string, addition: string) {
  let at = -1;
  doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text!.includes(text))
      at = pos + node.text!.indexOf(text) + text.length;
  });
  expect(at).toBeGreaterThanOrEqual(0);
  return EditorState.create({ doc }).tr.insertText(addition, at).doc;
}
const source =
  '# Title ###\n\nA **bold** phrase and x86_64.\n\n| A | B |\n|---|:---:|\n| one | two |\n\n* [ ] parent\n  + [X] child\n\nSee [reference][ref].\n\n[ref]: https://example.com "title"\n\n~~~js meta\nconst n = 1;\n~~~\n';
it('changing a heading beside a paragraph keeps them separate', () =>
  editor.action((ctx) => {
    const text = '# title\nparagraph\n\n| a |\n|---|\n| b |\n';
    const doc = ctx.get(parserCtx)(text);
    const next = EditorState.create({ doc }).tr.setNodeMarkup(
      0,
      doc.type.schema.nodes.paragraph,
    ).doc;
    const output = preserveMarkdown(ctx, text, doc)(next);
    expect(ctx.get(parserCtx)(output).eq(next)).toBe(true);
    expect(output).toContain('| a |\n|---|\n| b |\n');
  }));
it('QA.md: a single trailing space changes exactly one byte', () =>
  editor.action((ctx) => {
    const text = readFileSync('tests/fixtures/markdown/qa-source.md', 'utf8');
    const doc = ctx.get(parserCtx)(text);
    const needle = '아래 PASS는 명시한 범위에만 적용한다.';
    const output = preserveMarkdown(ctx, text, doc)(insert(doc, needle, ' '));
    expect(output).toBe(text.replace(needle, needle + ' '));
  }));
for (const needle of ['Title', 'x86_64.', 'one', 'bold', 'reference', 'const n = 1;'])
  it(`preserves source outside a text edit in ${needle}`, () =>
    editor.action((ctx) => {
      const doc = ctx.get(parserCtx)(source);
      const output = preserveMarkdown(ctx, source, doc)(insert(doc, needle, ' updated'));
      expect(output).toBe(source.replace(needle, needle + ' updated'));
    }));
it('checkbox toggle changes only the checkbox marker', () =>
  editor.action((ctx) => {
    const doc = ctx.get(parserCtx)(source);
    const tr = EditorState.create({ doc }).tr;
    doc.descendants((node, pos) => {
      if (node.type.name === 'list_item' && node.attrs.checked === false)
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: true });
    });
    expect(preserveMarkdown(ctx, source, doc)(tr.doc)).toBe(
      source.replace('* [ ] parent', '* [x] parent'),
    );
  }));
it('separate block edits and undo keep original formatting', () =>
  editor.action((ctx) => {
    const doc = ctx.get(parserCtx)(source),
      write = preserveMarkdown(ctx, source, doc);
    const first = insert(doc, 'Title', '!'),
      second = insert(first, 'one', '!');
    expect(write(second)).toBe(source.replace('Title', 'Title!').replace('one', 'one!'));
    expect(write(first)).toBe(source.replace('Title', 'Title!'));
    expect(write(doc)).toBe(source);
  }));
it('new block insertion preserves existing blocks and definitions', () =>
  editor.action((ctx) => {
    const doc = ctx.get(parserCtx)(source);
    const paragraph = doc.type.schema.nodes.paragraph.create(
      null,
      doc.type.schema.text('new paragraph'),
    );
    const next = EditorState.create({ doc }).tr.insert(doc.child(0).nodeSize, paragraph).doc;
    const result = preserveMarkdown(ctx, source, doc)(next);
    expect(result).toBe(source.replace('A **bold**', 'new paragraph\n\nA **bold**'));
    expect(ctx.get(parserCtx)(result).eq(next)).toBe(true);
  }));
it('formatting an edited block keeps unrelated table and reference spelling', () =>
  editor.action((ctx) => {
    const doc = ctx.get(parserCtx)(source);
    const next = EditorState.create({ doc }).tr.setNodeMarkup(0, doc.type.schema.nodes.heading, {
      level: 2,
    }).doc;
    const result = preserveMarkdown(ctx, source, doc)(next);
    expect(result.slice(result.indexOf('\n\n'))).toBe(source.slice(source.indexOf('\n\n')));
    expect(ctx.get(parserCtx)(result).eq(next)).toBe(true);
  }));
it('an earlier edit and later insertion leave the table between them unchanged', () =>
  editor.action((ctx) => {
    const doc = ctx.get(parserCtx)(source),
      first = insert(doc, 'Title', '!');
    const paragraph = doc.type.schema.nodes.paragraph.create(
      null,
      doc.type.schema.text('new paragraph'),
    );
    const next = EditorState.create({ doc: first }).tr.insert(first.content.size, paragraph).doc;
    const output = preserveMarkdown(ctx, source, doc)(next);
    expect(output).toBe(source.replace('Title', 'Title!') + '\n\nnew paragraph');
  }));
for (const name of readdirSync('tests/fixtures/markdown').filter((n) => n.endsWith('.md')))
  it(`edits ${name} without losing Markdown meaning`, () =>
    editor.action((ctx) => {
      const text = readFileSync(`tests/fixtures/markdown/${name}`, 'utf8');
      const doc = ctx.get(parserCtx)(text);
      let first = '';
      doc.descendants((node) => {
        if (!first && node.isText) first = node.text!;
      });
      const next = first
        ? insert(doc, first, ' updated')
        : EditorState.create({ doc }).tr.insertText('updated ', 1).doc;
      const output = preserveMarkdown(ctx, text, doc)(next);
      const parsed = ctx.get(parserCtx)(output);
      expect(parsed.toJSON()).toEqual(next.toJSON());
    }));
