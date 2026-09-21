import type { Ctx } from '@milkdown/kit/ctx';
import { parserCtx, remarkCtx, serializerCtx } from '@milkdown/kit/core';
import type { Node } from '@milkdown/kit/prose/model';

interface SourceNode {
  type: string;
  value?: string;
  checked?: boolean | null;
  children?: SourceNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

// Keep the opening source as a baseline so undo can restore its exact spelling.
// Remark supplies source ranges; Milkdown remains the parser and serializer.
export function preserveMarkdown(ctx: Ctx, source: string, original: Node) {
  const parse = ctx.get(parserCtx);
  const serialize = ctx.get(serializerCtx);
  const tree = ctx.get(remarkCtx).parse(source) as SourceNode;
  const definitions = (tree.children || []).filter((n) => n.type === 'definition');
  const blocks = (tree.children || []).filter((n) => n.type !== 'definition');
  const start = (n: SourceNode) => n.position!.start.offset!;
  const end = (n: SourceNode) => n.position!.end.offset!;
  const definitionText = definitions.map((n) => source.slice(start(n), end(n))).join('\n');
  const document = (nodes: Node[]) => original.type.create(original.attrs, nodes);
  const print = (nodes: Node[]) => serialize(document(nodes)).replace(/\n$/, '');
  let requiresValidation = false;
  const matches = (text: string, nodes: Node[]) => {
    const parsed = parse(text + (definitionText ? '\n\n' + definitionText : ''));
    const expected = document(nodes);
    return parsed.eq(expected) || serialize(parsed) === serialize(expected);
  };

  function patchBlock(ast: SourceNode, before: Node, after: Node): string {
    const raw = source.slice(start(ast), end(ast));
    if (before.eq(after)) return raw;
    const oldText = before.textContent;
    const newText = after.textContent;
    const diffStart = before.content.findDiffStart(after.content);
    const diffEnd = before.content.findDiffEnd(after.content);
    const overlap =
      diffStart !== null && diffEnd ? Math.max(0, diffStart - Math.min(diffEnd.a, diffEnd.b)) : 0;
    const from = diffStart === null ? 0 : before.textBetween(0, diffStart, '', '').length;
    const to = diffEnd ? before.textBetween(0, diffEnd.a + overlap, '', '').length : oldText.length;
    const newTo = diffEnd
      ? after.textBetween(0, diffEnd.b + overlap, '', '').length
      : newText.length;
    const leaves: { node: SourceNode; offset: number }[] = [];
    let flattened = '';
    function visit(node: SourceNode) {
      if (['text', 'inlineCode', 'code', 'html'].includes(node.type)) {
        leaves.push({ node, offset: flattened.length });
        flattened += node.value || '';
      } else node.children?.forEach(visit);
    }
    visit(ast);
    if (oldText !== newText && flattened === oldText) {
      for (const { node, offset } of leaves) {
        const value = node.value || '';
        if (from < offset || to > offset + value.length || !node.position) continue;
        const spelling = source.slice(start(node), end(node));
        // Only project literal characters; escaped/entity text uses block fallback.
        const literal =
          node.type === 'text' ? (spelling === value ? 0 : -1) : spelling.indexOf(value);
        if (literal < 0) continue;
        const a = start(node) - start(ast) + literal + from - offset;
        const b = start(node) - start(ast) + literal + to - offset;
        const candidate = raw.slice(0, a) + newText.slice(from, newTo) + raw.slice(b);
        if (matches(candidate, [after])) return candidate;
      }
    }
    // Checkbox changes have no text delta. Preserve bullets, indentation and [X].
    const tasks: SourceNode[] = [];
    const collect = (node: SourceNode) => {
      if (typeof node.checked === 'boolean') tasks.push(node);
      node.children?.forEach(collect);
    };
    collect(ast);
    const checked: boolean[] = [];
    after.descendants((node) => {
      if (node.type.name === 'list_item' && typeof node.attrs.checked === 'boolean')
        checked.push(node.attrs.checked);
    });
    if (tasks.length && tasks.length === checked.length) {
      let candidate = raw;
      for (let i = tasks.length - 1; i >= 0; i--) {
        const task = tasks[i];
        if (task.checked === checked[i]) continue;
        const offset = start(task) - start(ast);
        const marker = /^(?:[-+*]|\d+[.)])\s+\[([ xX])\]/.exec(raw.slice(offset));
        if (!marker) continue;
        const at = offset + marker[0].length - 2;
        candidate = candidate.slice(0, at) + (checked[i] ? 'x' : ' ') + candidate.slice(at + 1);
      }
      if (matches(candidate, [after])) return candidate;
    }
    // Structural/formatting edits may normalize the edited block, never its neighbors.
    requiresValidation = true;
    return print([after]);
  }

