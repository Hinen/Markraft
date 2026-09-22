import { expect, test } from '@playwright/test';

test('new files are extensionless in welcome, tab bar, shortcut and split pane', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.welcome').getByRole('button', { name: 'New file', exact: true }).click();
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('Untitled');
  await expect(page.getByRole('button', { name: 'Select syntax', exact: true })).toHaveText(
    'Plain Text',
  );
  await page.locator('.new-tab').click();
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('Untitled 2');
  await page.keyboard.press('ControlOrMeta+n');
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('Untitled 3');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /New Markdown/ })).toHaveCount(0);
  await page.getByRole('menuitem', { name: /New file/ }).click();
  await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('Untitled 4');
  await expect(page.getByRole('button', { name: 'Select syntax', exact: true })).toHaveText(
    'Plain Text',
  );
  await page.getByRole('button', { name: 'Split view', exact: true }).click();
  await page.getByRole('button', { name: 'New file in right pane', exact: true }).click();
  await expect(page.locator('[data-tab-pane="secondary"] .tab-name').last()).toHaveText(
    'Untitled 5',
  );
});

for (const [label, extension] of [
  ['JSON', 'json'],
  ['YAML', 'yml'],
  ['XML', 'xml'],
  ['Markdown', 'md'],
]) {
  test(`search and select ${label} without renaming or changing content`, async ({ page }) => {
    await page.goto('/');
    await page.locator('.new-tab').click();
    const source = page.getByLabel('text source editor').locator('.cm-content');
    await source.fill('hello world');
    await page.getByRole('button', { name: 'Select syntax', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search syntax' }).fill(`.${extension}`);
    await page.getByRole('textbox', { name: 'Search syntax' }).press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.pane-focused .tab.active .tab-name')).toHaveText('Untitled');
    await expect(page.getByRole('button', { name: 'Select syntax', exact: true })).toContainText(
      label,
    );
    await page.getByRole('button', { name: 'Select syntax', exact: true }).click();
    await page.getByRole('button', { name: 'Automatic (file name)', exact: true }).click();
    await expect(source).toHaveText('hello world');
    await expect(page.getByRole('button', { name: 'Select syntax', exact: true })).toHaveText(
      'Plain Text',
    );
    await page.getByRole('button', { name: 'Select syntax', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search syntax' }).fill('unknown');
    await expect(
      page.getByText('No matching syntax. Unknown extensions use Plain Text.'),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(source).toHaveText('hello world');
  });
}
