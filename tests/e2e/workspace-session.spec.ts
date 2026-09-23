import { expect, test } from '@playwright/test';

test('reopens unsaved tabs with their selection and split layout after reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.new-tab').click();
  await page.getByLabel('text source editor').locator('.cm-content').fill('draft survives restart');
  await page.locator('.new-tab').click();
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await expect(page.locator('[data-tab-pane="secondary"] .tab.active')).toHaveCount(1);
  await expect(page.locator('[data-tab-pane="primary"] .tab')).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = localStorage.getItem('markraft.workspace');
        return value ? JSON.parse(value).state.split : false;
      }),
    )
    .toBe(true);

  await page.reload();

  await expect(page.locator('.editor-workspace.is-split')).toBeVisible();
  await expect(page.locator('[data-tab-pane="primary"] .tab-name')).toHaveText('Untitled');
  await expect(page.locator('[data-tab-pane="secondary"] .tab-name')).toHaveText('Untitled 2');
  await expect(page.locator('[data-tab-pane="secondary"] .tab.active')).toHaveCount(1);
  await expect(page.getByLabel('text source editor').locator('.cm-content').first()).toContainText(
    'draft survives restart',
  );
});
