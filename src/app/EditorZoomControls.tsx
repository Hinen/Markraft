import { useI18n } from '../i18n/i18n';
import { MIN_EDITOR_ZOOM, MAX_EDITOR_ZOOM, EDITOR_ZOOM_PRESETS } from '../settings/editorZoom';
import { adjustEditorZoom, setEditorZoom } from './editorZoom';

export function EditorZoomControls({ zoom }: { zoom: number }) {
  const { t } = useI18n();
  const options = [...new Set([...EDITOR_ZOOM_PRESETS, zoom])].sort((a, b) => a - b);
  return (
    <div className="editor-zoom-controls" role="group" aria-label={t('Document zoom')}>
      <button
        aria-label={t('Zoom out')}
        title={`${t('Zoom out')} (Ctrl+-)`}
        disabled={zoom <= MIN_EDITOR_ZOOM}
        onClick={() => adjustEditorZoom(-1)}
      >
        −
      </button>
      <select
        aria-label={t('Document zoom')}
        title={t('Document zoom · Ctrl+wheel · Ctrl+0 to reset')}
        value={zoom}
        onChange={(event) => setEditorZoom(Number(event.target.value))}
      >
        {options.map((value) => (
          <option key={value} value={value}>
            {value}%
          </option>
        ))}
      </select>
      <button
        aria-label={t('Zoom in')}
        title={`${t('Zoom in')} (Ctrl++)`}
        disabled={zoom >= MAX_EDITOR_ZOOM}
        onClick={() => adjustEditorZoom(1)}
      >
        +
      </button>
    </div>
  );
}
