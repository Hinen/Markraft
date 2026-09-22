import { expect, test, type Page, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
const markdown =
  '# 한글 제목\n\nHello **world**.\n\n- [ ] parent\n  - [x] child\n\n| Name | Value |\n| --- | --- |\n| HP | 100 |\n\n![Tracker](https://example.com/tracker.png)\n';
async function launch(page: Page, text = markdown, name = 'note.md') {
  await page.addInitScript(
    ({ text, name }) => {
      const doc = {
        path: `/test/${name}`,
        name,
        text,
        encoding: 'UTF-8',
        lineEnding: 'LF',
        revision: 'v1',
      };
      let pending = true;
      const disk = new Map([[doc.path, doc]]);
      const saved: unknown[] = [];
      Object.assign(window, {
        __testDisk: disk,
        __testSaved: saved,
        __TAURI_INTERNALS__: {
          invoke: async (command: string, args: Record<string, any>) => {
            if (command === 'take_pending') {
              const result = pending ? [{ Ok: doc }] : [];
              pending = false;
              return result;
            }
            if (command === 'check_document' || command === 'read_document') {
              const file = disk.get(args.path);
              if (!file) throw new Error('File not found');
              return command === 'check_document' ? file.revision : file;
            }
            if (command === 'save_document') {
              const request = args.request;
              const old = disk.get(request.path);
              if (old && old.revision !== request.revision) throw new Error('CONFLICT');
              const next = { ...(old || doc), ...request, revision: `v${saved.length + 2}` };
              saved.push(next);
              disk.set(request.path, next);
              return next;
            }
            if (command === 'open_dialog') {
              const opened = {
                path: '/test/config.yaml',
                name: 'config.yaml',
                text: 'items: []\nname: 한글\n',
                encoding: 'UTF-8',
                lineEnding: 'LF',
                revision: 'yaml1',
              };
              disk.set(opened.path, opened);
              return [opened];
            }
            if (command === 'local_image') throw new Error('No fixture');
            return null;
          },
        },
      });
    },
    { text, name },
  );
  await page.goto('/');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText(name);
}
async function dragTab(page: Page, source: Locator, target: Locator, after = false) {
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + (after ? to.width - 4 : 4), to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
}
for (const theme of ['dark', 'light'] as const) {
  test(`text drag shows the real selection on the active line and preserves its bounds: ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    const source = 'tets\n\n\ntest\n\n\ntest';
    await launch(page, source, 'drag.txt');
    const lines = page.locator('.cm-line');
    const point = async (line: number, offset: number) =>
      lines.nth(line).evaluate((el, offset) => {
        const range = document.createRange();
        range.setStart(el.firstChild!, offset);
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        return { x: rect.x, y: rect.y + rect.height / 2 };
      }, offset);
    const from = await point(6, 4),
      to = await point(6, 1);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('est');
    await expect(page.locator('.cm-selectionBackground')).toHaveCount(1);
    await page.screenshot({ path: `test-results/text-drag-${theme}.png` });
    // An opaque active-line background paints over CodeMirror's selection layer.
    await expect(page.locator('.cm-activeLine')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const selection = page.locator('.cm-selectionBackground');
    const expectedColor = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--selection)';
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    await expect(selection).toHaveCSS('background-color', expectedColor);
    await expect(page.locator('.cm-selectionMatch')).not.toHaveCSS('box-shadow', 'none');
    await page.keyboard.type('X');
    await expect(lines.nth(6)).toHaveText('tX');
    await expect(lines.nth(3)).toHaveText('test');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(lines.nth(6)).toHaveText('test');
    // Re-select across empty lines in the other direction.
    await page.keyboard.press('ArrowLeft');
    const start = await point(3, 1),
      end = await point(6, 3);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('est\n\n\ntes');
    await page.keyboard.type('Y');
    await expect(page.locator('.cm-content')).toHaveText('tetstYt');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(lines).toHaveCount(7);
    await expect(page.getByLabel('Unsaved changes')).toHaveCount(0);
  });
}

for (const [system, language, fileLabel, findLabel, saveLabel, discardLabel, cancelLabel] of [
  ['en-US', 'en', 'File', 'Find', 'Save', 'Discard', 'Cancel'],
  ['ko-KR', 'ko', '파일', '찾기', '저장', '저장 안 함', '취소'],
  ['ja-JP', 'ja', 'ファイル', '検索', '保存', '保存しない', 'キャンセル'],
  ['fr-FR', 'en', 'File', 'Find', 'Save', 'Discard', 'Cancel'],
]) {
  test(`language defaults to the user's locale and keeps close choices correct: ${system}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: system });
    const page = await context.newPage();
    await launch(page, 'original', 'note.txt');
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.getByRole('button', { name: fileLabel, exact: true })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+f');
    await expect(
      page.locator('.cm-search').getByRole('textbox', { name: findLabel, exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' edited');
    await page.keyboard.press('ControlOrMeta+w');
    await page.getByRole('dialog').getByRole('button', { name: cancelLabel, exact: true }).click();
    await expect(page.locator('.cm-content')).toHaveText('original edited');
    await page.keyboard.press('ControlOrMeta+w');
    await page.getByRole('dialog').getByRole('button', { name: saveLabel, exact: true }).click();
    await expect(page.locator('.tab')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__testSaved.at(-1).text)).toBe(
      'original edited',
    );
    await page.keyboard.press('ControlOrMeta+n');
    await page.locator('.cm-content').click();
    await page.keyboard.type('discard me');
    await page.keyboard.press('ControlOrMeta+w');
    await page.getByRole('dialog').getByRole('button', { name: discardLabel, exact: true }).click();
    await expect(page.locator('.tab')).toHaveCount(0);
    await context.close();
  });
}

test('language switches preserve editor, undo, search, images and other settings; selection persists', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('markraft.settings'))
      localStorage.setItem(
        'markraft.settings',
        JSON.stringify({ theme: 'dark', fontSize: 17, editorFont: 'Consolas', wordWrap: false }),
      );
  });
  await launch(page);
  await page.locator('.ProseMirror').evaluate((el) => (el.dataset.instance = 'rich'));
  await page.keyboard.press('ControlOrMeta+f');
  await page.getByLabel('Find in document').fill('Hello');
  await page.getByRole('button', { name: '⚙', exact: true }).click();
  await page.getByLabel('Language', { exact: true }).selectOption('ko');
  await expect(page.getByRole('heading', { name: '편집기 설정' })).toBeVisible();
  await page.getByRole('button', { name: '완료', exact: true }).click();
  await expect(page.getByLabel('문서에서 찾기')).toHaveValue('Hello');
  await expect(page.getByRole('button', { name: '한 번 불러오기', exact: true })).toBeVisible();
  await expect(page.locator('.ProseMirror')).toHaveAttribute('data-instance', 'rich');
  await page.getByRole('button', { name: '소스', exact: true }).click();
  await page.locator('.cm-content').evaluate((el) => (el.dataset.instance = 'raw'));
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' retained');
  await page.keyboard.press('ControlOrMeta+f');
  await page.locator('.cm-search').getByLabel('찾기', { exact: true }).fill('retained');
  await page.getByRole('button', { name: '⚙', exact: true }).click();
  await page.getByLabel('언어', { exact: true }).selectOption('ja');
  await expect(page.getByRole('heading', { name: 'エディター設定' })).toBeVisible();
  await page.getByRole('button', { name: '完了', exact: true }).click();
  await expect(page.locator('.cm-search').getByLabel('検索', { exact: true })).toHaveValue(
    'retained',
  );
  await expect(page.locator('.cm-content')).toHaveAttribute('data-instance', 'raw');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.cm-content')).not.toContainText('retained');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('markraft.settings')!));
  expect(saved).toMatchObject({
    language: 'ja',
    theme: 'dark',
    fontSize: 17,
    editorFont: 'Consolas',
    wordWrap: false,
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('button', { name: 'ファイル', exact: true })).toBeVisible();
});

