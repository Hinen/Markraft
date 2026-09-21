import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { tabs, useTabs, type Pane } from './tabStore';
import { focusEditor } from '../editors/editorCommands';

type Drop = {
  pane: Pane;
  target: string | null;
  before: boolean;
  area?: { left: number; top: number; width: number; height: number };
  split?: boolean;
};
export function TabBars({
  onClose,
  disabled,
}: {
  onClose: (id: string) => void;
  disabled: boolean;
}) {
  const state = useTabs();
  const drag = useRef<{
    id: string;
    pointer: number;
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    capture: HTMLButtonElement;
  } | null>(null);
  const suppressClick = useRef(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const animation = useRef<number | null>(null);
  const order = state.tabs.map((t) => `${t.pane}:${t.id}`).join(',');
  function finish() {
    const previous = drag.current;
    drag.current = null;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    if (previous?.capture.hasPointerCapture(previous.pointer))
      previous.capture.releasePointerCapture(previous.pointer);
    setDragged(null);
    setDrop(null);
  }
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drag.current) {
        suppressClick.current = drag.current.moved;
        finish();
        focusEditor();
      }
    };
    window.addEventListener('keydown', cancel);
    const blur = () => {
      if (drag.current) {
        suppressClick.current = drag.current.moved;
        finish();
      }
    };
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', cancel);
      window.removeEventListener('blur', blur);
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (drag.current) return;
      for (const id of Object.values(state.selected)) {
        Array.from(root.current?.querySelectorAll<HTMLElement>('[data-tab-id]') || [])
          .find((el) => el.dataset.tabId === id)
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [order, state.selected.primary, state.selected.secondary]);
  useEffect(() => {
    const element = root.current!;
    const wheel = (event: WheelEvent) => {
      const bar = (event.target as Element).closest<HTMLElement>('[data-tab-pane]');
      if (
        bar &&
        bar.scrollWidth > bar.clientWidth &&
        Math.abs(event.deltaY) > Math.abs(event.deltaX) &&
        !event.shiftKey
      ) {
        event.preventDefault();
        bar.scrollLeft += event.deltaY;
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    if (disabled) finish();
  }, [disabled]);
  function destination(x: number, y: number): Drop | null {
    const layout = tabs.get();
    const node = document.elementFromPoint(x, y);
    const bar = node?.closest<HTMLElement>('[data-tab-pane]');
    if (!bar) {
      const workspace = node?.closest<HTMLElement>('.editor-workspace');
      if (!workspace) return null;
      if (layout.split) {
        const host = node?.closest<HTMLElement>('[data-editor-pane]');
        if (!host) return null;
        const { left, top, width, height } = host.getBoundingClientRect();
        return {
          pane: host.dataset.editorPane as Pane,
          target: null,
          before: false,
          area: { left, top, width, height },
        };
      }
      if (layout.tabs.length < 2) return null;
      const bounds = workspace.getBoundingClientRect();
      const fraction = (x - bounds.left) / bounds.width;
      if (fraction > 0.25 && fraction < 0.75) return null;
      const pane: Pane = fraction <= 0.25 ? 'primary' : 'secondary';
      const ratio =
        Number.parseFloat(getComputedStyle(workspace).getPropertyValue('--split-left')) / 100 ||
        0.5;
      const leftWidth = bounds.width * ratio - 3;
      return {
        pane,
        target: null,
        before: false,
        split: true,
        area: {
          left: bounds.left + (pane === 'secondary' ? leftWidth + 6 : 0),
          top: bounds.top,
          width: pane === 'primary' ? leftWidth : bounds.width - leftWidth - 6,
          height: bounds.height,
        },
      };
    }
    const pane = bar.dataset.tabPane as Pane;
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
    current.lastX = event.clientX;
    current.lastY = event.clientY;
    suppressClick.current = true;
    setDragged(current.id);
    preview(destination(event.clientX, event.clientY));
    if (animation.current === null) animation.current = requestAnimationFrame(scrollDrag);
  }
  function scrollDrag() {
    const current = drag.current;
    if (!current?.moved) {
      animation.current = null;
      return;
    }
    const bar = document
      .elementFromPoint(current.lastX, current.lastY)
      ?.closest<HTMLElement>('[data-tab-pane]');
    if (bar) {
      const bounds = bar.getBoundingClientRect();
      if (current.lastX < bounds.left + 28) bar.scrollLeft -= 10;
      else if (current.lastX > bounds.right - 28) bar.scrollLeft += 10;
    }
    preview(destination(current.lastX, current.lastY));
    animation.current = requestAnimationFrame(scrollDrag);
  }
  function preview(next: Drop | null) {
    setDrop((previous) =>
      previous?.pane === next?.pane &&
      previous?.target === next?.target &&
      previous?.before === next?.before &&
      previous?.area?.left === next?.area?.left &&
      previous?.area?.top === next?.area?.top &&
      previous?.area?.width === next?.area?.width &&
      previous?.area?.height === next?.area?.height &&
      previous?.split === next?.split
        ? previous
        : next,
    );
  }
  return (
    <div ref={root} className={`tabbars ${state.split ? 'is-split' : ''}`}>
      {(['primary', ...(state.split ? ['secondary'] : [])] as Pane[]).map((pane) => (
        <nav
          key={pane}
          className={`tabbar ${state.activePane === pane ? 'pane-focused' : ''} ${drop?.pane === pane && !drop.target && !drop.area ? 'drop-end' : ''}`}
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
                onAuxClick={(event) => {
                  if (event.button === 1) {
                    event.preventDefault();
                    if (!disabled) onClose(tab.id);
                  }
                }}
                onMouseDown={(event) => {
                  if (event.button === 1) event.preventDefault();
                }}
              >
                <button
                  title={tab.path || tab.name}
                  aria-pressed={state.selected[pane] === tab.id}
                  aria-description="탭 표시줄에서 드래그하면 순서가 바뀝니다. 편집 영역의 왼쪽·오른쪽 가장자리에 놓으면 화면이 분할됩니다. Alt+Shift+방향키로도 순서를 바꿀 수 있습니다."
                  draggable={false}
                  onPointerDown={(event) => {
                    if (disabled || event.button !== 0 || drag.current) return;
                    suppressClick.current = false;
                    drag.current = {
                      id: tab.id,
                      pointer: event.pointerId,
                      x: event.clientX,
                      y: event.clientY,
                      lastX: event.clientX,
                      lastY: event.clientY,
                      capture: event.currentTarget,
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
                      if (target?.area) tabs.splitWith(current.id, target.pane);
                      else if (target)
                        tabs.move(current.id, target.pane, target.target, target.before);
                    }
                    finish();
                    if (current.moved) focusEditor();
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
                    } else {
                      tabs.select(tab.id);
                      focusEditor(tab.id);
                    }
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
                          : tab.fileType === 'json'
                            ? '{}'
                            : 'T'}
                  </span>
                  <span className="tab-name">{tab.name}</span>
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
            disabled={disabled}
          >
            +
          </button>
        </nav>
      ))}
      {drop?.area &&
        createPortal(
          <div
            className="tab-drop-preview"
            style={drop.area}
            role="status"
            data-drop-side={drop.pane}
            data-drop-action={drop.split ? 'split' : 'move'}
          >
            <span>
              {drop.split
                ? drop.pane === 'primary'
                  ? '왼쪽으로 분할'
                  : '오른쪽으로 분할'
                : '이 영역으로 이동'}
            </span>
          </div>,
          document.body,
        )}
    </div>
  );
}
