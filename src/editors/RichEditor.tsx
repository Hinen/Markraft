import { useEffect, useRef, useState } from 'react';
import { editorViewCtx, parserCtx, serializerCtx, schemaCtx } from '@milkdown/kit/core';
import type { Editor } from '@milkdown/kit/core';
import { history } from '@milkdown/kit/plugin/history';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { $prose, callCommand } from '@milkdown/kit/utils';
import { Plugin, TextSelection, AllSelection } from '@milkdown/kit/prose/state';
import { undo, redo } from '@milkdown/kit/prose/history';
import { toggleMark, setBlockType, wrapIn } from '@milkdown/kit/prose/commands';
import { wrapInList } from '@milkdown/kit/prose/schema-list';
import { addRowAfter, deleteRow, addColumnAfter, deleteColumn } from '@milkdown/kit/prose/tables';
import { insertTableCommand } from '@milkdown/kit/preset/gfm';
import { markdownEditor } from './markdownCodec';
import { richPlugins } from './markdownPlugins';
import { editorActions } from './editorCommands';
import { tabs, type EditorTab } from '../tabs/tabStore';
export function RichEditor({ tab, visible, onError }: { tab: EditorTab; visible: boolean; onError: (error: string) => void }) {
  const root = useRef<HTMLDivElement>(null); const editor = useRef<Editor | null>(null); const current = useRef(tab); current.current = tab; const suppress = useRef(false); const [ready, setReady] = useState(false); const [search, setSearch] = useState<string | null>(null); const [count, setCount] = useState(''); const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    const instance = markdownEditor(root.current!, tab.text).use(history).use(clipboard).use(richPlugins(() => current.current.path, onError)).use($prose(ctx => new Plugin({ view: () => ({ update(view, previous) {
      if (!view.state.doc.eq(previous.doc) && !suppress.current) tabs.edit(tab.id, ctx.get(serializerCtx)(view.state.doc));
      if (!view.state.selection.eq(previous.selection)) { const before = view.state.doc.textBetween(0, view.state.selection.head, '\n'); const lines = before.split('\n'); tabs.patch(tab.id, { line: lines.length, column: (lines.at(-1)?.length || 0) + 1 }); }
    } }) })));
    void instance.create().then(() => {
      if (cancelled) { void instance.destroy(); return; } editor.current = instance; setReady(true);
      editorActions.set(`${tab.id}:rich`, (action, value) => {
        if (action === 'find' || action === 'replace') { setSearch(''); requestAnimationFrame(() => searchInput.current?.focus()); return; }
        instance.action(ctx => {
          const view = ctx.get(editorViewCtx); const { state, dispatch } = view; const schema = ctx.get(schemaCtx); view.focus();
          const commands = { undo, redo, rowAdd: addRowAfter, rowDelete: deleteRow, columnAdd: addColumnAfter, columnDelete: deleteColumn };
          if (action in commands) { commands[action as keyof typeof commands](state, dispatch); return; }
          const marks = { bold: 'strong', italic: 'emphasis', strike: 'strike_through', code: 'inlineCode' };
          if (action in marks) { const mark = schema.marks[marks[action as keyof typeof marks]]; if (mark) toggleMark(mark)(state, dispatch); }
          if (action === 'heading') setBlockType(value === '0' ? schema.nodes.paragraph : schema.nodes.heading, { level: Number(value || 1) })(state, dispatch);
          if (action === 'bullet' || action === 'task') { wrapInList(schema.nodes.bullet_list)(view.state, dispatch); if (action === 'task') { const pos = view.state.selection.$from; for (let depth = pos.depth; depth > 0; depth--) if (pos.node(depth).type.name === 'list_item') { dispatch(view.state.tr.setNodeMarkup(pos.before(depth), undefined, { ...pos.node(depth).attrs, checked: false })); break; } } }
          if (action === 'ordered') wrapInList(schema.nodes.ordered_list)(state, dispatch);
          if (action === 'quote') wrapIn(schema.nodes.blockquote)(state, dispatch);
          if (action === 'table') instance.action(callCommand(insertTableCommand.key, { row: 3, col: 2 }));
          if (action === 'rule') dispatch(state.tr.replaceSelectionWith(schema.nodes.hr.create()));
          if (action === 'link' && value !== undefined) { if (!value) dispatch(state.tr.removeMark(state.selection.from, state.selection.to, schema.marks.link)); else if (state.selection.empty) dispatch(state.tr.insertText(value).addMark(state.selection.from, state.selection.from + value.length, schema.marks.link.create({ href: value }))); else dispatch(state.tr.addMark(state.selection.from, state.selection.to, schema.marks.link.create({ href: value }))); }
          if (action === 'image' && value) dispatch(state.tr.replaceSelectionWith(schema.nodes.image.create({ src: value, alt: '' })));
          if (action === 'selectAll') dispatch(state.tr.setSelection(new AllSelection(state.doc)));
        });
      });
    }).catch(error => onError(`Markdown editor: ${String(error)}`));
    return () => { cancelled = true; editorActions.delete(`${tab.id}:rich`); editor.current = null; void instance.destroy(); };
  }, []);
  useEffect(() => { if (!ready || !editor.current) return; editor.current.action(ctx => { const view = ctx.get(editorViewCtx); const next = ctx.get(parserCtx)(tab.text); if (!next.eq(view.state.doc)) { suppress.current = true; view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, next.content)); suppress.current = false; } }); }, [tab.text, ready]);
  useEffect(() => { if (visible && ready) editor.current?.action(ctx => ctx.get(editorViewCtx).focus()); }, [visible, ready]);
  function find(next: boolean) { editor.current?.action(ctx => { const view = ctx.get(editorViewCtx); const query = (search || '').toLocaleLowerCase(); if (!query) { setCount(''); return; } const matches: { from: number; to: number }[] = []; view.state.doc.descendants((node, pos) => { if (node.isText) { const text = node.text!.toLocaleLowerCase(); let index = 0; while ((index = text.indexOf(query, index)) >= 0) { matches.push({ from: pos + index, to: pos + index + query.length }); index += query.length; } } }); if (!matches.length) { setCount('0 results'); return; } const selected = matches.find(m => m.from >= (next ? view.state.selection.to : 0)) || matches[0]; view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selected.from, selected.to)).scrollIntoView()); setCount(`${matches.indexOf(selected) + 1} / ${matches.length}`); }); }
  return <div className="rich-wrapper">{search !== null && <div className="rich-search"><input ref={searchInput} aria-label="Find in document" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); find(true); } if (e.key === 'Escape') setSearch(null); }} placeholder="Find in document"/><button onClick={() => find(true)}>Next</button><span>{count}</span><button aria-label="Close find" onClick={() => setSearch(null)}>×</button></div>}<div className="rich-scroll"><div ref={root} className="rich-editor" aria-label="Rich Markdown editor"/></div></div>;
}
