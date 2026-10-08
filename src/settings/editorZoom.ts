export const MIN_EDITOR_ZOOM = 50;
export const MAX_EDITOR_ZOOM = 200;
export const EDITOR_ZOOM_STEP = 10;
export const EDITOR_ZOOM_PRESETS = [50, 75, 100, 125, 150, 200];

export function normalizeEditorZoom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(MIN_EDITOR_ZOOM, Math.min(MAX_EDITOR_ZOOM, Math.round(value)))
    : 100;
}