test('system language changes live, and an explicit language takes precedence', async ({
  page,
}) => {
  await launch(page, '{"bad":}', 'note.json');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['ja-JP'] });
    window.dispatchEvent(new Event('languagechange'));
  });
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await page.locator('.cm-lint-marker-error').hover();
  await expect(page.locator('.cm-tooltip-lint')).toContainText('JSON 構文エラー');
  await page.getByRole('button', { name: '⚙', exact: true }).click();
  await page.getByLabel('言語', { exact: true }).selectOption('en');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['ko-KR'] });
    window.dispatchEvent(new Event('languagechange'));
  });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('UX audit: focusing a search field in the other pane does not steal its caret or format the document', async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.press('ControlOrMeta+f');
  const input = page.getByRole('textbox', { name: 'Find in document' });
  await input.fill('Hello');
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('config.yaml');
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await input.focus();
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('note.md');
  await expect(input).toBeFocused();
  await page.keyboard.press('ControlOrMeta+b');
  await expect(input).toBeFocused();
  await expect(page.getByLabel('Unsaved changes')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+f');
  await expect(input).toHaveValue('Hello');
  await expect(input).toBeFocused();
});
test('UX audit: close all preserves edits made to an earlier tab while another tab saves', async ({
  page,
}) => {
  await launch(page, 'original', 'note.txt');
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('config.yaml');
  await page.locator('.cm-content:visible').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('changed');
  await page.evaluate(() => {
    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    (window as any).__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === 'save_document')
        await new Promise<void>((resolve) => {
          (window as any).__releaseCloseSave = resolve;
        });
      return invoke(command, args);
    };
  });
  await page.keyboard.press('ControlOrMeta+Shift+w');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).__releaseCloseSave))
    .toBe('function');
  await page.locator('.tab button[title="/test/note.txt"]').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' keep this');
  await page.evaluate(() => (window as any).__releaseCloseSave());
  await expect(page.getByRole('alert')).toContainText('New edits');
  await expect(page.locator('.tab')).toHaveCount(2);
  await expect(page.locator('.cm-content:visible')).toHaveText('original keep this');
  await expect(page.getByLabel('Unsaved changes')).toHaveCount(1);
});

