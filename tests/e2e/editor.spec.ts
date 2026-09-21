import { expect, test, type Page } from '@playwright/test';
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
            if (command === 'check_document') return disk.get(args.path)?.revision;
            if (command === 'read_document') return disk.get(args.path);
            if (command === 'save_document') {
              const request = args.request;
              const old = disk.get(request.path);
              if (old && old.revision !== request.revision) throw new Error('CONFLICT');
              const next = { ...doc, ...request, revision: `v${saved.length + 2}` };
              saved.push(next);
              disk.set(request.path, next);
              return next;
            }
            if (command === 'open_dialog')
              return [
                {
                  path: '/test/config.yaml',
                  name: 'config.yaml',
                  text: 'items: []\nname: 한글\n',
                  encoding: 'UTF-8',
                  lineEnding: 'LF',
                  revision: 'yaml1',
                },
              ];
            if (command === 'local_image') throw new Error('No fixture');
            return null;
          },
        },
      });
    },
    { text, name },
  );
  await page.goto('/');
}
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
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__testSaved.at(-1).text)).toBe(
    source.replace(needle, needle + ' '),
  );
  await page.keyboard.press('ControlOrMeta+z');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
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
  await page.getByRole('button', { name: 'Save', exact: true }).click();
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
  await page.getByRole('button', { name: 'Save', exact: true }).click();
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
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Raw');
  expect(await page.evaluate(() => (window as any).__testSaved.length)).toBe(0);
  await page.getByRole('button', { name: 'Raw', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('paragraph edit');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' reviewed');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
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
  await page.getByRole('button', { name: 'Save', exact: true }).click();
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
  await page.getByRole('button', { name: 'Save', exact: true }).click();
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
  await expect(page.getByText('A little space to think.')).toBeVisible();
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
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__testSaved.at(-1).text)).toContain(
    'external local',
  );
});
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
  await page.getByRole('button', { name: 'Save', exact: true }).click();
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
