import { tabs } from '../tabs/tabStore';
export type EditorAction =
  | 'focus'
  | 'undo'
  | 'redo'
  | 'find'
  | 'replace'
  | 'goto'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'heading'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'
  | 'code'
  | 'link'
  | 'image'
  | 'table'
  | 'rowAdd'
  | 'rowDelete'
  | 'columnAdd'
  | 'columnDelete'
  | 'rule'
  | 'selectAll';
export const editorActions = new Map<string, (action: EditorAction, value?: string) => void>();
export function focusEditor(id = tabs.get().active) {
  const focus = () => {
    if (!id || tabs.get().active !== id || document.querySelector('[role="dialog"]')) return;
    const tab = tabs.get().tabs.find((t) => t.id === id);
    if (tab)
      editorActions.get(`${id}:${tab.fileType === 'markdown' ? tab.mode : 'raw'}`)?.('focus');
  };
  focus();
  requestAnimationFrame(focus);
}
