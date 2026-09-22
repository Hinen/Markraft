import { expect, test, type Page } from '@playwright/test';

async function openDocument(page: Page, name: string, text: string) {
  await page.addInitScript(
    ({ name, text }) => {
      let pending = true;
      const doc = {
        path: `/test/${name}`,
        name,
        text,
        encoding: 'UTF-8',
        lineEnding: 'LF',
        revision: '1',
      };
      Object.assign(window, {
        __savedSyntax: null,
        __TAURI_INTERNALS__: {
          invoke: async (command: string, args: any) => {
            if (command === 'take_pending') {
              const result = pending ? [{ Ok: doc }] : [];
              pending = false;
              return result;
            }
            if (command === 'check_document') return doc.revision;
            if (command === 'save_document') {
              (window as any).__savedSyntax = args.request;
              Object.assign(doc, { text: args.request.text, revision: '2' });
              return doc;
            }
            return null;
          },
        },
      });
    },
    { name, text },
  );
  await page.goto('/');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText(name);
}

for (const [name, label, source] of [
  ['Cargo.toml', 'TOML', '[package]\nname = "hello"'],
  ['config.ini', 'INI', '[app]\nname=hello'],
  ['.env.local', 'Environment (.env)', 'export NAME="hello"'],
  ['config.jsonc', 'JSONC', '{ /* comment */ "id": 9007199254740993, }'],
  ['data.csv', 'CSV', 'name,value\n"a,b",42'],
  ['data.tsv', 'TSV', 'name\tvalue\n"a\tb"\t42'],
  ['index.html', 'HTML', '<div class="demo">hello</div>'],
  ['style.css', 'CSS', '.demo { color: red; }'],
  ['query.sql', 'SQL', 'SELECT id FROM users;'],
  ['app.js', 'JavaScript', 'const x = "hello";'],
  ['app.jsx', 'JavaScript JSX', 'const x = <div>Hello</div>;'],
  ['app.ts', 'TypeScript', 'const x: string = "hello";'],
  ['app.tsx', 'TypeScript TSX', 'const x = <div>Hello</div>;'],
  ['app.py', 'Python', 'def hello():\n    return "hello"'],
  ['.bashrc', 'Shell / Bash', 'export NAME="hello"'],
  ['script.ps1', 'PowerShell', '$name = "hello"'],
]) {
  test(`${label} detects, highlights and saves original source`, async ({ page }) => {
    await openDocument(page, name, source);
    await expect(page.getByRole('button', { name: 'Select syntax' })).toHaveText(label);
    await expect(page.locator('.cm-line span').first()).toBeVisible();
    const editor = page.locator('.cm-content:visible');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' ');
    await page.keyboard.press('ControlOrMeta+s');
    await expect
      .poll(() => page.evaluate(() => (window as any).__savedSyntax?.text))
      .toBe(source + ' ');
    const extensions = await page.evaluate(() =>
      (window as any).__savedSyntax.filters.flatMap((f: any) => f.extensions),
    );
    expect(extensions).toEqual(
      expect.arrayContaining([
        'toml',
        'ini',
        'env',
        'jsonc',
        'csv',
        'tsv',
        'html',
        'css',
        'sql',
        'js',
        'ts',
        'py',
        'sh',
        'ps1',
        '*',
      ]),
    );
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => page.evaluate(() => (window as any).__savedSyntax?.text)).toBe(source);
  });
}

test('JSONC allows comments and trailing commas but still marks invalid values', async ({
  page,
}) => {
  await openDocument(page, 'tsconfig.json', '{ // comment\n "value": 1,\n}');
  await expect(page.getByRole('button', { name: 'Select syntax' })).toHaveText('JSONC');
  await expect(page.locator('.cm-line span').first()).toBeVisible();
  // Let the debounced linter run before asserting the valid case.
  await page.waitForTimeout(1000);
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(0);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('{"value": }');
  await expect(page.locator('.cm-lintRange-error').first()).toBeVisible();
});

test('a failed grammar import keeps text editable and reports the failure', async ({ page }) => {
  await page.route(/lang-python/, (route) => route.abort());
  await openDocument(page, 'test.py', 'value = 1');
  await expect(page.getByText(/Could not load Python/)).toBeVisible();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('0');
  await expect(page.locator('.cm-content')).toHaveText('value = 10');
});

test('a delayed grammar cannot overwrite a newer Plain Text selection', async ({ page }) => {
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const loading = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route(/lang-python/, async (route) => {
    const response = await route.fetch();
    requested();
    await gate;
    await route.fulfill({ response });
  });
  const opening = openDocument(page, 'test.py', 'value = "hello"');
  await loading;
  try {
    await page.getByRole('button', { name: 'Select syntax' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Plain Text .txt', exact: true })
      .click();
  } finally {
    release();
  }
  await opening;
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Select syntax' })).toHaveText('Plain Text');
  await expect(page.locator('.cm-line span')).toHaveCount(0);
  await expect(page.locator('.cm-content')).toHaveText('value = "hello"');
});
