import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { htmlPreview, type HtmlImage } from '../../src/editors/htmlPreview';

describe('Markdown HTML preview', () => {
  it('renders the README header formatting and image without changing its source', () => {
    const source = readFileSync('README.md', 'utf8').split('\n\n![Rich Markdown')[0];
    const images: HtmlImage[] = [];
    const preview = htmlPreview(source, (attrs) => {
      images.push(attrs);
      return document.createElement('span');
    });
    const root = document.createElement('div');
    root.append(preview!);
    expect(root.querySelector('h1')?.textContent).toBe('Markraft');
    expect(root.querySelector('h1')?.style.textAlign).toBe('center');
    expect(root.querySelectorAll('strong')).toHaveLength(3);
    expect(root.querySelectorAll('a[href^="#"]')).toHaveLength(5);
    expect(images).toEqual([
      {
        src: 'assets/icon.png',
        alt: 'Markraft icon',
        title: '',
        width: 72,
        height: 72,
      },
    ]);
  });

  it('keeps active HTML as source and discards dangerous attributes', () => {
    expect(
      htmlPreview('<script>alert(1)</script>', () => document.createElement('span')),
    ).toBeNull();
    let image: HtmlImage | undefined;
    const preview = htmlPreview(
      '<a href="javascript:alert(1)" onclick="alert(1)">link</a>' +
        '<img src="https://example.com/a.png" onerror="alert(1)">',
      (attrs) => {
        image = attrs;
        return document.createElement('span');
      },
    );
    const root = document.createElement('div');
    root.append(preview!);
    expect(root.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(root.querySelector('a')?.hasAttribute('onclick')).toBe(false);
    expect(root.querySelector('img')).toBeNull();
    expect(image?.src).toBe('https://example.com/a.png');
  });
});
