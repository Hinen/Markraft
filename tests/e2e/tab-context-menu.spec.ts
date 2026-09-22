import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, saveMode = 'save') {
  await page.addInitScript((mode) => {
    Object.assign(window, {
      __tabSaves: [],
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: any) => {
          if (command === 'take_pending') return [];
          if (command === 'save_document') {
            if (mode === 'cancel') return null;
            if (mode === 'error') throw new Error('Save failed');
            if (mode === 'delay')
              await new Promise<void>((resolve) => {
                (window as any).__releaseTabSave = resolve;
              });
            (window as any).__tabSaves.push(args.request);
            return {
              ...args.request,
              path: `/test/${args.request.suggestedName}`,
              name: args.request.suggestedName,
              revision: '1',
            };
          }
          if (command === 'check_document') return '1';
          return null;
        },
      },
    });
  }, saveMode);
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/src/tabs/tabStore.ts';
    const { tabs } = await import(modulePath);
    for (let i = 0; i < 4; i++) tabs.new();
    const [a, b, c, d] = tabs.get().tabs;
    tabs.edit(b.id, 'keep B unsaved');
    tabs.edit(c.id, 'keep C unsaved');
    tabs.splitView();
    tabs.move(c.id, 'secondary', d.id, true);
    tabs.select(b.id);
    tabs.select(d.id);
  });
  await expect(page.locator('.tab')).toHaveCount(4);
}
const tab = (page: Page, name: string) =>
  page
    .locator('.tab > button[title]')
    .filter({ has: page.locator('.tab-name', { hasText: new RegExp(`^${name}$`) }) });
async function menu(page: Page, name: string) {
  await tab(page, name).click({ button: 'right' });
  return page.getByRole('menu', { name: `Tab actions for ${name}`, exact: true });
}

test('right click closes the targeted inactive tab, not the active tab', async ({ page }) => {
  await setup(page);
  const popup = await menu(page, 'Untitled');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('Untitled 4');
  await popup.getByRole('menuitem', { name: 'Close tab', exact: true }).click();
  await expect(page.locator('.tab')).toHaveCount(3);
  await expect(tab(page, 'Untitled')).toHaveCount(0);
  await expect(tab(page, 'Untitled 4')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('cancel after Discard preserves every tab, unsaved text and split selections', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const modulePath = '/src/tabs/tabStore.ts';
    const { tabs } = await import(modulePath);
    const [a, b, c, d] = tabs.get().tabs;
    tabs.move(b.id, 'secondary', c.id, true);
    tabs.select(d.id);
  });
  const popup = await menu(page, 'Untitled 4');
  await popup.getByRole('menuitem', { name: 'Close other tabs', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Untitled 3');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.tab')).toHaveCount(4);
  await expect(page.locator('[data-tab-pane="primary"] .tab.active .tab-name')).toHaveText(
    'Untitled',
  );
  await expect(page.locator('[data-tab-pane="secondary"] .tab.active .tab-name')).toHaveText(
    'Untitled 4',
  );
  await expect(page.getByLabel('Unsaved changes')).toHaveCount(2);
  await tab(page, 'Untitled 2').click();
  await expect(page.locator('[data-editor-pane="secondary"] .cm-content:visible')).toHaveText(
    'keep B unsaved',
  );
});

for (const [target, survivor, removed] of [
  ['Untitled', 'Untitled', 'Untitled 2'],
  ['Untitled 4', 'Untitled 4', 'Untitled 3'],
]) {
  test(`close others in ${target} preserves the opposite pane`, async ({ page }) => {
    await setup(page);
    await (
      await menu(page, target)
    )
      .getByRole('menuitem', { name: 'Close other tabs', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toContainText(removed);
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.tab')).toHaveCount(3);
    await expect(tab(page, survivor)).toBeVisible();
    await expect(tab(page, removed)).toHaveCount(0);
    await expect(page.locator('[data-tab-pane="secondary"]')).toBeVisible();
    await expect(page.getByLabel('Unsaved changes')).toHaveCount(1);
    const popup = await menu(page, survivor);
    await expect(popup.getByRole('menuitem')).toHaveCount(3);
    await expect(
      popup.getByRole('menuitem', { name: 'Close other tabs', exact: true }),
    ).toBeDisabled();
  });
}

test('close this pane preserves the other pane and collapses the split', async ({ page }) => {
  await setup(page);
  await (
    await menu(page, 'Untitled 4')
  )
    .getByRole('menuitem', { name: 'Close all tabs', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Untitled 3');
  await page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.locator('.tab-name')).toHaveText(['Untitled', 'Untitled 2']);
  await expect(page.locator('[data-tab-pane="secondary"]')).toHaveCount(0);
  await expect(page.getByLabel('Unsaved changes')).toHaveCount(1);
});

for (const mode of ['cancel', 'error']) {
  test(`Save As ${mode} keeps all tabs and edits`, async ({ page }) => {
    await setup(page, mode);
    await (
      await menu(page, 'Untitled 4')
    )
      .getByRole('menuitem', { name: 'Close all tabs', exact: true })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    if (mode === 'error') await expect(page.getByRole('alert')).toContainText('Save failed');
    await expect(page.locator('.new-tab').first()).toBeEnabled();
    await expect(page.locator('.tab')).toHaveCount(4);
    await expect(page.getByLabel('Unsaved changes')).toHaveCount(2);
    await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('Untitled 4');
  });
}

test('edits arriving during a bulk save prevent any tabs from closing', async ({ page }) => {
  await setup(page, 'delay');
  await (
    await menu(page, 'Untitled')
  )
    .getByRole('menuitem', { name: 'Close all tabs', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).__releaseTabSave))
    .toBe('function');
  await tab(page, 'Untitled').click();
  await page
    .locator('[data-editor-pane="primary"] .cm-content:visible')
    .fill('new edit during save');
  await page.evaluate(() => (window as any).__releaseTabSave());
  await expect(page.getByRole('alert')).toContainText('New edits');
  await expect(page.locator('.tab')).toHaveCount(4);
  await expect(page.locator('[data-editor-pane="primary"] .cm-content:visible')).toHaveText(
    'new edit during save',
  );
});

test('keyboard menu, viewport bounds, Escape and outside click', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 420 });
  await setup(page);
  await tab(page, 'Untitled 4').focus();
  await page.keyboard.press('Shift+F10');
  const popup = page.getByRole('menu', { name: 'Tab actions for Untitled 4', exact: true });
  await expect(popup).toBeVisible();
  const bounds = (await popup.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(640);
  await page.keyboard.press('End');
  await expect(popup.getByRole('menuitem', { name: 'Close all tabs', exact: true })).toBeFocused();
  await page.screenshot({ path: 'test-results/tab-context-menu.png' });
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await expect(tab(page, 'Untitled 4')).toBeFocused();
  await menu(page, 'Untitled 4');
  await page.locator('.statusbar').click({ position: { x: 10, y: 10 } });
  await expect(popup).toHaveCount(0);
  await expect(page.locator('.tab')).toHaveCount(4);
});

test('close all confirms each draft and returns to the welcome screen', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Merge panes', exact: true }).click();
  await (
    await menu(page, 'Untitled')
  )
    .getByRole('menuitem', { name: 'Close all tabs', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.locator('.tab')).toHaveCount(0);
  await expect(page.locator('.welcome')).toBeVisible();
  await page.locator('.new-tab').click();
  const popup = await menu(page, 'Untitled');
  await expect(
    popup.getByRole('menuitem', { name: 'Close other tabs', exact: true }),
  ).toBeDisabled();
  await expect(popup.getByRole('menuitem')).toHaveCount(3);
});
