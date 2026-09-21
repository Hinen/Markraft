import { Editor, rootCtx, defaultValueCtx, remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import { commonmark, codeBlockSchema } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
// Milkdown's default code block schema omits fence metadata. Preserve it as an attribute.
const codeWithMetadata = codeBlockSchema.extendSchema((previous) => (ctx) => {
  const base = previous(ctx);
  return {
    ...base,
    attrs: { ...base.attrs, meta: { default: null } },
    parseMarkdown: {
      ...base.parseMarkdown,
      runner(state, node, type) {
        state.openNode(type, { language: node.lang ?? '', meta: node.meta ?? null });
        if (node.value) state.addText(String(node.value));
        state.closeNode();
      },
    },
    toMarkdown: {
      ...base.toMarkdown,
      runner(state, node) {
        state.addNode('code', undefined, node.textContent, {
          lang: node.attrs.language,
          meta: node.attrs.meta,
        });
      },
    },
  };
});
// Shared by the editor and regression tests: never serialize merely to open/save a file.
export function markdownEditor(root: HTMLElement, text: string) {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, text);
      ctx.update(remarkStringifyOptionsCtx, (options) => ({ ...options, bullet: '-' as const }));
    })
    .use(commonmark)
    .use(gfm)
    .use(codeWithMetadata);
}
