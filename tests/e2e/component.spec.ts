import { expect, test, type Page } from '@playwright/test';

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const unexpectedRequests = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  unexpectedRequests.set(page, []);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') {
      await route.continue();
      return;
    }
    if (url.hostname === 'media.prts.wiki') {
      if (route.request().resourceType() !== 'image') {
        unexpectedRequests.get(page)?.push(route.request().url());
        await route.abort('blockedbyclient');
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: transparentPng,
      });
      return;
    }
    unexpectedRequests.get(page)?.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  expect(unexpectedRequests.get(page), 'unexpected external request').toEqual([]);
});

test('loads the single-script single-tag demo without external data access', async ({
  page,
}) => {
  await expect(page.locator('script[src]')).toHaveCount(1);
  await expect(page.locator('arknights-name-input')).toHaveCount(1);
});

test('static server rejects encoded path traversal', async ({ request }) => {
  const response = await request.get('/..%2Fpackage.json');
  expect(response.status()).toBe(400);
});

test('searches initials, alias pinyin, and alternate name pronunciations', async ({
  page,
}) => {
  const component = page.locator('arknights-name-input');
  const input = component.locator('input');

  for (const [query, expected] of [
    ['ll', '铃兰'],
    ['linglanma', '忍冬'],
    ['zhongyue', '重岳'],
  ] as const) {
    await input.fill(query);
    await expect(component.locator('[role=option]').first()).toContainText(expected);
  }
});

test('keyboard selection exposes active descendant and emits the stable ID', async ({
  page,
}) => {
  const component = page.locator('arknights-name-input');
  const input = component.locator('input');

  await input.fill('ll');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    /-option-0$/,
  );
  await input.press('Enter');

  await expect(input).toHaveValue('铃兰');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#output')).toContainText('"id": "prts:147"');
});

test('Escape closes candidates without changing free text', async ({ page }) => {
  const component = page.locator('arknights-name-input');
  const input = component.locator('input');

  await input.fill('ling');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await input.press('Escape');

  await expect(input).toHaveValue('ling');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(input).not.toHaveAttribute('aria-activedescendant', /.*/);
});

test('max-results limits visible candidates and click selects one', async ({
  page,
}) => {
  const component = page.locator('arknights-name-input');
  const input = component.locator('input');

  await component.evaluate((element) => element.setAttribute('max-results', '2'));
  await input.fill('a');
  await expect(component.locator('[role=option]')).toHaveCount(2);
  const expectedName = await component
    .locator('[role=option]')
    .first()
    .locator('.name')
    .textContent();
  await component.locator('[role=option]').first().click();

  await expect(input).toHaveValue(expectedName ?? '');
});

test.describe('touch selection', () => {
  test.skip(({ isMobile }) => !isMobile, 'requires a mobile browser project');

  test('selects a candidate in mobile projects', async ({ page }) => {
    const component = page.locator('arknights-name-input');
    const input = component.locator('input');

    await input.fill('zhongyue');
    await component.locator('[role=option]').first().tap();

    await expect(input).toHaveValue('重岳');
  });
});

test('failed avatar requests do not prevent selection', async ({ page }) => {
  await page.unroute('**/*');
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') {
      await route.continue();
      return;
    }
    await route.abort('failed');
  });

  const component = page.locator('arknights-name-input');
  const input = component.locator('input');
  await input.fill('ll');
  const option = component.locator('[role=option]').first();
  await expect(option).toContainText('铃兰');
  await option.click();

  await expect(input).toHaveValue('铃兰');
});

test('unknown text remains invalid while an exact official name is valid', async ({
  page,
}) => {
  const component = page.locator('arknights-name-input');
  const input = component.locator('input');

  await input.fill('不存在的干员');
  await expect(input).toHaveValue('不存在的干员');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(component.locator('[role=status]')).toContainText('未找到干员');
  await expect
    .poll(() => component.evaluate((element) => (
      element as HTMLElement & { valid: boolean }
    ).valid))
    .toBe(false);

  await input.fill('铃兰');
  await expect
    .poll(() => component.evaluate((element) => (
      element as HTMLElement & { valid: boolean }
    ).valid))
    .toBe(true);
  await expect(page.locator('#output')).toHaveText('尚未选择');
});