  return (next: Node): string => {
    requiresValidation = false;
    if (next.eq(original)) return source;
    if (!blocks.length) return source + (source ? '\n\n' : '') + serialize(next);
    if (
      blocks.length !== original.childCount ||
      blocks.some(
        (n) => n.position?.start.offset === undefined || n.position?.end.offset === undefined,
      )
    ) {
      throw new Error('이 Markdown 형식은 Rich에서 원문을 보존할 수 없습니다.');
    }
    const replacements: { from: number; to: number; text: string }[] = [];
    function replaceRegion(first: number, oldEnd: number, newStart: number, newEnd: number) {
      if (oldEnd - first === newEnd - newStart) {
        for (let i = first; i < oldEnd; i++) {
          const after = next.child(newStart + i - first);
          if (!original.child(i).eq(after))
            replacements.push({
              from: start(blocks[i]),
              to: end(blocks[i]),
              text: patchBlock(blocks[i], original.child(i), after),
            });
        }
        return;
      }
      const nodes: Node[] = [];
      requiresValidation = true;
      for (let i = newStart; i < newEnd; i++) nodes.push(next.child(i));
      if (first === oldEnd) {
        const at = first < blocks.length ? start(blocks[first]) : source.length;
        replacements.push({
          from: at,
          to: at,
          text:
            (first === blocks.length ? '\n\n' : '') +
            print(nodes) +
            (first < blocks.length ? '\n\n' : ''),
        });
      } else {
        const from = start(blocks[first]),
          to = end(blocks[oldEnd - 1]);
        const retained = definitions
          .filter((n) => start(n) >= from && end(n) <= to)
          .map((n) => source.slice(start(n), end(n)));
        replacements.push({
          from,
          to,
          text: [nodes.length ? print(nodes) : '', ...retained].filter(Boolean).join('\n\n'),
        });
      }
    }
    // Shared immutable ProseMirror nodes anchor unchanged blocks, even when an
    // earlier edit and a later insertion shift the intervening block indexes.
    const positions = new Map<Node, number[]>();
    original.forEach((node, _offset, index) =>
      positions.set(node, [...(positions.get(node) || []), index]),
    );
    let oldCursor = 0,
      newCursor = 0;
    next.forEach((node, _offset, index) => {
      let anchor = positions.get(node)?.find((i) => i >= oldCursor);
      if (
        anchor === undefined &&
        oldCursor < original.childCount &&
        original.child(oldCursor).eq(node)
      )
        anchor = oldCursor;
      if (anchor === undefined) return;
      replaceRegion(oldCursor, anchor, newCursor, index);
      oldCursor = anchor + 1;
      newCursor = index + 1;
    });
    replaceRegion(oldCursor, original.childCount, newCursor, next.childCount);
    let result = source;
    for (const change of replacements.reverse())
      result = result.slice(0, change.from) + change.text + result.slice(change.to);
    if (requiresValidation) {
      const expected = serialize(parse(serialize(next)));
      const valid = (text: string) => serialize(parse(text)) === expected;
      if (!valid(result)) {
        // A heading-to-paragraph change can require a new blank separator.
        result = source;
        for (const change of replacements)
          result =
            result.slice(0, change.from) + '\n\n' + change.text + '\n\n' + result.slice(change.to);
        if (!valid(result)) throw new Error('문서의 의미를 보존하는 Rich 저장을 할 수 없습니다.');
      }
    }
    return result;
  };
}
