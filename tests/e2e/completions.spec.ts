import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, name: string, text: string) {
  await page.addInitScript(
    ({ name, text }) => {
      let pending = true;
      Object.assign(window, {
        __TAURI_INTERNALS__: {
          invoke: async (command: string) => {
            if (command === 'take_pending') {
              const docs = pending
                ? [
                    {
                      Ok: {
                        path: `/test/${name}`,
                        name,
                        text,
                        encoding: 'UTF-8',
                        lineEnding: 'LF',
                        revision: '1',
                      },
                    },
                  ]
                : [];
              pending = false;
              return docs;
            }
            if (command === 'check_document') return '1';
            return null;
          },
        },
      });
    },
    { name, text },
  );
  await page.goto('/');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText(name);
  await page.waitForLoadState('networkidle');
  if (name.endsWith('.md')) await page.getByRole('button', { name: 'Raw', exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
}

test('word suggestions accept deliberately, undo, and leave Enter/Tab unchanged otherwise', async ({
  page,
}) => {
  await open(page, 'words.txt', 'userName\n');
  await page.keyboard.type('us');
  await page.keyboard.press('ControlOrMeta+Space');
  await expect(page.getByRole('option', { name: 'userName', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-line').nth(1)).toHaveText('us');
  await expect(page.locator('.cm-line').last()).toHaveText('');
  await page.keyboard.type('us');
  await page.keyboard.press('ControlOrMeta+Space');
  await expect(page.getByRole('option', { name: 'userName', exact: true })).toBeVisible();
  // CodeMirror deliberately ignores navigation during its 75ms interaction guard.
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'userName', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Tab');
  await expect(page.locator('.cm-line').last()).toHaveText('userName');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.cm-line').last()).toHaveText('us');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(page.locator('.cm-line').last()).not.toHaveText('userName');
});

for (const [name, seed, typed, completion] of [
  ['index.html', '', '<di', 'div'],
  ['style.css', 'div {\n', 'backg', 'background'],
  ['query.sql', '', 'SEL', 'select'],
]) {
  test(`${name} retains language completions`, async ({ page }) => {
    await open(page, name, seed);
    await page.keyboard.type(typed);
    const option = page.getByRole('option').filter({
      has: page.locator('.cm-completionLabel', { hasText: new RegExp(`^${completion}$`) }),
    });
    await expect(option).toBeVisible();
    await option.click();
    await expect(page.locator('.cm-content')).toContainText(completion);
  });
}

test('Edit menu explicitly requests completion and Escape dismisses it', async ({ page }) => {
  await open(page, 'words.txt', 'userName\nu');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /Complete/ }).click();
  await expect(page.getByRole('option', { name: 'userName', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Completions' })).toHaveCount(0);
  await expect(page.locator('.cm-line').last()).toHaveText('u');
});

for (const name of ['notes.txt', 'app.log', 'notes.md']) {
  test(`${name} stays quiet while typing and completes on request`, async ({ page }) => {
    await open(page, name, 'userName\n');
    await page.keyboard.type('user');
    // Wait beyond automatic activation and source gathering delays.
    await page.waitForTimeout(500);
    await expect(page.getByRole('listbox', { name: 'Completions' })).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Space');
    await expect(page.getByRole('option', { name: 'userName', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.type('N');
    await page.waitForTimeout(500);
    await expect(page.getByRole('listbox', { name: 'Completions' })).toHaveCount(0);
    await expect(page.locator('.cm-line').last()).toHaveText('userN');
  });
}

test('bracket and quote pairs still close and delete together', async ({ page }) => {
  await open(page, 'code.js', '');
  for (const [opening, pair] of [
    ['(', '()'],
    ['[', '[]'],
    ['{', '{}'],
    ['"', '""'],
  ]) {
    await page.keyboard.type(opening);
    await expect(page.locator('.cm-content')).toHaveText(pair);
    await page.keyboard.press('Backspace');
    await expect(page.locator('.cm-content')).toHaveText('');
  }
});
