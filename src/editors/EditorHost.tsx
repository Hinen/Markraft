import { useState } from 'react';
import { CodeEditor } from './CodeEditor';
import { RichEditor } from './RichEditor';
import { tabs, type EditorTab } from '../tabs/tabStore';
import type { Settings } from '../settings/settingsStore';
import { useI18n } from '../i18n/i18n';
export function EditorHost({
  tab,
  settings,
  visible,
  focused,
  onError,
}: {
  tab: EditorTab;
  settings: Settings;
  visible: boolean;
  focused: boolean;
  onError: (error: string) => void;
}) {
  const { t } = useI18n();
  const [largeAccepted, setLargeAccepted] = useState(tab.text.length < 750_000);
  const [rawSeen, setRawSeen] = useState(tab.fileType !== 'markdown' || tab.mode === 'raw');
  const rich = tab.fileType === 'markdown' && tab.mode === 'rich';
  if (!rawSeen && !rich) setRawSeen(true);
  return (
    <section
      hidden={!visible}
      className="editor-host"
      aria-label={tab.name}
      data-editor-pane={tab.pane}
      data-focused={focused}
      style={{ gridColumn: tab.pane === 'primary' ? 1 : 3, gridRow: 1 }}
      onPointerDownCapture={() => tabs.select(tab.id)}
      onFocusCapture={() => tabs.select(tab.id)}
    >
      {tab.fileType === 'markdown' && !largeAccepted && rich ? (
        <div className="large-warning">
          <h2>{t('Large Markdown document')}</h2>
          <p>{t('Rich mode may be slow for this document. Choose an editing mode.')}</p>
          <button onClick={() => setLargeAccepted(true)}>{t('Open Rich')}</button>
          <button onClick={() => tabs.patch(tab.id, { mode: 'raw' })}>{t('Open Raw')}</button>
        </div>
      ) : null}
      {tab.fileType === 'markdown' && largeAccepted && (
        <div className="editor-pane" hidden={!rich}>
          <RichEditor
            tab={tab}
            visible={visible && rich}
            focused={focused && rich}
            onError={onError}
          />
        </div>
      )}
      {rawSeen && (
        <div className="editor-pane" hidden={rich}>
          <CodeEditor
            tab={tab}
            settings={settings}
            visible={visible && !rich}
            focused={focused && !rich}
          />
        </div>
      )}
    </section>
  );
}
