import { useState } from 'react';
import { CodeEditor } from './CodeEditor';
import { RichEditor } from './RichEditor';
import { tabs, type EditorTab } from '../tabs/tabStore';
import type { Settings } from '../settings/settingsStore';
export function EditorHost({ tab, settings, active, onError }: { tab: EditorTab; settings: Settings; active: boolean; onError: (error: string) => void }) {
  const [largeAccepted, setLargeAccepted] = useState(tab.text.length < 750_000); const [rawSeen, setRawSeen] = useState(tab.fileType !== 'markdown' || tab.mode === 'raw');
  const rich = tab.fileType === 'markdown' && tab.mode === 'rich';
  if (!rawSeen && !rich) setRawSeen(true);
  return <section hidden={!active} className="editor-host" aria-label={tab.name}>
    {tab.fileType === 'markdown' && !largeAccepted && rich ? <div className="large-warning"><h2>큰 Markdown 문서입니다</h2><p>Rich 모드는 문서 크기에 따라 느릴 수 있습니다. 원하는 편집 모드를 선택하세요.</p><button onClick={() => setLargeAccepted(true)}>Open Rich</button><button onClick={() => tabs.patch(tab.id, { mode: 'raw' })}>Open Raw</button></div> : null}
    {tab.fileType === 'markdown' && largeAccepted && <div className="editor-pane" hidden={!rich}><RichEditor tab={tab} visible={active && rich} onError={onError}/></div>}
    {rawSeen && <div className="editor-pane" hidden={rich}><CodeEditor tab={tab} settings={settings} visible={active && !rich}/></div>}
  </section>;
}
