import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { focusEditor } from '../editors/editorCommands';

export function Modal({
  titleId,
  onCancel,
  children,
}: {
  titleId: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const main = document.querySelector('main');
    if (main) main.inert = true;
    root.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    return () => {
      if (main) main.inert = false;
      focusEditor();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={root}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.isPropagationStopped()) return;
          if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
          if (event.key === 'Tab') {
            const controls = Array.from(
              root.current!.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
              ),
            ).filter((el) => el.getClientRects().length);
            if (!controls.length) return;
            event.preventDefault();
            const index = controls.indexOf(document.activeElement as HTMLElement);
            controls[
              (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
            ].focus();
          }
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
