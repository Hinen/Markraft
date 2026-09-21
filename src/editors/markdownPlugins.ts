import { $prose } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import type { Node } from '@milkdown/kit/prose/model';
import { files } from '../files/fileService';
export function safeLink(url: string) { try { return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol); } catch { return false; } }
export function remoteImage(url: string) { return /^https:\/\//i.test(url); }
export function richPlugins(documentPath: () => string | null, onError: (message: string) => void) {
  return $prose(() => new Plugin({ props: {
    handleDOMEvents: {
      click: (_view, event) => { const anchor = (event.target as HTMLElement).closest('a'); if (!anchor) return false; event.preventDefault(); const url = anchor.getAttribute('href') || ''; if (safeLink(url)) void files.link(url).catch(e => onError(String(e))); else onError('이 링크 형식은 차단됩니다.'); return true; },
    },
    transformPastedHTML: html => html.replace(/<(script|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/\s(?:src|srcset|on\w+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ''),
    nodeViews: {
      list_item: (initial, view, getPos) => {
        let node = initial; const dom = document.createElement('li'); const contentDOM = document.createElement('div'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.contentEditable = 'false'; checkbox.setAttribute('aria-label', 'Toggle task');
        const render = () => { dom.dataset.task = String(node.attrs.checked != null); checkbox.hidden = node.attrs.checked == null; checkbox.checked = node.attrs.checked === true; };
        checkbox.addEventListener('mousedown', e => e.preventDefault());
        checkbox.addEventListener('change', () => { const pos = getPos(); if (pos !== undefined) view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: checkbox.checked })); });
        dom.append(checkbox, contentDOM); render();
        return { dom, contentDOM, update(next) { if (next.type !== node.type) return false; node = next; render(); return true; }, stopEvent: event => event.target === checkbox, ignoreMutation: mutation => mutation.type !== 'selection' && (mutation.target === checkbox || mutation.target === dom) };
      },
      image: initial => {
        let node = initial; let generation = 0; const dom = document.createElement('span'); dom.className = 'image-node'; dom.contentEditable = 'false';
        const render = () => {
          const version = ++generation; const src = String(node.attrs.src || ''); dom.replaceChildren();
          const show = (url: string) => { if (version !== generation) return; const img = document.createElement('img'); img.alt = node.attrs.alt || ''; img.title = node.attrs.title || ''; img.referrerPolicy = 'no-referrer'; img.src = url; dom.replaceChildren(img); };
          if (remoteImage(src)) { const label = document.createElement('span'); label.textContent = `Remote image blocked · ${node.attrs.alt || src}`; const button = document.createElement('button'); button.textContent = 'Load once'; button.type = 'button'; button.onclick = event => { event.preventDefault(); show(src); }; dom.append(label, button); }
          else if (/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(src)) dom.textContent = 'Image URL blocked';
          else { dom.textContent = node.attrs.alt || 'Local image'; const path = documentPath(); if (path) void files.image(path, src).then(show).catch(e => { if (version === generation) dom.textContent = `Local image unavailable: ${String(e)}`; }); else dom.textContent = 'Save the document to resolve local images'; }
        };
        render(); return { dom, update(next: Node) { if (next.type !== node.type) return false; if (next.attrs.src !== node.attrs.src || next.attrs.alt !== node.attrs.alt || next.attrs.title !== node.attrs.title) { node = next; render(); } return true; }, stopEvent: () => true, ignoreMutation: () => true, destroy() { generation++; } };
      },
    },
  } }));
}
