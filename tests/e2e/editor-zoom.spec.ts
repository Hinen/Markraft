import { expect, test, type Page, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function launch(page: Page, text = 'original text', name = 'zoom.txt', preferences = {}) {
  const image = `data:image/png;base64,${readFileSync('assets/icon.png').toString('base64')}`;
  await page.addInitScript(
    ({ text, name, preferences, image }) => {
      if (!localStorage.getItem('markraft.settings'))
        localStorage.setItem('markraft.settings', JSON.stringify(preferences));
      const doc = {
        path: `/test/${name}`,
        name,
        text,
        encoding: 'UTF-8',
        lineEnding: 'LF',
        revision: 'v1',
      };
      let pending = true;
      Object.assign(window, {
        __TAURI_INTERNALS__: {
          invoke: async (command: string) => {
            if (command === 'take_pending') {
              const result = pending ? [{ Ok: doc }] : [];
              pending = false;
              return result;
            }
            if (command === 'check_document') return doc.revision;
            if (command === 'local_image') return image;
            return null;
          },
        },
      });
    },
    { text, name, preferences, image },
  );
  await page.goto('/');
  await expect(page.locator('.tab.active .tab-name')).toHaveText(name);
}

const zoomSelect = (page: Page) =>
  page.getByRole('combobox', { name: 'Document zoom', exact: true });

async function wheel(page: Page, target: Locator, deltaY: number, ctrl = true) {
  await target.hover();
  if (ctrl) await page.keyboard.down('Control');
  await page.mouse.wheel(0, deltaY);
  if (ctrl) await page.keyboard.up('Control');
}

async function scrollAnchor(scroll: Locator, selector: string) {
  await expect
    .poll(() =>
      scroll.evaluate((element, selector) => {
        const top = element.getBoundingClientRect().top;
        return [...element.querySelectorAll(selector)].some(
          (line) => line.getBoundingClientRect().bottom > top + 8,
        );
      }, selector),
    )
    .toBe(true);
  return scroll.evaluate((element, selector) => {
    const top = element.getBoundingClientRect().top;
    const line = [...element.querySelectorAll<HTMLElement>(selector)].find(
      (line) => line.getBoundingClientRect().bottom > top + 8,
    )!;
    return { text: line.textContent!, offset: line.getBoundingClientRect().top - top };
  }, selector);
}

test('Ctrl+wheel zooms the document while ordinary wheel scrolls and chrome stays the same size', async ({
  page,
}) => {
  const text = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}: some text`).join('\n');
  await launch(page, text);
  const scroll = page.locator('.cm-scroller');
  const headerBefore = await page.locator('.menubar').boundingBox();
  await wheel(page, scroll, -100);
  await expect(zoomSelect(page)).toHaveValue('110');
  await expect(page.locator('.cm-editor')).toHaveCSS('font-size', '16.5px');
  expect(await page.locator('.menubar').boundingBox()).toEqual(headerBefore);
  await expect(page.locator('.dirty')).toHaveCount(0);
  await wheel(page, scroll, 400, false);
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await expect(zoomSelect(page)).toHaveValue('110');

  // Ctrl+wheel over the tab bar must not change document zoom.
  expect(
    await page.locator('.tab.active').evaluate((element) => {
      const event = new WheelEvent('wheel', {
        ctrlKey: true,
        deltaY: -120,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  await expect(zoomSelect(page)).toHaveValue('110');
  await page.getByRole('button', { name: '⚙', exact: true }).click();
  await page.getByRole('dialog').dispatchEvent('wheel', { ctrlKey: true, deltaY: -120 });
  await page.keyboard.press('Control+Equal');
  await expect(zoomSelect(page)).toHaveValue('110');
  await page.keyboard.press('Escape');
});

test('fine wheel input accumulates, reverses cleanly and rapid gestures are rate limited', async ({
  page,
}) => {
  await launch(page);
  const result = await page.locator('.cm-content').evaluate((element) => {
    const send = (deltaY: number, deltaMode = 0) => {
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY,
        deltaMode,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    };
    send(-30);
    send(30); // Discard the previous direction's partial gesture.
    send(-30);
    send(-30);
    send(-30);
    const before = JSON.parse(localStorage.getItem('markraft.settings')!).editorZoom;
    const prevented = send(-10);
    for (let i = 0; i < 30; i++) send(-100);
    const after = JSON.parse(localStorage.getItem('markraft.settings')!).editorZoom;
    return { before, after, prevented };
  });
  expect(result).toEqual({ before: undefined, after: 110, prevented: true });
  await expect(zoomSelect(page)).toHaveValue('110');
  await expect
    .poll(async () => {
      await page
        .locator('.cm-content')
        .dispatchEvent('wheel', { ctrlKey: true, deltaY: 3, deltaMode: 1 });
      return zoomSelect(page).inputValue();
    })
    .toBe('100');
});

test('buttons, presets, keyboard and View menu share a persisted zoom without changing the base font size', async ({
  page,
}) => {
  await launch(page, 'original text', 'zoom.txt', { fontSize: 16 });
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(zoomSelect(page)).toHaveValue('110');
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(zoomSelect(page)).toHaveValue('100');
  await zoomSelect(page).selectOption('125');
  await expect(page.locator('.cm-editor')).toHaveCSS('font-size', '20px');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+Equal');
  await expect(zoomSelect(page)).toHaveValue('135');
  await page.keyboard.press('Control+Shift+Equal');
  await expect(zoomSelect(page)).toHaveValue('145');
  await page.keyboard.press('Control+Minus');
  await expect(zoomSelect(page)).toHaveValue('135');
  await page.keyboard.press('Control+Digit0');
  await expect(zoomSelect(page)).toHaveValue('100');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Zoom in/ }).click();
  await expect(zoomSelect(page)).toHaveValue('110');
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Reset zoom/ }).click();
  await expect(zoomSelect(page)).toHaveValue('100');
  await zoomSelect(page).selectOption('150');
  await page.reload();
  await expect(zoomSelect(page)).toHaveValue('150');
  await expect(page.locator('.cm-editor')).toHaveCSS('font-size', '24px');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('markraft.settings')!).fontSize),
  ).toBe(16);
  await expect(page.locator('.dirty')).toHaveCount(0);

  await zoomSelect(page).selectOption('200');
  await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeDisabled();
  await page.keyboard.press('Control+Equal');
  await expect(zoomSelect(page)).toHaveValue('200');
  await zoomSelect(page).selectOption('50');
  await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeDisabled();
  await page.keyboard.press('Control+Minus');
  await expect(zoomSelect(page)).toHaveValue('50');
});

test('Rich zoom scales headings, tables and local images, preserves selection and edit history across modes', async ({
  page,
}) => {
  const source =
    '# Heading\n\nOriginal paragraph\n\n| Name | Value |\n| --- | --- |\n| Item | 100 |\n\n![Icon](icon.png)\n';
  await launch(page, source, 'zoom.md');
  const rich = page.locator('.ProseMirror');
  const heading = rich.locator('h1');
  const image = rich.getByRole('img', { name: 'Icon' });
  await expect(image).toHaveJSProperty('naturalWidth', 128);
  const headingBefore = (await heading.boundingBox())!;
  const imageBefore = (await image.boundingBox())!;
  const cellBefore = (await rich.locator('th').first().boundingBox())!;
  await rich.locator('p').first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  const selected = await page.evaluate(() => getSelection()?.toString());
  await page.keyboard.press('Control+Equal');
  await expect(zoomSelect(page)).toHaveValue('110');
  expect(await page.evaluate(() => getSelection()?.toString())).toBe(selected);
  await wheel(page, page.locator('.rich-scroll'), -100);
  await expect(zoomSelect(page)).toHaveValue('120');
  expect(await page.evaluate(() => getSelection()?.toString())).toBe(selected);
  await expect(page.locator('.dirty')).toHaveCount(0);
  await zoomSelect(page).selectOption('150');
  expect((await heading.boundingBox())!.height / headingBefore.height).toBeCloseTo(1.5, 1);
  expect((await image.boundingBox())!.width / imageBefore.width).toBeCloseTo(1.5, 1);
  expect((await rich.locator('th').first().boundingBox())!.height / cellBefore.height).toBeCloseTo(
    1.5,
    1,
  );
  const richRect = (await page.locator('.rich-editor').boundingBox())!;
  const scrollRect = (await page.locator('.rich-scroll').boundingBox())!;
  expect(Math.abs(richRect.width - scrollRect.width)).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/editor-zoom-rich-150.png' });

  await rich.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  await page.keyboard.press('Control+Minus');
  await page.keyboard.press('Control+z');
  await expect(rich.locator('p').first()).toHaveText('Original paragraph');
  await page.getByRole('button', { name: 'Raw', exact: true }).click();
  await expect(page.locator('.cm-editor:visible')).toHaveCSS('font-size', '21px');
  await expect
    .poll(() => page.locator('.cm-content:visible .cm-line').allTextContents())
    .toEqual(source.split('\n'));
  await page.keyboard.press('Control+Digit0');
  await expect(page.locator('.cm-editor:visible')).toHaveCSS('font-size', '15px');
  await page.getByRole('button', { name: 'Rich', exact: true }).click();
  expect((await image.boundingBox())!.width).toBeCloseTo(imageBefore.width, 0);
});

for (const mode of ['raw', 'rich'] as const) {
  test(`${mode} preserves the visible text anchor when zooming in the middle of a document`, async ({
    page,
  }) => {
    const source = Array.from({ length: 250 }, (_, i) => `Paragraph ${i + 1}: text anchor`).join(
      mode === 'rich' ? '\n\n' : '\n',
    );
    await launch(page, source, mode === 'rich' ? 'anchor.md' : 'anchor.txt');
    const scroll = page.locator(mode === 'rich' ? '.rich-scroll' : '.cm-scroller').first();
    const selector = mode === 'rich' ? '.ProseMirror > p' : '.cm-line';
    await scroll.evaluate((element) => {
      element.scrollTop = 1600;
    });
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(1500);
    const anchor = await scrollAnchor(scroll, selector);
    await zoomSelect(page).selectOption('150');
    await expect(zoomSelect(page)).toHaveValue('150');
    const sameLine = scroll.locator(selector).filter({ hasText: new RegExp(`^${anchor.text}$`) });
    await expect(sameLine).toBeAttached();
    await expect
      .poll(async () => {
        const top = (await sameLine.boundingBox())!.y - (await scroll.boundingBox())!.y;
        return Math.abs(top - anchor.offset);
      })
      .toBeLessThan(16);
    await expect(page.locator('.dirty')).toHaveCount(0);
    await zoomSelect(page).selectOption('50');
    await expect
      .poll(async () => {
        const top = (await sameLine.boundingBox())!.y - (await scroll.boundingBox())!.y;
        return Math.abs(top - anchor.offset);
      })
      .toBeLessThan(16);
    const inactiveAnchor = await scrollAnchor(scroll, selector);
    await page.keyboard.press('Control+n');
    await zoomSelect(page).selectOption('125');
    await page
      .locator('.tab-name')
      .filter({ hasText: mode === 'rich' ? 'anchor.md' : 'anchor.txt' })
      .click();
    const restoredLine = scroll
      .locator(selector)
      .filter({ hasText: new RegExp(`^${inactiveAnchor.text}$`) });
    await expect
      .poll(async () => {
        const top = (await restoredLine.boundingBox())!.y - (await scroll.boundingBox())!.y;
        return Math.abs(top - inactiveAnchor.offset);
      })
      .toBeLessThan(16);
  });
}

test('split panes share zoom and source selection and undo survive zoom changes', async ({
  page,
}) => {
  await launch(page);
  const first = page.locator('.cm-content:visible');
  await first.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' edited');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  const selection = await page.evaluate(() => getSelection()?.toString());
  await page.keyboard.press('Control+Equal');
  expect(await page.evaluate(() => getSelection()?.toString())).toBe(selection);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+z');
  await expect(first).toHaveText('original text');
  await page.keyboard.press('Control+n');
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await zoomSelect(page).selectOption('125');
  const editors = page.locator('.cm-editor:visible');
  await expect(editors).toHaveCount(2);
  await expect(editors.nth(0)).toHaveCSS('font-size', '18.75px');
  await expect(editors.nth(1)).toHaveCSS('font-size', '18.75px');
  await page.screenshot({ path: 'test-results/editor-zoom-split-125.png' });
});

for (const [saved, expected] of [
  [{}, '100'],
  [{ editorZoom: 'bad' }, '100'],
  [{ editorZoom: 500 }, '200'],
  [{ editorZoom: 1 }, '50'],
] as const) {
  test(`older or invalid persisted settings restore a safe zoom: ${JSON.stringify(saved)}`, async ({
    page,
  }) => {
    await launch(page, 'original text', 'zoom.txt', saved);
    await expect(zoomSelect(page)).toHaveValue(expected);
  });
}
