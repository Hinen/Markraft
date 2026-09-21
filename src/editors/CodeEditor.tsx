import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab, undo, redo, selectAll } from '@codemirror/commands';
import { openSearchPanel, gotoLine } from '@codemirror/search';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import type { EditorTab } from '../tabs/tabStore';
import { tabs } from '../tabs/tabStore';
import type { Settings } from '../settings/settingsStore';
import { editorActions } from './editorCommands';
export function CodeEditor({ tab, settings, visible }: { tab: EditorTab; settings: Settings; visible: boolean }) {
  const root = useRef<HTMLDivElement>(null); const view = useRef<EditorView | null>(null); const suppress = useRef(false); const wrap = useRef(new Compartment()); const theme = useRef(new Compartment()); const lang = useRef(new Compartment());
  const language = () => tab.fileType === 'markdown' ? markdown() : tab.fileType === 'yaml' ? yaml() : tab.fileType === 'xml' ? xml() : [];
  const themeExtension = () => EditorView.theme({ '&': { height: '100%', fontSize: `${settings.fontSize}px`, color: 'var(--text)', backgroundColor: 'var(--surface)' }, '.cm-scroller': { fontFamily: settings.editorFont, overflow: 'auto' }, '.cm-content': { padding: '24px 0' }, '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--muted)', border: 'none' }, '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--hover)' }, '.cm-cursor': { borderLeftColor: 'var(--text)' }, '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--selection)' }, '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--text)' } }, { dark: document.documentElement.dataset.theme === 'dark' });
  useEffect(() => {
    const editor = new EditorView({ parent: root.current!, state: EditorState.create({ doc: tab.text, extensions: [basicSetup, keymap.of([indentWithTab]), wrap.current.of(settings.wordWrap ? EditorView.lineWrapping : []), theme.current.of(themeExtension()), lang.current.of(language()), EditorView.updateListener.of(update => { if (update.docChanged && !suppress.current) tabs.edit(tab.id, update.state.doc.toString()); if (update.selectionSet || update.docChanged) { const pos = update.state.selection.main.head; const line = update.state.doc.lineAt(pos); tabs.patch(tab.id, { line: line.number, column: pos - line.from + 1 }); } })] }) });
    view.current = editor;
    editorActions.set(`${tab.id}:raw`, action => { editor.focus(); if (action === 'undo') undo(editor); if (action === 'redo') redo(editor); if (action === 'find' || action === 'replace') openSearchPanel(editor); if (action === 'goto') gotoLine(editor); if (action === 'selectAll') selectAll(editor); });
    return () => { editorActions.delete(`${tab.id}:raw`); editor.destroy(); view.current = null; };
  }, []);
  useEffect(() => { const editor = view.current; if (editor && editor.state.doc.toString() !== tab.text) { suppress.current = true; editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: tab.text } }); suppress.current = false; } }, [tab.text]);
  useEffect(() => { view.current?.dispatch({ effects: [wrap.current.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []), theme.current.reconfigure(themeExtension()), lang.current.reconfigure(language())] }); }, [settings, tab.fileType]);
  useEffect(() => { if (visible) { view.current?.requestMeasure(); view.current?.focus(); } }, [visible]);
  return <div ref={root} className="code-editor" aria-label={`${tab.fileType} source editor`} />;
}
