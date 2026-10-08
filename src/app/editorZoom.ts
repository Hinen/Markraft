import { useEffect } from 'react';
import { getSettings, setSettings } from '../settings/settingsStore';
import { EDITOR_ZOOM_STEP, normalizeEditorZoom } from '../settings/editorZoom';

export function setEditorZoom(value: number) {
  const editorZoom = normalizeEditorZoom(value);
  if (editorZoom !== getSettings().editorZoom) setSettings({ editorZoom });
}

export function adjustEditorZoom(direction: number) {
  setEditorZoom(getSettings().editorZoom + direction * EDITOR_ZOOM_STEP);
}

export function useEditorZoomWheel(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let accumulated = 0;
    let lastEvent = -Infinity;
    let lastStep = -Infinity;
    const wheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      // Own modified wheel input so the webview cannot zoom the entire application.
      event.preventDefault();
      if (
        document.querySelector('main')?.inert ||
        !(event.target instanceof Element) ||
        !event.target.closest('.code-editor, .rich-scroll')
      )
        return;
      event.stopPropagation();
      if (!event.deltaY) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 800 : 1);
      const now = performance.now();
      if (now - lastEvent > 200 || Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0;
      lastEvent = now;
      accumulated += delta;
      // Accumulate fine trackpad input and limit rapid gestures to one step per 80 ms.
      if (Math.abs(accumulated) < 100 || now - lastStep < 80) return;
      adjustEditorZoom(accumulated < 0 ? 1 : -1);
      accumulated = 0;
      lastStep = now;
    };
    window.addEventListener('wheel', wheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', wheel, true);
  }, [ready]);
}
