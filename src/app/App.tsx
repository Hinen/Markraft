import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { tabs, useTabs, type EditorTab } from '../tabs/tabStore';
import { files } from '../files/fileService';
import { normalize } from '../files/fileTypes';
import { EditorHost } from '../editors/EditorHost';
import { editorActions, type EditorAction } from '../editors/editorCommands';
import { useSettings, setSettings } from '../settings/settingsStore';
type Prompt = {
  title: string;
  message: string;
  choices: string[];
  resolve: (value: string | null) => void;
  input?: string;
};
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
  const [menu, setMenu] = useState<string | null>(null);
  const busy = useRef(false);
  const [working, setWorking] = useState(false);
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  function ask(title: string, message: string, choices: string[], initial?: string) {
    return new Promise<string | null>((resolve) => {
      if (promptRef.current) {
        resolve(null);
        return;
      }
      const request = { title, message, choices, resolve, input: initial };
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
    busy.current = true;
    setWorking(true);
    try {
      await task();
    } catch (e) {
      setError(String(e));
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }
  function getActive() {
    const current = tabs.get();
    return current.tabs.find((t) => t.id === current.active);
  }
  async function open() {
    const docs = await files.open();
    docs.forEach((doc) => tabs.open(doc));
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
      tabs.reload(tab.id, disk);
      return false;
    }
    tabs.patch(tab.id, {
      revision: disk.revision,
      savedText: normalize(disk.text),
      dirty: tab.text !== normalize(disk.text),
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
  async function close(id: string): Promise<boolean> {
    const tab = tabs.get().tabs.find((t) => t.id === id);
    if (!tab) return true;
    if (tab.dirty) {
      tabs.select(id);
      const choice = await ask('변경 사항을 저장할까요?', tab.name, ['Save', 'Discard', 'Cancel']);
      if (!choice || choice === 'Cancel') return false;
      if (choice === 'Save' && !(await save(id))) return false;
      if (tabs.get().tabs.find((t) => t.id === id)?.dirty && choice === 'Save') return false;
    }
    tabs.close(id);
    return true;
  }
  async function closeAll() {
    for (const tab of [...tabs.get().tabs]) if (!(await close(tab.id))) return false;
    return true;
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
  const handlers = useRef({ closeAll, close, save, open, toggle, edit, guarded });
  handlers.current = { closeAll, close, save, open, toggle, edit, guarded };
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
                else if (latest) tabs.reload(tab.id, disk);
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
      if (event.isComposing || !(event.ctrlKey || event.metaKey) || promptRef.current) return;
      const key = event.key.toLowerCase();
      const handler = handlers.current;
      const tab = getActive();
      if (key === 'n') {
        event.preventDefault();
        tabs.new(event.shiftKey ? 'markdown' : 'text');
      } else if (key === 'o') {
        event.preventDefault();
        void handler.guarded(handler.open);
      } else if (key === 's') {
        event.preventDefault();
        if (tab) void handler.guarded(() => handler.save(tab.id, event.shiftKey));
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
  const fileMenu: [string, string, () => void][] = [
    ['New text', 'Ctrl+N', () => tabs.new()],
    ['New Markdown', 'Ctrl+Shift+N', () => tabs.new('markdown')],
    ['Open…', 'Ctrl+O', () => void guarded(open)],
    ['Save', 'Ctrl+S', () => active && void guarded(() => save(active.id))],
    ['Save As…', 'Ctrl+Shift+S', () => active && void guarded(() => save(active.id, true))],
    ['Close tab', 'Ctrl+W', () => active && void guarded(() => close(active.id))],
    ['Close all tabs', 'Ctrl+Shift+W', () => void guarded(closeAll)],
  ];
  const editMenu: [string, string, () => void][] = [
    ['Undo', 'Ctrl+Z', () => void edit('undo')],
    ['Redo', 'Ctrl+Y', () => void edit('redo')],
    ['Find', 'Ctrl+F', () => void edit('find')],
    ['Replace', 'Ctrl+H', () => void edit('replace')],
    ['Go to line', 'Ctrl+G', () => void edit('goto')],
    ['Select all', 'Ctrl+A', () => void edit('selectAll')],
  ];
  const viewMenu: [string, string, () => void][] = [
    ['Rich / Raw', 'Ctrl+Shift+M', toggle],
    [
      'Word wrap',
      settings.wordWrap ? 'On' : 'Off',
      () => setSettings({ wordWrap: !settings.wordWrap }),
    ],
    ['Settings…', '', () => setPreferences(true)],
  ];
  return (
    <main>
      <header className="menubar">
        <div className="brand">
          <span className="brand-icon">M</span>Markraft
        </div>
        {['File', 'Edit', 'View', 'Help'].map((name) => (
          <div className="menu-wrap" key={name}>
            <button
              className={menu === name ? 'selected' : ''}
              onClick={() => setMenu(menu === name ? null : name)}
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
                <div className="menu" role="menu">
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
                          ] as [string, string, () => void][])
                  ).map(([label, shortcut, action]) => (
                    <button
                      role="menuitem"
                      key={label}
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
      </header>
      <nav className="tabbar" aria-label="Documents">
        {state.tabs.map((tab) => (
          <div className={`tab ${state.active === tab.id ? 'active' : ''}`} key={tab.id}>
            <button title={tab.path || tab.name} onClick={() => tabs.select(tab.id)}>
              <span className="file-icon">
                {tab.fileType === 'markdown'
                  ? 'M↓'
                  : tab.fileType === 'xml'
                    ? '‹/›'
                    : tab.fileType === 'yaml'
                      ? 'Y'
                      : 'T'}
              </span>
              {tab.name}
              {tab.dirty && (
                <span aria-label="Unsaved changes" className="dirty">
                  ●
                </span>
              )}
            </button>
            <button
              className="tab-close"
              aria-label={`Close ${tab.name}`}
              onClick={() => void guarded(() => close(tab.id))}
            >
              ×
            </button>
          </div>
        ))}
        <button className="new-tab" aria-label="New text tab" onClick={() => tabs.new()}>
          +
        </button>
      </nav>
      {active && (
        <div className="toolbar">
          <span className="document-name">{active.name}</span>
          {active.fileType === 'markdown' && (
            <>
              <div className="mode-switch">
                <button
                  className={active.mode === 'rich' ? 'selected' : ''}
                  onClick={() => tabs.patch(active.id, { mode: 'rich' })}
                >
                  Rich
                </button>
                <button
                  className={active.mode === 'raw' ? 'selected' : ''}
                  onClick={() => tabs.patch(active.id, { mode: 'raw' })}
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
            onClick={() => void guarded(() => save(active.id))}
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
          <button
            onClick={() =>
              void guarded(async () => {
                const choice = await ask(
                  '디스크 내용 다시 불러오기',
                  '저장하지 않은 편집 내용은 사라집니다.',
                  ['Reload', 'Cancel'],
                );
                if (choice === 'Reload') tabs.reload(active.id, await files.read(active.path!));
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
                  dirty: active.text !== normalize(doc.text),
                  conflict: null,
                });
              })
            }
          >
            Keep Mine
          </button>
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
      {state.tabs.map((tab) => (
        <EditorHost
          key={tab.id}
          tab={tab}
          settings={settings}
          active={state.active === tab.id}
          onError={setError}
        />
      ))}
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
        <div className="modal-backdrop">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') answer(null);
            }}
          >
            <h2 id="prompt-title">{prompt.title}</h2>
            <p>{prompt.message}</p>
            {prompt.input !== undefined && (
              <input
                autoFocus
                aria-label="URL or relative path"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') answer(input);
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
          </div>
        </div>
      )}
      {preferences && (
        <div className="modal-backdrop">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
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
                value={settings.fontSize}
                onChange={(e) =>
                  setSettings({ fontSize: Math.max(10, Math.min(32, Number(e.target.value))) })
                }
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
          </div>
        </div>
      )}
    </main>
  );
}
