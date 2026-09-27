import { $prose } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import type { Node } from '@milkdown/kit/prose/model';
import { files } from '../files/fileService';
import { t, errorText, subscribeLocale } from '../i18n/i18n';
import { htmlPreview, type HtmlImage } from './htmlPreview';
export function safeLink(url: string) {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
function imageSource(source: string) {
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
}
export function remoteImage(url: string) {
  return /^https:\/\//i.test(url);
}
export function richPlugins(documentPath: () => string | null, onError: (message: string) => void) {
  let lastDocument = documentPath();
  const refreshImages = new Set<() => void>();
  function followLink(event: Event) {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return false;
    if (event.defaultPrevented) return true;
    event.preventDefault();
    const url = anchor.getAttribute('href') || '';
    if (url.startsWith('#')) {
      const id = imageSource(url.slice(1));
      const root = anchor.closest('.ProseMirror');
      const target = [...(root?.querySelectorAll('[id]') || [])].find(
        (element) => element.id === id,
      );
      target?.scrollIntoView({ block: 'start' });
    } else if (safeLink(url)) void files.link(url).catch((e) => onError(String(e)));
    else onError(t('Unsupported link type.'));
    return true;
  }
  function createImageView(getAttrs: () => HtmlImage) {
    let generation = 0;
    const dom = document.createElement('span');
    dom.className = 'image-node';
    dom.contentEditable = 'false';
    const render = () => {
      const version = ++generation;
      const { src, alt, title, width, height } = getAttrs();
      dom.replaceChildren();
      const show = (url: string) => {
        if (version !== generation) return;
        const img = document.createElement('img');
        img.alt = alt;
        img.title = title;
        img.referrerPolicy = 'no-referrer';
        if (width) img.width = width;
        if (height) img.height = height;
        img.src = url;
        dom.replaceChildren(img);
      };
      if (remoteImage(src)) {
        const label = document.createElement('span');
        label.textContent = t('Remote image blocked · {name}', { name: alt || src });
        const button = document.createElement('button');
        button.textContent = t('Load once');
        button.type = 'button';
        button.onclick = (event) => {
          event.preventDefault();
          show(src);
        };
        dom.append(label, button);
      } else if (/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(src))
        dom.textContent = t('Image URL blocked');
      else {
        dom.textContent = alt || t('Image');
        const path = documentPath();
        if (path)
          void files
            .image(path, imageSource(src))
            .then(show)
            .catch((e) => {
              if (version === generation)
                dom.textContent = t('Image unavailable: {error}', { error: errorText(e) });
            });
        else dom.textContent = t('Save the document to load relative images');
      }
    };
    render();
    refreshImages.add(render);
    const unsubscribe = subscribeLocale(() => {
      if (!dom.querySelector('img')) render();
    });
    return {
      dom,
      render,
      destroy() {
        unsubscribe();
        generation++;
        refreshImages.delete(render);
      },
    };
  }
  return $prose(
    () =>
      new Plugin({
        view: () => ({
          update() {
            if (lastDocument !== documentPath()) {
              lastDocument = documentPath();
              refreshImages.forEach((refresh) => refresh());
            }
          },
        }),
        props: {
          handleDOMEvents: {
            click: (_view, event) => followLink(event),
            auxclick: (_view, event) => followLink(event),
          },
          transformPastedHTML: (html) =>
            html
              .replace(/<(script|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
              .replace(/\s(?:src|srcset|on\w+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ''),
          nodeViews: {
            list_item: (initial, view, getPos) => {
              let node = initial;
              const dom = document.createElement('li');
              const contentDOM = document.createElement('div');
              const checkbox = document.createElement('input');
              checkbox.type = 'checkbox';
              checkbox.contentEditable = 'false';
              const localize = () => checkbox.setAttribute('aria-label', t('Toggle task'));
              localize();
              const unsubscribe = subscribeLocale(localize);
              const render = () => {
                dom.dataset.task = String(node.attrs.checked != null);
                checkbox.hidden = node.attrs.checked == null;
                checkbox.checked = node.attrs.checked === true;
              };
              checkbox.addEventListener('mousedown', (e) => e.preventDefault());
              checkbox.addEventListener('change', () => {
                const pos = getPos();
                if (pos !== undefined)
                  view.dispatch(
                    view.state.tr.setNodeMarkup(pos, undefined, {
                      ...node.attrs,
                      checked: checkbox.checked,
                    }),
                  );
              });
              dom.append(checkbox, contentDOM);
              render();
              return {
                dom,
                contentDOM,
                destroy: unsubscribe,
                update(next) {
                  if (next.type !== node.type) return false;
                  node = next;
                  render();
                  return true;
                },
                stopEvent: (event) => event.target === checkbox,
                ignoreMutation: (mutation) =>
                  mutation.type !== 'selection' &&
                  (mutation.target === checkbox || mutation.target === dom),
              };
            },
            html: (initial) => {
              let node = initial;
              const dom = document.createElement('span');
              dom.className = 'html-preview';
              dom.contentEditable = 'false';
              let images: ReturnType<typeof createImageView>[] = [];
              const render = () => {
                images.forEach((view) => view.destroy());
                images = [];
                const source = String(node.attrs.value || '');
                const preview = htmlPreview(source, (attrs) => {
                  const view = createImageView(() => attrs);
                  images.push(view);
                  return view.dom;
                });
                dom.replaceChildren(preview || document.createTextNode(source));
                dom.classList.toggle('html-preview-block', /^\s*<(?:p|h[1-6])\b/i.test(source));
              };
              render();
              dom.addEventListener('click', followLink);
              dom.addEventListener('auxclick', followLink);
              return {
                dom,
                update(next: Node) {
                  if (next.type !== node.type) return false;
                  if (next.attrs.value !== node.attrs.value) {
                    node = next;
                    render();
                  }
                  return true;
                },
                stopEvent: () => true,
                ignoreMutation: () => true,
                destroy() {
                  images.forEach((view) => view.destroy());
                },
              };
            },
            image: (initial) => {
              let node = initial;
              const view = createImageView(() => ({
                src: String(node.attrs.src || ''),
                alt: String(node.attrs.alt || ''),
                title: String(node.attrs.title || ''),
              }));
              return {
                dom: view.dom,
                update(next: Node) {
                  if (next.type !== node.type) return false;
                  if (
                    next.attrs.src !== node.attrs.src ||
                    next.attrs.alt !== node.attrs.alt ||
                    next.attrs.title !== node.attrs.title
                  ) {
                    node = next;
                    view.render();
                  }
                  return true;
                },
                stopEvent: () => true,
                ignoreMutation: () => true,
                destroy: view.destroy,
              };
            },
          },
        },
      }),
  );
}
