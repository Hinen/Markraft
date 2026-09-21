import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab, undo, redo, selectAll } from '@codemirror/commands';
import {
  openSearchPanel,
  closeSearchPanel,
  searchPanelOpen,
  getSearchQuery,
  setSearchQuery,
  gotoLine,
} from '@codemirror/search';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { xml } from '@codemirror/lang-xml';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter, lintGutter } from '@codemirror/lint';
import { syntaxTheme } from './syntaxTheme';
import type { EditorTab } from '../tabs/tabStore';
import { tabs } from '../tabs/tabStore';
import type { Settings } from '../settings/settingsStore';
import { editorActions } from './editorCommands';
import { useI18n, editorPhrases } from '../i18n/i18n';
export function CodeEditor({
  tab,
  settings,
  visible,
  focused,
}: {
  tab: EditorTab;
  settings: Settings;
  visible: boolean;
  focused: boolean;
}) {
  const { t, locale } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const suppress = useRef(false);
  const wrap = useRef(new Compartment());
  const theme = useRef(new Compartment());
  const lang = useRef(new Compartment());
  const phrases = useRef(new Compartment());
  const previousLocale = useRef(locale);
  const jsonLint = jsonParseLinter();
  const language = () =>
    tab.fileType === 'markdown'
      ? markdown()
      : tab.fileType === 'yaml'
        ? yaml()
        : tab.fileType === 'xml'
          ? xml()
          : tab.fileType === 'json'
            ? [
                json(),
                linter((view) =>
                  jsonLint(view).map((diagnostic) => {
                    const line = view.state.doc.lineAt(diagnostic.from);
                    return {
                      ...diagnostic,
                      message: t(
                        'Invalid JSON at line {line}, column {column}. Check quotes, commas and brackets.',
                        { line: line.number, column: diagnostic.from - line.from + 1 },
                      ),
                    };
                  }),
                ),
                lintGutter(),
              ]
            : [];
  const themeExtension = () =>
    EditorView.theme(
      {
        '&': {
          height: '100%',
          fontSize: `${settings.fontSize}px`,
          color: 'var(--text)',
          backgroundColor: 'var(--surface)',
        },
        '.cm-scroller': { fontFamily: settings.editorFont, overflow: 'auto' },
        '.cm-content': { padding: '24px 0' },
        '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--muted)', border: 'none' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--hover)' },
        '.cm-cursor': { borderLeftColor: 'var(--text)' },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
          backgroundColor: 'var(--selection)',
        },
        '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--text)' },
        '.cm-tooltip': {
          backgroundColor: 'var(--panel)',
          color: 'var(--text)',
          border: '1px solid var(--line)',
        },
      },
      { dark: document.documentElement.dataset.theme === 'dark' },
    );
  useEffect(() => {
    const editor = new EditorView({
      parent: root.current!,
      state: EditorState.create({
        doc: tab.text,
        extensions: [
          basicSetup,
          syntaxTheme,
          phrases.current.of(EditorState.phrases.of(editorPhrases())),
          keymap.of([indentWithTab]),
          wrap.current.of(settings.wordWrap ? EditorView.lineWrapping : []),
          theme.current.of(themeExtension()),
          lang.current.of(language()),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !suppress.current)
              tabs.edit(tab.id, update.state.doc.toString());
            if (update.selectionSet || update.docChanged) {
              const pos = update.state.selection.main.head;
              const line = update.state.doc.lineAt(pos);
              tabs.patch(tab.id, { line: line.number, column: pos - line.from + 1 });
            }
          }),
        ],
      }),
    });
    view.current = editor;
    editorActions.set(`${tab.id}:raw`, (action) => {
      editor.focus();
      if (action === 'undo') undo(editor);
      if (action === 'redo') redo(editor);
      if (action === 'find' || action === 'replace') openSearchPanel(editor);
      if (action === 'goto') gotoLine(editor);
      if (action === 'selectAll') selectAll(editor);
    });
    return () => {
      editorActions.delete(`${tab.id}:raw`);
      editor.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (visible && editor && editor.state.doc.toString() !== tab.text) {
      suppress.current = true;
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: tab.text } });
      suppress.current = false;
    }
  }, [tab.text, visible]);
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const languageChanged = previousLocale.current !== locale;
    previousLocale.current = locale;
    const searchOpen = languageChanged && searchPanelOpen(editor.state);
    const query = getSearchQuery(editor.state);
    const focusedElement = document.activeElement as HTMLElement | null;
    if (searchOpen) closeSearchPanel(editor);
    editor.dispatch({
      effects: [
        wrap.current.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []),
        theme.current.reconfigure(themeExtension()),
        lang.current.reconfigure(language()),
        phrases.current.reconfigure(EditorState.phrases.of(editorPhrases())),
      ],
    });
    if (searchOpen) {
      openSearchPanel(editor);
      editor.dispatch({ effects: setSearchQuery.of(query) });
      if (focusedElement?.isConnected) focusedElement.focus();
    }
  }, [settings, tab.fileType, locale]);
  useEffect(() => {
    const updateTheme = () =>
      view.current?.dispatch({ effects: theme.current.reconfigure(themeExtension()) });
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [settings]);
  useEffect(() => {
    if (visible) {
      view.current?.requestMeasure();
      if (focused && !root.current?.contains(document.activeElement)) view.current?.focus();
    }
  }, [visible, focused]);
  return (
    <div
      ref={root}
      className="code-editor"
      aria-label={t('{type} source editor', { type: tab.fileType })}
    />
  );
}
