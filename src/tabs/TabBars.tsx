import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { tabs, useTabs, type Pane } from './tabStore';

type Drop = { pane: Pane; target: string | null; before: boolean };
export function TabBars({
  onClose,
  disabled,
}: {
  onClose: (id: string) => void;
  disabled: boolean;
}) {
  const state = useTabs();
  const drag = useRef<{ id: string; pointer: number; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  function finish() {
    drag.current = null;
    setDragged(null);
    setDrop(null);
  }
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drag.current) {
        suppressClick.current = drag.current.moved;
        finish();
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  function destination(x: number, y: number): Drop | null {
    const node = document.elementFromPoint(x, y);
    const bar = node?.closest<HTMLElement>('[data-tab-pane]');
    if (!bar) return null;
    const pane = bar.dataset.tabPane as Pane;
    const bounds = bar.getBoundingClientRect();
    if (x < bounds.left + 28) bar.scrollLeft -= 24;
    if (x > bounds.right - 28) bar.scrollLeft += 24;
    const target = node?.closest<HTMLElement>('[data-tab-id]');
    const rect = target?.getBoundingClientRect();
    return {
      pane,
      target: target?.dataset.tabId || null,
      before: rect ? x < rect.left + rect.width / 2 : false,
    };
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6)
      return;
    event.preventDefault();
    current.moved = true;
    suppressClick.current = true;
    setDragged(current.id);
    const next = destination(event.clientX, event.clientY);
    setDrop((previous) =>
      previous?.pane === next?.pane &&
      previous?.target === next?.target &&
      previous?.before === next?.before
        ? previous
        : next,
    );
  }
  return (
    <div className={`tabbars ${state.split ? 'is-split' : ''}`}>
      {(['primary', ...(state.split ? ['secondary'] : [])] as Pane[]).map((pane) => (
        <nav
          key={pane}
          className={`tabbar ${state.activePane === pane ? 'pane-focused' : ''} ${drop?.pane === pane && !drop.target ? 'drop-end' : ''}`}
          style={{ gridColumn: pane === 'primary' ? 1 : 3 }}
          data-tab-pane={pane}
          aria-label={pane === 'primary' ? 'Documents' : 'Right documents'}
        >
          {state.tabs
            .filter((tab) => tab.pane === pane)
            .map((tab) => (
              <div
                className={`tab ${state.selected[pane] === tab.id ? 'active' : ''} ${dragged === tab.id ? 'dragging' : ''} ${drop?.target === tab.id ? (drop.before ? 'drop-before' : 'drop-after') : ''}`}
                key={tab.id}
                data-tab-id={tab.id}
              >
                <button
                  title={tab.path || tab.name}
                  aria-pressed={state.selected[pane] === tab.id}
                  aria-description="드래그하여 탭 순서를 바꾸거나 다른 영역으로 옮깁니다. Alt+Shift+방향키로도 순서를 바꿀 수 있습니다."
                  draggable={false}
                  onPointerDown={(event) => {
                    if (disabled || event.button !== 0 || drag.current) return;
                    suppressClick.current = false;
                    drag.current = {
                      id: tab.id,
                      pointer: event.pointerId,
                      x: event.clientX,
                      y: event.clientY,
                      moved: false,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={move}
                  onPointerUp={(event) => {
                    const current = drag.current;
                    if (current?.pointer !== event.pointerId) return;
                    if (current.moved && !disabled) {
                      const target = destination(event.clientX, event.clientY);
                      if (target) tabs.move(current.id, target.pane, target.target, target.before);
                    }
                    finish();
                  }}
                  onPointerCancel={() => {
                    suppressClick.current = !!drag.current?.moved;
                    finish();
                  }}
                  onLostPointerCapture={() => {
                    if (drag.current) {
                      suppressClick.current = drag.current.moved;
                      finish();
                    }
                  }}
                  onClick={(event) => {
                    if (suppressClick.current) {
                      event.preventDefault();
                      suppressClick.current = false;
                    } else tabs.select(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (
                      disabled ||
                      !event.altKey ||
                      !event.shiftKey ||
                      !['ArrowLeft', 'ArrowRight'].includes(event.key)
                    )
                      return;
                    event.preventDefault();
                    const group = state.tabs.filter((t) => t.pane === pane);
                    const index = group.findIndex((t) => t.id === tab.id);
                    const before = event.key === 'ArrowLeft';
                    const target = group[index + (before ? -1 : 1)];
                    if (target) tabs.move(tab.id, pane, target.id, before);
                  }}
                >
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
                  disabled={disabled}
                  onClick={() => onClose(tab.id)}
                >
                  ×
                </button>
              </div>
            ))}
          <button
            className="new-tab"
            aria-label={pane === 'primary' ? 'New text tab' : 'New text tab in right pane'}
            onClick={() => {
              tabs.focusPane(pane);
              tabs.new();
            }}
          >
            +
          </button>
        </nav>
      ))}
    </div>
  );
}
