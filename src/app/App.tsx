import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { tabs, useTabs, type EditorTab } from '../tabs/tabStore';
import { TabBars } from '../tabs/TabBars';
import { PaneDivider } from '../tabs/PaneDivider';
import { Modal } from './Modal';
import { files, type DocumentFile } from '../files/fileService';
import { normalize } from '../files/fileTypes';
import { EditorHost } from '../editors/EditorHost';
import { editorActions, focusEditor, type EditorAction } from '../editors/editorCommands';
import { useSettings, setSettings } from '../settings/settingsStore';
type Prompt = {
  id: string;
  title: string;
  message: string;
  choices: string[];
  resolve: (value: string | null) => void;
  input?: string;
};
type MenuItem = [string, string, () => void, boolean?];
export function App() {
  const state = useTabs();
  const settings = useSettings();
  const active = state.tabs.find((t) => t.id === state.active);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const promptRef = useRef<Prompt | null>(null);
  const [input, setInput] = useState('');
  const [preferences, setPreferences] = useState(false);
  const [fontSizeDraft, setFontSizeDraft] = useState(String(settings.fontSize));
  const [menu, setMenu] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const busy = useRef(false);
  const pendingSaves = useRef(new Map<string, boolean>());
  const [working, setWorking] = useState(false);
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  function ask(title: string, message: string, choices: string[], initial?: string) {
    return new Promise<string | null>((resolve) => {
      if (promptRef.current) {
        resolve(null);
        return;
      }
      const request = { id: crypto.randomUUID(), title, message, choices, resolve, input: initial };
      setMenu(null);
      setPreferences(false);
      promptRef.current = request;
      setPrompt(request);
      setInput(initial || '');
    });
  }
  function answer(value: string | null) {
    const pending = promptRef.current;
    promptRef.current = null;
    setPrompt(null);
    pending?.resolve(value);
  }
  async function guarded(task: () => Promise<unknown>) {
    if (busy.current) return;
    setError('');
    busy.current = true;
    setWorking(true);
    try {
      await task();
    } catch (e) {
      setError(String(e));
    } finally {
      busy.current = false;
      setWorking(false);
      const pending = pendingSaves.current.entries().next().value;
      if (pending) {
        pendingSaves.current.delete(pending[0]);
        requestSave(pending[0], pending[1]);
      }
    }
  }
  function requestSave(id: string, saveAs = false) {
    if (busy.current) {
      pendingSaves.current.set(id, saveAs || pendingSaves.current.get(id) || false);
      setNotice('최근 편집 내용의 저장을 기다리고 있습니다.');
      return;
    }
    void guarded(() => save(id, saveAs));
  }
  function getActive() {
    const current = tabs.get();
    return current.tabs.find((t) => t.id === current.active);
  }
  async function open() {
    const docs = await files.open();
    docs.forEach((doc) => tabs.open(doc));
  }
  function reloadIfUnchanged(id: string, text: string, disk: DocumentFile) {
    const latest = tabs.get().tabs.find((t) => t.id === id);
    if (!latest) return;
    if (latest.text !== text) {
      setError(
        '파일을 불러오는 동안 새 편집이 생겼습니다. 입력 내용을 유지했습니다. 다시 불러오려면 Reload를 눌러 주세요.',
      );
      return;
    }
    tabs.reload(id, disk);
  }
  async function resolveConflict(tab: EditorTab) {
    const choice = await ask(
      '파일이 외부에서 변경되었습니다',
      `${tab.name}의 디스크 내용과 편집 중인 내용이 다릅니다.`,
      ['Reload', 'Keep Mine', 'Cancel'],
    );
    if (!choice || choice === 'Cancel') return false;
    const disk = await files.read(tab.path!);
    if (choice === 'Reload') {
      reloadIfUnchanged(tab.id, tab.text, disk);
      return false;
    }
    tabs.patch(tab.id, {
      revision: disk.revision,
      savedText: normalize(disk.text),
      dirty: tabs.get().tabs.find((t) => t.id === tab.id)?.text !== normalize(disk.text),
      conflict: null,
    });
    return true;
  }
  async function save(id: string, saveAs = false): Promise<boolean> {
    let tab = tabs.get().tabs.find((t) => t.id === id);
    if (!tab) return false;
    if (tab.richError) throw new Error(tab.richError);
    if (!saveAs && tab.path) {
      const revision = await files.check(tab.path);
      if (revision !== tab.revision) {
        if (!(await resolveConflict(tab))) return false;
        tab = tabs.get().tabs.find((t) => t.id === id)!;
      }
      if (!tab.dirty) {
        setNotice('변경 사항이 없습니다. 파일을 다시 쓰지 않았습니다.');
        return true;
      }
    }
    const submitted = tab.text;
    const doc = await files.save({
      path: tab.path,
      text: submitted,
      encoding: tab.encoding,
      lineEnding: tab.lineEnding,
      revision: tab.revision,
      saveAs,
      suggestedName: tab.name,
    });
    if (!doc) return false;
    tabs.saved(id, doc, submitted);
    setNotice(`${doc.name} 저장됨`);
    return true;
  }
  async function confirmClose(id: string): Promise<boolean> {
    const tab = tabs.get().tabs.find((t) => t.id === id);
    if (!tab) return true;
    if (tab.dirty) {
      tabs.select(id);
      const choice = await ask('변경 사항을 저장할까요?', tab.path || tab.name, [
        'Save',
        'Discard',
        'Cancel',
      ]);
      if (!choice || choice === 'Cancel') return false;
      if (choice === 'Save' && !(await save(id))) return false;
      if (tabs.get().tabs.find((t) => t.id === id)?.dirty && choice === 'Save') return false;
    }
    return true;
  }
  async function close(id: string): Promise<boolean> {
    if (!(await confirmClose(id))) return false;
    tabs.close(id);
    focusEditor();
    return true;
  }
  async function closeAll() {
    const originalActive = tabs.get().active;
    const closing = [...tabs.get().tabs];
    const confirmedText = new Map<string, string>();
    for (const tab of closing) {
      if (!(await confirmClose(tab.id))) {
        if (originalActive) tabs.select(originalActive);
        focusEditor();
        return false;
      }
      const current = tabs.get().tabs.find((t) => t.id === tab.id);
      if (current) confirmedText.set(tab.id, current.text);
    }
    const changed = tabs
      .get()
      .tabs.find(
        (tab) => confirmedText.has(tab.id) && tab.dirty && tab.text !== confirmedText.get(tab.id),
      );
    if (changed) {
      tabs.select(changed.id);
      setError('닫기를 처리하는 동안 새 편집이 생겼습니다. 모든 탭과 입력 내용을 유지했습니다.');
      focusEditor();
      return false;
    }
    for (const tab of closing) tabs.close(tab.id);
    return tabs.get().tabs.length === 0;
  }
  function toggle() {
    const tab = getActive();
    if (tab?.fileType === 'markdown')
      tabs.patch(tab.id, { mode: tab.mode === 'rich' ? 'raw' : 'rich' });
  }
  async function edit(action: EditorAction, value?: string) {
    const tab = getActive();
    if (!tab) return;
    if (action === 'link' || action === 'image') {
      const result = await ask(
        action === 'link' ? '링크 편집' : '이미지 삽입',
        action === 'link'
          ? 'URL을 입력하세요. 선택한 텍스트에 적용합니다. 빈 URL은 링크를 제거합니다.'
          : '문서 기준 상대 경로 또는 HTTPS URL을 입력하세요.',
        ['Apply', 'Cancel'],
        '',
      );
      if (result === null) return;
      value = result;
    }
    if (
      (action === 'replace' || action === 'goto') &&
      tab.fileType === 'markdown' &&
      tab.mode === 'rich'
    ) {
      tabs.patch(tab.id, { mode: 'raw' });
      requestAnimationFrame(() => editorActions.get(`${tab.id}:raw`)?.(action, value));
      return;
    }
    editorActions.get(`${tab.id}:${tab.fileType === 'markdown' ? tab.mode : 'raw'}`)?.(
      action,
      value,
    );
  }
  const handlers = useRef({ closeAll, close, save, requestSave, open, toggle, edit, guarded });
  handlers.current = { closeAll, close, save, requestSave, open, toggle, edit, guarded };
  useEffect(() => {
    if (preferences) setFontSizeDraft(String(settings.fontSize));
  }, [preferences]);
  useEffect(() => {
    if (!menu) return;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>('.menu button:not(:disabled)')?.focus(),
    );
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        setMenu(null);
        focusEditor();
      }
    };
    window.addEventListener('keydown', dismiss, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', dismiss, true);
    };
  }, [menu]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme =
      settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
    document.documentElement.style.setProperty('--editor-size', `${settings.fontSize}px`);
    document.documentElement.style.setProperty('--editor-font', settings.editorFont);
  }, [settings, systemDark]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    let stopped = false;
    let polling = false;
    const cleanup: (() => void)[] = [];
    async function pending() {
      try {
        const docs = await files.pending();
        if (!stopped)
          docs.forEach((doc) => {
            if ('Ok' in doc) tabs.open(doc.Ok);
            else setError(doc.Err);
          });
      } catch (e) {
        if (!stopped) setError(String(e));
      }
    }
    // Subscribe before draining the queue, so cold-start and second-instance events cannot be lost.
    if (isTauri()) {
      void listen('files-pending', pending).then((unlisten) => {
        if (stopped) unlisten();
        else {
          cleanup.push(unlisten);
          void pending();
        }
      });
      void listen('request-close', () =>
        handlers.current.guarded(async () => {
          if (await handlers.current.closeAll()) await getCurrentWindow().destroy();
        }),
      ).then((unlisten) => {
        if (stopped) unlisten();
        else cleanup.push(unlisten);
      });
      void getCurrentWindow()
        .onCloseRequested(async (event) => {
          event.preventDefault();
          await handlers.current.guarded(async () => {
            if (await handlers.current.closeAll()) await getCurrentWindow().destroy();
          });
        })
        .then((unlisten) => {
          if (stopped) unlisten();
          else cleanup.push(unlisten);
        });
    } else void pending();
    const interval = setInterval(async () => {
      if (polling || busy.current || stopped) return;
      polling = true;
      try {
        for (const tab of tabs.get().tabs) {
          if (!tab.path) continue;
          try {
            const revision = await files.check(tab.path);
            const current = tabs.get().tabs.find((t) => t.id === tab.id);
            if (!current || current.revision !== tab.revision) continue;
            if (revision !== current.revision) {
              if (current.dirty)
                tabs.patch(tab.id, { conflict: '파일이 외부에서 변경되었습니다.' });
              else {
                const disk = await files.read(tab.path);
                const latest = tabs.get().tabs.find((t) => t.id === tab.id);
                if (latest?.dirty)
                  tabs.patch(tab.id, { conflict: '파일이 외부에서 변경되었습니다.' });
                else if (latest && latest.revision === current.revision) tabs.reload(tab.id, disk);
              }
            }
          } catch {
            tabs.patch(tab.id, {
              conflict:
                '파일이 삭제되었거나 접근할 수 없습니다. Save As로 복사본을 저장할 수 있습니다.',
            });
          }
        }
      } finally {
        polling = false;
      }
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(interval);
      cleanup.forEach((fn) => fn());
    };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as Element)?.closest?.('[role="dialog"]')) {
        if (
          (event.ctrlKey || event.metaKey) &&
          ['n', 'w', 'o', 's', 'm', 'tab', 'pageup', 'pagedown'].includes(event.key.toLowerCase())
        )
          event.preventDefault();
        return;
      }
      if (event.isComposing || !(event.ctrlKey || event.metaKey) || promptRef.current) return;
      const key = event.key.toLowerCase();
      if (
        ['b', 'i', 'y'].includes(key) &&
        (event.target as Element)?.closest?.('input,textarea,select')
      )
        return;
      const handler = handlers.current;
      const tab = getActive();
      if (key === 'tab' || key === 'pageup' || key === 'pagedown') {
        event.preventDefault();
        tabs.cycle(key === 'pageup' || (key === 'tab' && event.shiftKey) ? -1 : 1);
        focusEditor();
      } else if (key === 'n') {
        event.preventDefault();
        tabs.new(event.shiftKey ? 'markdown' : 'text');
      } else if (key === 'o') {
        event.preventDefault();
        void handler.guarded(handler.open);
      } else if (key === 's') {
        event.preventDefault();
        if (tab) handler.requestSave(tab.id, event.shiftKey);
      } else if (key === 'w') {
        event.preventDefault();
        void handler.guarded(() =>
          event.shiftKey ? handler.closeAll() : tab ? handler.close(tab.id) : Promise.resolve(),
        );
      } else if (key === 'm' && event.shiftKey) {
        event.preventDefault();
        handler.toggle();
      } else if (
        ['f', 'h', 'g'].includes(key) ||
        (tab?.mode === 'rich' && tab.fileType === 'markdown' && ['b', 'i', 'y'].includes(key))
      ) {
        event.preventDefault();
        void handler.edit(
          ({ f: 'find', h: 'replace', g: 'goto', b: 'bold', i: 'italic', y: 'redo' } as const)[
            key as 'f'
          ],
        );
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, []);
  const fileMenu: MenuItem[] = [
    ['New text', 'Ctrl+N', () => tabs.new()],
    ['New Markdown', 'Ctrl+Shift+N', () => tabs.new('markdown')],
    ['Open…', 'Ctrl+O', () => void guarded(open)],
    ['Save', 'Ctrl+S', () => active && requestSave(active.id), !active],
    ['Save As…', 'Ctrl+Shift+S', () => active && requestSave(active.id, true), !active],
    ['Close tab', 'Ctrl+W', () => active && void guarded(() => close(active.id)), !active],
    ['Close all tabs', 'Ctrl+Shift+W', () => void guarded(closeAll), !state.tabs.length],
  ];
  const editMenu: MenuItem[] = [
    ['Undo', 'Ctrl+Z', () => void edit('undo')],
    ['Redo', 'Ctrl+Y', () => void edit('redo')],
    ['Find', 'Ctrl+F', () => void edit('find')],
    ['Replace', 'Ctrl+H', () => void edit('replace')],
    ['Go to line', 'Ctrl+G', () => void edit('goto')],
    ['Select all', 'Ctrl+A', () => void edit('selectAll')],
  ];
  const viewMenu: MenuItem[] = [
    ['Rich / Raw', 'Ctrl+Shift+M', toggle, active?.fileType !== 'markdown'],
    [
      state.split ? 'Merge panes' : 'Split view',
      '',
      () => (state.split ? tabs.mergePanes() : tabs.splitView()),
      !state.split && state.tabs.length < 2,
    ],
    ...(state.split
      ? [
          [
            'Move tab to other pane',
            '',
            () => {
              const tab = getActive();
              if (tab) tabs.move(tab.id, tab.pane === 'primary' ? 'secondary' : 'primary');
            },
          ] as [string, string, () => void],
        ]
      : []),
    [
      'Word wrap',
      settings.wordWrap ? 'On' : 'Off',
      () => setSettings({ wordWrap: !settings.wordWrap }),
    ],
    ['Settings…', '', () => setPreferences(true)],
  ];
  return (
    <main style={{ '--split-left': `${splitRatio * 100}%` } as CSSProperties}>
      <header className="menubar">
        <div className="brand">
          <span className="brand-icon">M</span>Markraft
        </div>
        {['File', 'Edit', 'View', 'Help'].map((name) => (
          <div className="menu-wrap" key={name}>
            <button
              className={menu === name ? 'selected' : ''}
              onClick={() => setMenu(menu === name ? null : name)}
              aria-haspopup="menu"
              aria-expanded={menu === name}
              onPointerEnter={() => {
                if (menu && menu !== name) setMenu(name);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setMenu(name);
                }
              }}
            >
              {name}
            </button>
            {menu === name && (
              <>
                <button
                  className="menu-backdrop"
                  aria-label="Close menu"
                  onClick={() => setMenu(null)}
                />
                <div
                  className="menu"
                  role="menu"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setMenu(null);
                      focusEditor();
                    }
                    const items = Array.from(
                      event.currentTarget.querySelectorAll<HTMLButtonElement>(
                        'button:not(:disabled)',
                      ),
                    );
                    if (
                      items.length &&
                      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
                    ) {
                      event.preventDefault();
                      const index = items.indexOf(document.activeElement as HTMLButtonElement);
                      items[
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? items.length - 1
                            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
                              items.length
                      ].focus();
                    }
                    if (event.key === 'Tab') setMenu(null);
                  }}
                >
                  {(name === 'File'
                    ? fileMenu
                    : name === 'Edit'
                      ? editMenu
                      : name === 'View'
                        ? viewMenu
                        : ([
                            [
                              'About Markraft',
                              '',
                              () => {
                                setNotice(
                                  'Markraft 0.1 · Local-first. No ads, accounts, telemetry or cloud.',
                                );
                              },
                            ],
                          ] as MenuItem[])
                  ).map(([label, shortcut, action, disabled]) => (
                    <button
                      role="menuitem"
                      key={label}
                      disabled={disabled || (name === 'Edit' && !active)}
                      onClick={() => {
                        setMenu(null);
                        action();
                      }}
                    >
                      <span>{label}</span>
                      <kbd>{shortcut}</kbd>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
        <span className="local-badge">● Local only</span>
        <button
          className="split-toggle"
          aria-label={state.split ? 'Merge panes' : 'Split view'}
          title={
            state.split
              ? '화면 분할 해제'
              : state.tabs.length < 2
                ? '문서를 두 개 이상 열면 분할할 수 있습니다'
                : '화면을 좌우로 나누기'
          }
          disabled={!state.split && state.tabs.length < 2}
          aria-pressed={state.split}
          onClick={() => (state.split ? tabs.mergePanes() : tabs.splitView())}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" />
            <path d="M8 3v10" stroke="currentColor" />
          </svg>
          {state.split ? 'Merge' : 'Split'}
        </button>
      </header>
      <TabBars
        onClose={(id) => void guarded(() => close(id))}
        disabled={working || !!prompt || preferences}
      />
      {active && (
        <div className="toolbar">
          <span className="document-name" title={active.path || active.name}>
            {active.name}
          </span>
          {active.fileType === 'markdown' && (
            <>
              <div className="mode-switch">
                <button
                  className={active.mode === 'rich' ? 'selected' : ''}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    tabs.patch(active.id, { mode: 'rich' });
                    focusEditor();
                  }}
                >
                  Rich
                </button>
                <button
                  className={active.mode === 'raw' ? 'selected' : ''}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    tabs.patch(active.id, { mode: 'raw' });
                    focusEditor();
                  }}
                >
                  Raw
                </button>
              </div>
              {active.mode === 'rich' && (
                <div className="format-tools">
                  <select
                    aria-label="Heading level"
                    defaultValue=""
                    onChange={(e) => {
                      void edit('heading', e.target.value);
                      e.target.value = '';
                    }}
                  >
                    <option value="" disabled>
                      Text style
                    </option>
                    <option value="0">Paragraph</option>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        Heading {n}
                      </option>
                    ))}
                  </select>
                  {(
                    [
                      ['B', 'bold'],
                      ['I', 'italic'],
                      ['S̶', 'strike'],
                      ['`', 'code'],
                      ['• List', 'bullet'],
                      ['1.', 'ordered'],
                      ['☑', 'task'],
                      ['❝', 'quote'],
                      ['Link', 'link'],
                      ['Image', 'image'],
                      ['Table', 'table'],
                      ['+Row', 'rowAdd'],
                      ['−Row', 'rowDelete'],
                      ['+Col', 'columnAdd'],
                      ['−Col', 'columnDelete'],
                      ['―', 'rule'],
                    ] as [string, EditorAction][]
                  ).map(([label, action]) => (
                    <button
                      key={action}
                      title={action}
                      aria-label={action}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void edit(action)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <button
            className="save-button"
            disabled={working}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => requestSave(active.id)}
          >
            Save
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="banner error">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
      {active?.conflict && (
        <div role="alert" className="banner conflict">
          <span>{active.conflict}</span>
          {active.conflict.startsWith('파일이 삭제') ? (
            <button onClick={() => void guarded(() => save(active.id, true))}>Save As…</button>
          ) : (
            <>
              <button
                onClick={() =>
                  void guarded(async () => {
                    const choice = await ask(
                      '디스크 내용 다시 불러오기',
                      '저장하지 않은 편집 내용은 사라집니다.',
                      ['Reload', 'Cancel'],
                    );
                    if (choice === 'Reload') {
                      const text = tabs.get().tabs.find((t) => t.id === active.id)?.text;
                      const disk = await files.read(active.path!);
                      if (text !== undefined) reloadIfUnchanged(active.id, text, disk);
                    }
                  })
                }
              >
                Reload
              </button>
              <button
                onClick={() =>
                  void guarded(async () => {
                    const doc = await files.read(active.path!);
                    tabs.patch(active.id, {
                      revision: doc.revision,
                      savedText: normalize(doc.text),
                      dirty:
                        tabs.get().tabs.find((t) => t.id === active.id)?.text !==
                        normalize(doc.text),
                      conflict: null,
                    });
                  })
                }
              >
                Keep Mine
              </button>
            </>
          )}
        </div>
      )}
      {!state.tabs.length && (
        <div className="welcome">
          <div className="welcome-mark">
            M<span>↓</span>
          </div>
          <p className="eyebrow">YOUR WORDS. YOUR FILES.</p>
          <h1>A little space to think.</h1>
          <p>
            텍스트는 가볍게, Markdown은 문서처럼.
            <br />
            모든 파일은 내 컴퓨터에만 머무릅니다.
          </p>
          <div className="welcome-actions">
            <button className="primary" onClick={() => void guarded(open)}>
              Open a file <kbd>Ctrl O</kbd>
            </button>
            <button onClick={() => tabs.new('markdown')}>New Markdown</button>
          </div>
          <p className="file-types">
            MD · TXT · YAML · XML <span>파일을 여기로 끌어 놓으세요</span>
          </p>
        </div>
      )}
      {!!state.tabs.length && (
        <div className={`editor-workspace ${state.split ? 'is-split' : ''}`}>
          {state.tabs.map((tab) => (
            <EditorHost
              key={tab.id}
              tab={tab}
              settings={settings}
              visible={state.selected[tab.pane] === tab.id}
              focused={state.active === tab.id}
              onError={setError}
            />
          ))}
          {state.split && <PaneDivider ratio={splitRatio} onResize={setSplitRatio} />}
        </div>
      )}
      <footer className="statusbar">
        <span>{notice || (active ? `Ln ${active.line}, Col ${active.column}` : 'Ready')}</span>
        <div>
          {active && (
            <>
              <span>{active.encoding}</span>
              <span>{active.lineEnding}</span>
              <span>
                {active.fileType === 'markdown'
                  ? `Markdown / ${active.mode === 'rich' ? 'Rich' : 'Raw'}`
                  : active.fileType.toUpperCase()}
              </span>
              {active.dirty && <span>Modified</span>}
            </>
          )}
          <button onClick={() => setPreferences(true)}>⚙</button>
        </div>
      </footer>
      {prompt && (
        <Modal key={prompt.id} titleId="prompt-title" onCancel={() => answer(null)}>
          <h2 id="prompt-title">{prompt.title}</h2>
          <p>{prompt.message}</p>
          {prompt.input !== undefined && (
            <input
              autoFocus
              aria-label="URL or relative path"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) answer(input);
              }}
            />
          )}
          <div className="dialog-actions">
            {prompt.choices.map((choice, i) => (
              <button
                key={choice}
                autoFocus={i === 0 && prompt.input === undefined}
                className={i === 0 ? 'primary' : ''}
                onClick={() =>
                  answer(choice === 'Cancel' ? null : prompt.input !== undefined ? input : choice)
                }
              >
                {choice}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {preferences && (
        <Modal titleId="settings-title" onCancel={() => setPreferences(false)}>
          <h2 id="settings-title">Editor settings</h2>
          <label>
            Theme
            <select
              value={settings.theme}
              onChange={(e) => setSettings({ theme: e.target.value as typeof settings.theme })}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Font size
            <input
              type="number"
              min={10}
              max={32}
              value={fontSizeDraft}
              onChange={(e) => {
                setFontSizeDraft(e.target.value);
                const size = Number(e.target.value);
                if (size >= 10 && size <= 32) setSettings({ fontSize: size });
              }}
              onBlur={() => {
                const parsed = Number(fontSizeDraft);
                const size =
                  fontSizeDraft && Number.isFinite(parsed)
                    ? Math.max(10, Math.min(32, parsed))
                    : settings.fontSize;
                setFontSizeDraft(String(size));
                setSettings({ fontSize: size });
              }}
            />
          </label>
          <label>
            Editor font
            <input
              value={settings.editorFont}
              onChange={(e) => setSettings({ editorFont: e.target.value })}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.wordWrap}
              onChange={(e) => setSettings({ wordWrap: e.target.checked })}
            />
            Word wrap
          </label>
          <p className="muted">설정만 기기에 저장됩니다. 문서 내용은 설정에 저장하지 않습니다.</p>
          <div className="dialog-actions">
            <button className="primary" onClick={() => setPreferences(false)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