test('UX audit: repeated Ctrl+S during a pending save writes the latest text after the first save', async ({
  page,
}) => {
  await launch(page, 'original', 'note.txt');
  const raw = page.locator('.cm-content');
  await raw.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' first');
  await page.evaluate(() => {
    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    let delay = true;
    (window as any).__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === 'save_document' && delay) {
        delay = false;
        await new Promise((resolve) => ((window as any).__releaseSave = resolve));
      }
      return invoke(command, args);
    };
  });
  await page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).__releaseSave))
    .toBe('function');
  await page.keyboard.type(' second');
  await page.keyboard.press('ControlOrMeta+s');
  await page.keyboard.type(' third');
  await page.keyboard.press('ControlOrMeta+s');
  await page.evaluate(() => (window as any).__releaseSave());
  await expect
    .poll(() => page.evaluate(() => (window as any).__testSaved.at(-1)?.text))
    .toBe('original first second third');
  expect(await page.evaluate(() => (window as any).__testSaved.length)).toBe(2);
  await expect(page.getByLabel('Unsaved changes')).toHaveCount(0);
});
test('UX audit: Reload does not discard typing that happens after confirmation', async ({
  page,
}) => {
  await launch(page, 'original', 'note.txt');
  const raw = page.locator('.cm-content');
  await raw.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' local');
  await page.evaluate(() => {
    const disk = (window as any).__testDisk;
    disk.set('/test/note.txt', {
      ...disk.get('/test/note.txt'),
      text: 'external',
      revision: 'external2',
    });
  });
  await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    (window as any).__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === 'read_document')
        await new Promise((resolve) => ((window as any).__releaseRead = resolve));
      return invoke(command, args);
    };
  });
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reload', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).__releaseRead))
    .toBe('function');
  await raw.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' + later');
  await page.evaluate(() => (window as any).__releaseRead());
  await expect(page.getByRole('alert').filter({ hasText: 'New edits' })).toBeVisible();
  await expect(raw).toContainText('original local + later');
  await expect(page.getByLabel('Unsaved changes')).toBeVisible();
});
test('UX audit: Keep Mine retains dirty text entered while the disk read is pending', async ({
  page,
}) => {
  await launch(page, 'original', 'note.txt');
  const raw = page.locator('.cm-content');
  await raw.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('disk same');
  await page.evaluate(() => {
    const disk = (window as any).__testDisk;
    disk.set('/test/note.txt', {
      ...disk.get('/test/note.txt'),
      text: 'disk same',
      revision: 'external2',
    });
  });
  await expect(page.getByRole('button', { name: 'Keep Mine', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const invoke = (window as any).__TAURI_INTERNALS__.invoke;
    (window as any).__TAURI_INTERNALS__.invoke = async (command: string, args: any) => {
      if (command === 'read_document')
        await new Promise((resolve) => ((window as any).__releaseRead = resolve));
      return invoke(command, args);
    };
  });
  await page.getByRole('button', { name: 'Keep Mine', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).__releaseRead))
    .toBe('function');
  await raw.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' + later');
  await page.evaluate(() => (window as any).__releaseRead());
  await expect(page.locator('.new-tab')).toBeEnabled();
  await expect(page.getByLabel('Unsaved changes')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(() => page.evaluate(() => (window as any).__testSaved.at(-1)?.text))
    .toBe('disk same + later');
});
test('Markdown tools appear only for the focused Markdown document', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 650 });
  await launch(page);
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('config.yaml');
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  const workspace = page.locator('.editor-workspace');
  const before = (await workspace.boundingBox())!.y;
  await expect(page.locator('.toolbar')).toHaveCount(0);
  await page.locator('.ProseMirror h1').click();
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('note.md');
  await expect(page.locator('.toolbar')).toBeVisible();
  await expect(page.locator('.format-tools')).toBeVisible();
  await expect(page.locator('.document-name, .save-button')).toHaveCount(0);
  expect((await workspace.boundingBox())!.y).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Raw', exact: true }).click();
  await expect(page.locator('.toolbar')).toBeVisible();
  await expect(page.locator('.format-tools')).toHaveCount(0);
  await page.locator('[data-editor-pane="secondary"] .cm-content:visible').click();
  await expect(page.locator('.toolbar')).toHaveCount(0);
  expect((await workspace.boundingBox())!.y).toBe(before);
  await page.screenshot({ path: 'test-results/ux-stable-toolbar.png' });
});
test('UX audit: modal focus is trapped and font size can be typed without forced intermediate clamping', async ({
  page,
}) => {
  await launch(page);
  await page.getByRole('button', { name: '⚙', exact: true }).click();
  const size = page.getByRole('spinbutton');
  await size.fill('');
  await size.press('2');
  await expect(size).toHaveValue('2');
  await size.press('4');
  await expect(size).toHaveValue('24');
  await page.getByRole('button', { name: 'Done', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('dialog').getByRole('combobox', { name: 'Language', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('markraft.settings')!).fontSize),
  ).toBe(24);
});
test('UX audit: overflowing tabs reveal selection, wheel scroll and continuously scroll during drag', async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 650 });
  await launch(page);
  for (let i = 0; i < 16; i++) await page.keyboard.press('ControlOrMeta+n');
  const bar = page.getByRole('navigation', { name: 'Documents', exact: true });
  await expect.poll(() => bar.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await page.keyboard.press('ControlOrMeta+Tab');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('note.md');
  await expect.poll(() => bar.evaluate((el) => el.scrollLeft)).toBeLessThan(10);
  await bar.hover();
  await page.mouse.wheel(0, 280);
  await expect.poll(() => bar.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  await bar.evaluate((el) => (el.scrollLeft = 0));
  const rect = (await bar.boundingBox())!,
    source = (await bar.locator('.tab > button[title]').first().boundingBox())!;
  await page.mouse.move(source.x + 20, source.y + 15);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 12, source.y + 15, { steps: 8 });
  const start = await bar.evaluate((el) => el.scrollLeft);
  await expect.poll(() => bar.evaluate((el) => el.scrollLeft)).toBeGreaterThan(start + 150);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.tab')).toHaveCount(17);
  await bar
    .locator('.tab > button[title]')
    .filter({ hasText: /^TUntitled 2$/ })
    .click({ button: 'middle' });
  await expect(page.locator('.tab')).toHaveCount(16);
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('note.md');
});
test('UX audit: one document cannot create an empty split, and deleted files offer Save As', async ({
  page,
}) => {
  await launch(page);
  await expect(page.getByRole('button', { name: 'Split view', exact: true })).toBeDisabled();
  const from = (await page.locator('.tab > button[title]').boundingBox())!,
    area = (await page.locator('.editor-workspace').boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 15);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width - 15, area.y + 100, { steps: 10 });
  await expect(page.locator('.tab-drop-preview')).toHaveCount(0);
  await page.mouse.up();
  await page.evaluate(() => (window as any).__testDisk.delete('/test/note.md'));
  await expect(
    page.getByRole('alert').getByRole('button', { name: 'Save As…', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep Mine', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload', exact: true })).toHaveCount(0);
});
test('UX audit: Save keeps the caret ready for continued typing and empty menus disable unavailable actions', async ({
  page,
}) => {
  await launch(page);
  await page.locator('.ProseMirror h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' first');
  await page.keyboard.press('ControlOrMeta+s');
  await page.keyboard.type(' second');
  await expect(page.locator('.ProseMirror h1')).toHaveText('한글 제목 first second');
  await page.keyboard.press('ControlOrMeta+w');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Save Ctrl+S', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});
test('UX audit: closing the last tab on either side collapses split without remounting the survivor', async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('config.yaml');
  await page.locator('.ProseMirror').evaluate((el) => (el.dataset.instance = 'survivor'));
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await page.getByRole('button', { name: 'Close config.yaml', exact: true }).click();
  await expect(page.getByRole('separator', { name: 'Resize editor panes' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Right documents' })).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toHaveAttribute('data-instance', 'survivor');
  await expect(page.getByRole('button', { name: 'Split view', exact: true })).toBeDisabled();
});
test('UX audit: clicking selected tab restores typing focus', async ({ page }) => {
  await launch(page);
  await page.locator('.ProseMirror h1').click();
  await page.keyboard.press('End');
  await page.locator('.tab > button[title]').click();
  await page.keyboard.type(' focus');
  await expect(page.locator('.ProseMirror h1')).toHaveText('한글 제목 focus');
});
test('UX audit: settings are modal, Escape dismisses and returns editor focus', async ({
  page,
}) => {
  await launch(page);
  await page.getByRole('button', { name: '⚙', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+n');
  await expect(page.locator('.tab')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+w');
  await expect(page.locator('.tab')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toBeFocused();
});
test('UX audit: cancel close all leaves every document and discarded draft in place', async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.press('ControlOrMeta+n');
  await page.locator('.cm-content:visible').click();
  await page.keyboard.type('first draft');
  await page.keyboard.press('ControlOrMeta+n');
  await page.getByRole('button', { name: 'Select syntax', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Markdown .md, .markdown', exact: true })
    .click();
  await page.locator('.ProseMirror:visible').click();
  await page.keyboard.type('second draft');
  await page.keyboard.press('ControlOrMeta+Shift+w');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.tab')).toHaveCount(3);
  await page.locator('.tab > button[title="Untitled"]').click();
  await expect(page.locator('.cm-content:visible')).toContainText('first draft');
});
test('UX audit: new documents have distinct names and Ctrl+Tab cycles within the pane', async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.press('ControlOrMeta+n');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('Untitled');
  await page.keyboard.press('ControlOrMeta+n');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('Untitled 2');
  await page.keyboard.press('ControlOrMeta+Tab');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('note.md');
  await page.keyboard.press('ControlOrMeta+Shift+Tab');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('Untitled 2');
});
for (const side of ['primary', 'secondary'] as const)
  test(`drag a tab to the ${side} editor edge to split without a button`, async ({ page }) => {
    await launch(page);
    const rich = page.locator('.ProseMirror');
    await rich.locator('h1').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' local');
    await rich.evaluate((el) => (el.dataset.instance = 'before-edge-split'));
    await page.keyboard.press('ControlOrMeta+o');
    await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('config.yaml');
    const source = page.locator('.tab > button[title]').filter({ hasText: 'note.md' }),
      from = (await source.boundingBox())!;
    const area = (await page.locator('.editor-workspace').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      area.x + (side === 'primary' ? 30 : area.width - 30),
      area.y + area.height / 2,
      { steps: 14 },
    );
    await expect(page.locator('.tab-drop-preview')).toHaveAttribute('data-drop-side', side);
    await expect(page.locator('.tab-drop-preview')).toHaveAttribute('data-drop-action', 'split');
    await expect(page.getByRole('button', { name: 'Split view', exact: true })).toBeVisible();
    await expect(page.locator('.editor-host:visible')).toHaveCount(1);
    if (side === 'secondary')
      await page.screenshot({ path: 'test-results/drag-split-preview.png' });
    await page.mouse.up();
    await expect(page.locator('.tab-drop-preview')).toHaveCount(0);
    await expect(page.locator('.editor-host:visible')).toHaveCount(2);
    await expect(page.locator(`.editor-host[data-editor-pane="${side}"]:visible`)).toHaveAttribute(
      'aria-label',
      'note.md',
    );
    await expect(rich).toHaveAttribute('data-instance', 'before-edge-split');
    await expect(rich.locator('h1')).toHaveText('한글 제목 local');
    await rich.focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(rich.locator('h1')).toHaveText('한글 제목');
    const other = side === 'primary' ? 'secondary' : 'primary';
    const target = (await page
      .locator(`.editor-host[data-editor-pane="${other}"]:visible`)
      .boundingBox())!;
    const again = (await source.boundingBox())!;
    await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 14 });
    await expect(page.locator('.tab-drop-preview')).toHaveAttribute('data-drop-action', 'move');
    await page.mouse.up();
    await expect(page.locator('.editor-host[data-editor-pane="primary"]:visible')).toHaveAttribute(
      'aria-label',
      'note.md',
    );
    await expect(page.locator('.tab')).toHaveCount(2);
    await expect(page.getByRole('separator', { name: 'Resize editor panes' })).toHaveCount(0);
    await expect(rich).toHaveAttribute('data-instance', 'before-edge-split');
  });
test('edge split preview cancels with Escape; center and outside drops do not split', async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('config.yaml');
  const from = (await page.locator('.tab > button[title]').first().boundingBox())!,
    area = (await page.locator('.editor-workspace').boundingBox())!;
  for (const cancel of [true, false]) {
    await page.mouse.move(from.x + 25, from.y + 15);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width - 20, area.y + 80, { steps: 10 });
    await expect(page.locator('.tab-drop-preview')).toBeVisible();
    if (cancel) await page.keyboard.press('Escape');
    else await page.mouse.move(area.x + area.width / 2, area.y + 80, { steps: 8 });
    await expect(page.locator('.tab-drop-preview')).toHaveCount(0);
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Split view', exact: true })).toBeVisible();
    await expect(page.locator('.tab')).toHaveCount(2);
  }
  await page.mouse.move(from.x + 25, from.y + 15);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width - 20, area.y + 80, { steps: 10 });
  await page.mouse.move(5, 10, { steps: 10 });
  await expect(page.locator('.tab-drop-preview')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Split view', exact: true })).toBeVisible();
});
test('pointer tab reorder and cancellation retain dirty text, editor instance and undo', async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('config.yaml');
  await page.keyboard.press('ControlOrMeta+n');
  const content = page.locator('.cm-content:visible');
  await content.click();
  await page.keyboard.type('unsaved drag');
  await content.evaluate((el) => (el.dataset.testInstance = 'original'));
  const bar = page.getByRole('navigation', { name: 'Documents', exact: true });
  await dragTab(
    page,
    bar.getByRole('button', { name: /Untitled/ }).first(),
    bar.locator('.tab').first(),
  );
  await expect(bar.locator('.tab > button:first-child')).toHaveText([
    /Untitled/,
    /note.md/,
    /config.yaml/,
  ]);
  await expect(content).toHaveAttribute('data-test-instance', 'original');
  await expect(content).toContainText('unsaved drag');
  await expect(page.getByLabel('Unsaved changes')).toHaveCount(1);
  const bounds = (await bar.locator('.tab').first().boundingBox())!;
  await page.mouse.move(bounds.x + 40, bounds.y + 15);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 180, bounds.y + 120, { steps: 10 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(bar.locator('.tab > button:first-child')).toHaveText([
    /Untitled/,
    /note.md/,
    /config.yaml/,
  ]);
  await bar.locator('.tab > button:first-child').first().focus();
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await expect(bar.locator('.tab > button:first-child')).toHaveText([
    /note.md/,
    /Untitled/,
    /config.yaml/,
  ]);
  await content.focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(content).not.toContainText('unsaved drag');
});
test('split pane focus routes saves correctly and cross-pane drag keeps Rich undo', async ({
  page,
}) => {
  await launch(page);
  const rich = page.locator('.ProseMirror');
  await rich.locator('h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' local');
  await rich.evaluate((el) => (el.dataset.testInstance = 'rich-original'));
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('config.yaml');
  await page
    .getByRole('navigation', { name: 'Documents', exact: true })
    .getByRole('button', { name: /^M↓.*note.md/ })
    .click();
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await expect(page.locator('.editor-host:visible')).toHaveCount(2);
  const left = page.locator('.editor-host[data-editor-pane="primary"]:visible');
  const right = page.locator('.editor-host[data-editor-pane="secondary"]:visible');
  await expect(left).toHaveAttribute('aria-label', 'config.yaml');
  await expect(right).toHaveAttribute('aria-label', 'note.md');
  await left.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('left: []');
  await page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(() => page.evaluate(() => (window as any).__testSaved.at(-1)?.path))
    .toBe('/test/config.yaml');
  expect(await page.evaluate(() => (window as any).__testSaved.at(-1).text)).toContain('left: []');
  await expect(page.getByLabel('Unsaved changes')).toHaveCount(1);
  await right.locator('h1').click();
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('note.md');
  await dragTab(
    page,
    page.getByRole('navigation', { name: 'Right documents' }).locator('.tab > button:first-child'),
    page.getByRole('navigation', { name: 'Documents', exact: true }).locator('.tab'),
  );
  await expect(page.getByRole('separator', { name: 'Resize editor panes' })).toHaveCount(0);
  await expect(rich).toHaveAttribute('data-test-instance', 'rich-original');
  await rich.focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(rich.locator('h1')).toHaveText('한글 제목');
  await expect(page.getByRole('button', { name: 'Split view', exact: true })).toBeVisible();
  await expect(page.locator('.editor-host:visible')).toHaveCount(1);
  await expect(page.locator('.tab')).toHaveCount(2);
  await expect(rich).toHaveAttribute('data-test-instance', 'rich-original');
});
test('split divider resizes, dirty close can cancel, and discard collapses the empty group', async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('config.yaml');
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await expect(page.locator('.editor-host[data-editor-pane="secondary"]:visible')).toHaveAttribute(
    'aria-label',
    'config.yaml',
  );
  const divider = page.getByRole('separator', { name: 'Resize editor panes' });
  await divider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '55');
  const rect = (await divider.boundingBox())!;
  await page.mouse.move(rect.x + 3, rect.y + 50);
  await page.mouse.down();
  await page.mouse.move(400, rect.y + 50, { steps: 8 });
  await page.mouse.up();
  expect(Number(await divider.getAttribute('aria-valuenow'))).toBeLessThan(55);
  const right = page.locator('.editor-host[data-editor-pane="secondary"]:visible');
  await right.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('dirty');
  await page.getByRole('button', { name: 'Close config.yaml', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(right.locator('.cm-content')).toContainText('dirty');
  await page.setViewportSize({ width: 700, height: 650 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/split-view.png' });
  await page.getByRole('button', { name: 'Close config.yaml', exact: true }).click();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByRole('separator', { name: 'Resize editor panes' })).toHaveCount(0);
  await expect(page.locator('.ProseMirror:visible')).toBeVisible();
});
test('QA.md Rich single-space save preserves every unrelated source byte, including after undo and Raw sync', async ({
  page,
}) => {
  const source = readFileSync('tests/fixtures/markdown/qa-source.md', 'utf8').replace(
    /\r\n/g,
    '\n',
  );
  const needle = '아래 PASS는 명시한 범위에만 적용한다.';
  await launch(page, source, 'QA.md');
  const paragraph = page.locator('.ProseMirror > p').first();
  await paragraph.click();
  await paragraph.evaluate((el) => {
    const selection = window.getSelection()!;
    selection.selectAllChildren(el);
    selection.collapseToEnd();
  });
  await page.keyboard.type(' ');
  await page.keyboard.press('ControlOrMeta+s');
  expect(await page.evaluate(() => (window as any).__testSaved.at(-1).text)).toBe(
    source.replace(needle, needle + ' '),
  );
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+s');
  expect(await page.evaluate(() => (window as any).__testSaved.at(-1).text)).toBe(source);
  await page.getByRole('button', { name: 'Raw', exact: true }).click();
  await page.locator('.cm-content:visible').click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('End');
  await page.keyboard.type(' raw');
  await page.getByRole('button', { name: 'Rich', exact: true }).click();
  await paragraph.click();
  await paragraph.evaluate((el) => {
    const selection = window.getSelection()!;
    selection.selectAllChildren(el);
    selection.collapseToEnd();
  });
  await page.keyboard.type(' ');
  await page.keyboard.press('ControlOrMeta+s');
  expect(await page.evaluate(() => (window as any).__testSaved.at(-1).text)).toBe(
    source.replace('기록\n', '기록 raw\n').replace(needle, needle + ' '),
  );
});
test('HTML source next to edited text is preserved', async ({ page }) => {
  const source = '<br />\n\nparagraph\n';
  await launch(page, source);
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' edit');
  await page.keyboard.press('ControlOrMeta+s');
  expect(await page.evaluate(() => (window as any).__testSaved.at(-1).text)).toBe(
    source.replace('paragraph', 'paragraph edit'),
  );
});
test('a source preservation error blocks saving while keeping Raw recovery editable', async ({
  page,
}) => {
  await launch(page, '<br />\n\nparagraph\n');
  const rich = page.locator('.ProseMirror');
  await rich.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' edit');
  // Fault injection for the save guard; the HTML fixture itself is supported.
  await page.evaluate(async () => {
    const modulePath = '/src/tabs/tabStore.ts';
    const { tabs } = await import(modulePath);
    tabs.patch(tabs.get().active!, {
      richError: '원문 보존 실패: Raw에서 편집 내용을 확인해 주세요.',
      dirty: true,
    });
  });
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByRole('alert')).toContainText('Raw');
  expect(await page.evaluate(() => (window as any).__testSaved.length)).toBe(0);
  await page.getByRole('button', { name: 'Raw', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('paragraph edit');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' reviewed');
  await page.keyboard.press('ControlOrMeta+s');
  expect(await page.evaluate(() => (window as any).__testSaved.at(-1).text)).toContain(
    'paragraph edit',
  );
});
test('rich editing, nested checkbox, table, raw sync and no-op save', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://example.com')) external.push(request.url());
  });
  await launch(page);
  const rich = page.locator('.ProseMirror');
  await expect(rich.locator('h1')).toHaveText('한글 제목');
  await page.keyboard.press('ControlOrMeta+s');
  expect(await page.evaluate(() => (window as any).__testSaved.length)).toBe(0);
  await page.getByRole('checkbox', { name: 'Toggle task' }).first().check();
  await expect(page.getByLabel('Unsaved changes')).toBeVisible();
  await rich.locator('h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' 수정');
  await rich.locator('td').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type('0');
  await page.getByRole('button', { name: 'Raw', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('[x] parent');
  await expect(page.locator('.cm-content')).toContainText('수정');
  await expect(page.locator('.cm-content')).toContainText('1000');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n\nRaw addition');
  await page.getByRole('button', { name: 'Rich', exact: true }).click();
  await expect(rich).toContainText('Raw addition');
  await page.keyboard.press('ControlOrMeta+s');
  const saved = await page.evaluate(() => (window as any).__testSaved.at(-1).text);
  expect(saved).toContain('[x] parent');
  expect(saved).toContain('[x] child');
  expect(saved).toContain('Raw addition');
  expect(external).toEqual([]);
  await page.screenshot({ path: 'test-results/rich-editor.png', fullPage: true });
});
test('multi-tab undo survives switching and YAML stays plain text', async ({ page }) => {
  await launch(page);
  await expect(page.locator('.ProseMirror h1')).toBeVisible();
  await page.locator('.ProseMirror h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type('ABC');
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.cm-content:visible')).toContainText('items: []');
  expect(await page.locator('section:visible input[type=checkbox]').count()).toBe(0);
  await page.locator('.tab button[title="/test/note.md"]').click();
  await page.locator('.ProseMirror h1').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.ProseMirror h1')).toHaveText('한글 제목');
});
test('dirty close can cancel, discard or save', async ({ page }) => {
  await launch(page, 'original', 'note.txt');
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' changed');
  await page.getByRole('button', { name: 'Close note.txt' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toContainText('changed');
  await page.getByRole('button', { name: 'Close note.txt' }).click();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No documents open' })).toBeVisible();
});
test('external changes reload clean tabs and protect local changes', async ({ page }) => {
  await launch(page, 'original', 'note.txt');
  await expect(page.locator('.cm-content')).toContainText('original');
  await page.evaluate(() => {
    const d = (window as any).__testDisk.get('/test/note.txt');
    d.text = 'external';
    d.revision = 'external1';
  });
  await expect(page.locator('.cm-content')).toContainText('external');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' local');
  await page.evaluate(() => {
    const d = (window as any).__testDisk.get('/test/note.txt');
    d.text = 'new external';
    d.revision = 'external2';
  });
  await expect(page.getByRole('button', { name: 'Keep Mine', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep Mine', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+s');
  expect(await page.evaluate(() => (window as any).__testSaved.at(-1).text)).toContain(
    'external local',
  );
});
test('JSON opens, folds, reports syntax errors and saves without rewriting numeric values', async ({
  page,
}) => {
  const source =
    '{\n  "name": "사과",\n  "id": 9007199254740993,\n  "cost": 1e+03,\n  "enabled": true\n}\n';
  await launch(page, source, 'items.JSON');
  await expect(page.getByLabel('json source editor')).toBeVisible();
  await expect(page.locator('.statusbar')).toContainText('JSON');
  await page.getByTitle('Fold line', { exact: true }).first().click();
  await expect(page.locator('.cm-foldPlaceholder')).toBeVisible();
  await page.locator('.cm-foldPlaceholder').click();
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('!');
  await expect(page.locator('.cm-lint-marker-error')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.cm-lintPoint-error')).toHaveCount(0);
  await expect(page.locator('.cm-lint-marker-error')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('No changes to save.')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__testSaved.length)).toBe(0);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' ');
  await page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(() => page.evaluate(() => (window as any).__testSaved.at(-1)?.text))
    .toBe(source + ' ');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /New file/ }).click();
  await page.getByRole('button', { name: 'Select syntax', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'JSON .json', exact: true }).click();
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('Untitled');
  await expect(page.getByLabel('json source editor').last()).toBeVisible();
});

for (const [name, source] of [
  ['items.yaml', '# comment\n- id: 1\n  name: "사과"\n  enabled: true\n  nothing: null\n'],
  ['items.json', '{"name": "사과", "id": 30, "enabled": true, "nothing": null}\n'],
  ['items.xml', '<!-- comment -->\n<item id="30">사과</item>\n'],
  ['items.md', '# Heading\n\n**Strong** and [link](https://example.com)\n\n`code`\n'],
]) {
  test(`syntax contrast follows system theme without editing or remounting: ${name}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await launch(page, source, name);
    if (name.endsWith('.md')) await page.getByRole('button', { name: 'Raw', exact: true }).click();
    await page.locator('.cm-content').evaluate((el) => (el.dataset.instance = 'preserved'));
    const palettes: string[][] = [];
    for (const theme of ['dark', 'light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const result = await page.locator('.cm-editor').evaluate((el) => {
        const colors = [
          ...new Set(
            Array.from(el.querySelectorAll('.cm-line span')).map(
              (span) => getComputedStyle(span).color,
            ),
          ),
        ];
        const backgrounds = [
          getComputedStyle(el).backgroundColor,
          getComputedStyle(el.querySelector('.cm-activeLine')!).backgroundColor,
        ];
        const luminance = (color: string) =>
          color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((v) => v / 255)
            .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
            .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        const contrast = colors.flatMap((color) =>
          backgrounds.map((background) => {
            const a = luminance(color),
              b = luminance(background);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          }),
        );
        return { colors, contrast };
      });
      expect(result.colors.length).toBeGreaterThan(1);
      expect(Math.min(...result.contrast)).toBeGreaterThanOrEqual(4.5);
      palettes.push(result.colors);
      await expect(page.locator('.cm-content')).toHaveAttribute('data-instance', 'preserved');
      await expect(page.getByLabel('Unsaved changes')).toHaveCount(0);
    }
    expect(palettes[0]).not.toEqual(palettes[1]);
    expect(palettes[0]).toEqual(palettes[2]);
  });
}

test('XML syntax and find/replace panel', async ({ page }) => {
  await launch(page, '<root><name>한글</name></root>', 'data.xml');
  await expect(page.locator('.cm-content')).toContainText('<root>');
  await page.keyboard.press('ControlOrMeta+h');
  await expect(page.locator('.cm-search')).toBeVisible();
  expect(await page.locator('.cm-line span').count()).toBeGreaterThan(0);
});

for (const [name, text] of [
  [
    'large.txt',
    'Plain text line with enough content to exercise viewport rendering.\n'.repeat(160000),
  ],
  ['large.yaml', 'items: [one, two, three] # sample data\n'.repeat(60000)],
  ['large.xml', '<item name="sample">Some content</item>\n'.repeat(56000)],
  [
    'large.md',
    '# Large document\n\n' +
      ('A paragraph of plain words to test editing and rendering. '.repeat(20) + '\n\n').repeat(
        950,
      ),
  ],
]) {
  test(`performance: ${name} opens and edits`, async ({ page }) => {
    test.setTimeout(90000);
    const start = Date.now();
    await launch(page, text, name);
    const rich = name.endsWith('.md');
    if (rich) await page.getByRole('button', { name: 'Open Rich', exact: true }).click();
    const editor = page.locator(rich ? '.ProseMirror' : '.cm-content');
    await expect(editor).toBeVisible({ timeout: 60000 });
    await editor.click({ position: { x: 20, y: 15 } });
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.type('X');
    await expect(page.getByLabel('Unsaved changes')).toBeVisible({ timeout: 30000 });
    console.log(
      `${name}: ${new TextEncoder().encode(text).length} bytes, open/edit ${Date.now() - start}ms`,
    );
  });
}

test('rich find, table structure commands, and task stress', async ({ page }) => {
  await launch(
    page,
    '# Tasks\n\n' + '- [ ] task\n'.repeat(100) + '\n| A | B |\n| --- | --- |\n| one | two |\n',
  );
  const boxes = page.getByRole('checkbox', { name: 'Toggle task' });
  await expect(boxes).toHaveCount(100);
  for (let i = 0; i < 15; i++) await boxes.nth(i).check();
  await page.keyboard.press('ControlOrMeta+f');
  await page.getByLabel('Find in document').fill('Tasks');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.rich-search')).toContainText('1 / 1');
  await page.getByLabel('Close find').click();
  await page.locator('.ProseMirror td').first().click();
  await page.getByRole('button', { name: 'rowAdd', exact: true }).click();
  await expect(page.locator('.ProseMirror tr')).toHaveCount(3);
  await page.getByRole('button', { name: 'columnAdd', exact: true }).click();
  await expect(page.locator('.ProseMirror th')).toHaveCount(3);
  await page.getByRole('button', { name: 'columnDelete', exact: true }).click();
  await expect(page.locator('.ProseMirror th')).toHaveCount(2);
  await page.getByRole('button', { name: 'rowDelete', exact: true }).click();
  await expect(page.locator('.ProseMirror tr')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+s');
  expect(
    await page.evaluate(() => (window as any).__testSaved.at(-1).text.match(/- \[x\]/g).length),
  ).toBe(15);
});

test('immediate save and raw switching never drop the last keystroke', async ({ page }) => {
  await launch(page, '# Start\n');
  await page.locator('.ProseMirror h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type('FINAL');
  await page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(() => page.evaluate(() => (window as any).__testSaved.at(-1)?.text))
    .toContain('FINAL');
  await page.keyboard.press('ControlOrMeta+Shift+m');
  await expect(page.locator('.cm-content')).toContainText('FINAL');
});

test('image requests are blocked until explicitly loaded and links use the bridge', async ({
  page,
}) => {
  let imageRequests = 0;
  await page.route('https://example.com/tracker.png', async (route) => {
    imageRequests++;
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
        'base64',
      ),
    });
  });
  await launch(page, markdown + '\n[Example](https://example.com)\n');
  await expect(page.getByText('Remote image blocked · Tracker')).toBeVisible();
  expect(imageRequests).toBe(0);
  await page.getByRole('button', { name: 'Load once' }).click();
  await expect.poll(() => imageRequests).toBe(1);
  await page.getByRole('link', { name: 'Example', exact: true }).click();
  expect(page.url()).toBe('http://127.0.0.1:1420/');
});
