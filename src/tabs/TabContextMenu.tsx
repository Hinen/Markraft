import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/i18n';
import type { EditorTab } from './tabStore';

export function TabContextMenu({
  target,
  x,
  y,
  tabs,
  onClose,
  onCloseMany,
  dismiss,
}: {
  target: EditorTab;
  x: number;
  y: number;
  tabs: EditorTab[];
  onClose: (id: string) => void;
  onCloseMany: (ids: string[]) => void;
  dismiss: (restoreFocus?: boolean) => void;
}) {
  const { t } = useI18n();
  const paneTabs = tabs.filter((tab) => tab.pane === target.pane);
  const root = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useLayoutEffect(() => {
    const menu = root.current!;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  }, [x, y, target.id]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) dismissRef.current(false);
    };
    const close = () => dismissRef.current(false);
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    const scroll = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('scroll', scroll, true);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, []);
  const run = (action: () => void) => {
    dismiss(false);
    action();
  };
  return createPortal(
    <div
      ref={root}
      className="menu tab-context-menu"
      role="menu"
      data-tab-context-menu
      aria-label={t('Tab actions for {name}', { name: target.name })}
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (['Escape', 'Tab'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          dismiss(true);
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const items = Array.from(
          root.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        );
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}
    >
      <button role="menuitem" onClick={() => run(() => onClose(target.id))}>
        {t('Close tab')}
      </button>
      <button
        role="menuitem"
        disabled={paneTabs.length < 2}
        onClick={() =>
          run(() =>
            onCloseMany(paneTabs.filter((tab) => tab.id !== target.id).map((tab) => tab.id)),
          )
        }
      >
        {t('Close other tabs')}
      </button>
      <button role="menuitem" onClick={() => run(() => onCloseMany(paneTabs.map((tab) => tab.id)))}>
        {t('Close all tabs')}
      </button>
    </div>,
    document.body,
  );
}
