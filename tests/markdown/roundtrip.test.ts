import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parserCtx, serializerCtx } from '@milkdown/kit/core';
import type { Editor } from '@milkdown/kit/core';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { markdownEditor } from '../../src/editors/markdownCodec';
let editor: Editor;
beforeAll(async () => {
  const root = document.createElement('div');
  document.body.append(root);
  editor = await markdownEditor(root, '').create();
});
afterAll(async () => {
  await editor.destroy();
});
function resolveReferences(tree: any) {
  const definitions = new Map(
    tree.children
      .filter((node: any) => node.type === 'definition')
      .map((node: any) => [node.identifier, node]),
  );
  function visit(node: any): any {
    if (node.type === 'definition') return null;
    if (node.type === 'linkReference' || node.type === 'imageReference') {
      const definition = definitions.get(node.identifier) as any;
      if (definition)
        return visit(
          node.type === 'linkReference'
            ? {
                type: 'link',
                url: definition.url,
                title: definition.title,
                children: node.children,
              }
            : { type: 'image', url: definition.url, title: definition.title, alt: node.alt },
        );
    }
    return {
      ...node,
      ...(node.children ? { children: node.children.map(visit).filter(Boolean) } : {}),
    };
  }
  return visit(tree);
}
function semantic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semantic);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !['id', 'label', 'spread', 'position'].includes(key))
        .map(([key, v]) => [key, semantic(v)]),
    );
  return value;
}
const folder = resolve('tests/fixtures/markdown');
describe('Milkdown parse → editor document → serialize → parse', () => {
  for (const name of readdirSync(folder).filter((n) => n.endsWith('.md')))
    it(name, () => {
      editor.action((ctx) => {
        const parse = ctx.get(parserCtx);
        const serialize = ctx.get(serializerCtx);
        const source = readFileSync(resolve(folder, name), 'utf8');
        const first = parse(source);
        const mdast = unified().use(remarkParse).use(remarkGfm);
        expect(semantic(resolveReferences(mdast.parse(serialize(first))))).toEqual(
          semantic(resolveReferences(mdast.parse(source))),
        );
        const second = parse(serialize(first));
        expect(semantic(second.toJSON())).toEqual(semantic(first.toJSON()));
      });
    });
  it('serializes checkbox toggle as standard Markdown', () =>
    editor.action((ctx) => {
      const doc = ctx.get(parserCtx)('- [ ] parent\n  - [x] child\n');
      const item = doc.firstChild!.firstChild!;
      const changed = item.type.create({ ...item.attrs, checked: true }, item.content);
      const list = doc.firstChild!.copy(doc.firstChild!.content.replaceChild(0, changed));
      const next = doc.copy(doc.content.replaceChild(0, list));
      const output = ctx.get(serializerCtx)(next);
      expect(output).toContain('- [x] parent');
      expect(output).toContain('- [x] child');
    }));
});
