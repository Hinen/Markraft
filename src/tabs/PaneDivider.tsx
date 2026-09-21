import { useI18n } from '../i18n/i18n';
export function PaneDivider({
  ratio,
  onResize,
}: {
  ratio: number;
  onResize: (ratio: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="pane-divider"
      role="separator"
      aria-label={t('Resize editor panes')}
      aria-orientation="vertical"
      aria-valuemin={25}
      aria-valuemax={75}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button === 0) {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
        onResize(Math.max(0.25, Math.min(0.75, (event.clientX - bounds.left) / bounds.width)));
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onDoubleClick={() => onResize(0.5)}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
        event.preventDefault();
        onResize(
          event.key === 'Home'
            ? 0.5
            : Math.max(0.25, Math.min(0.75, ratio + (event.key === 'ArrowLeft' ? -0.05 : 0.05))),
        );
      }}
    />
  );
}
