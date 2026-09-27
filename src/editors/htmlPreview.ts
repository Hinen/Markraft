import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';

// Parse without a browser DOM so even image URLs in the source cannot load.
// Build fresh nodes so attributes and active elements never reach the editor.
const tags = new Set([
  'a',
  'b',
  'br',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'i',
  'img',
  'p',
  'span',
  'strong',
]);

export interface HtmlImage {
  src: string;
  alt: string;
  title: string;
  width?: number;
  height?: number;
}

function dimension(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const number = Number(value);
  return number > 0 && number <= 2048 ? number : undefined;
}

function allowedHref(href: string): boolean {
  if (/^#[a-z\d][a-z\d-]*$/i.test(href)) return true;
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

export function htmlPreview(source: string, image: (attrs: HtmlImage) => HTMLElement) {
  const parsed = parseFragment(source);
  if (!source.trimStart().startsWith('<')) return null;
  const supported = (node: DefaultTreeAdapterTypes.ChildNode): boolean => {
    if ('value' in node || node.nodeName === '#comment') return true;
    return 'tagName' in node && tags.has(node.tagName) && node.childNodes.every(supported);
  };
  if (!parsed.childNodes.every(supported)) return null;

  const copy = (node: DefaultTreeAdapterTypes.ChildNode): Node => {
    if ('value' in node) return document.createTextNode(node.value);
    if (node.nodeName === '#comment') return document.createTextNode('');
    if (!('tagName' in node)) return document.createTextNode('');
    const attr = (name: string) => node.attrs.find((entry) => entry.name === name)?.value || '';
    if (node.tagName === 'img')
      return image({
        src: attr('src'),
        alt: attr('alt'),
        title: attr('title'),
        width: dimension(attr('width')),
        height: dimension(attr('height')),
      });
    const output = document.createElement(node.tagName);
    if (/^h[1-6]$|^p$/.test(node.tagName)) {
      const align = attr('align');
      if (align === 'center' || align === 'left' || align === 'right')
        output.style.textAlign = align;
    }
    if (node.tagName === 'a') {
      const href = attr('href');
      if (href && allowedHref(href)) output.setAttribute('href', href);
    }
    for (const child of node.childNodes) output.append(copy(child));
    return output;
  };

  const fragment = document.createDocumentFragment();
  for (const child of parsed.childNodes) fragment.append(copy(child));
  return fragment;
}
