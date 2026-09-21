import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
// Shared by the editor and regression tests: never serialize merely to open/save a file.
export function markdownEditor(root: HTMLElement, text: string) {
  return Editor.make().config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, text); }).use(commonmark).use(gfm);
}
