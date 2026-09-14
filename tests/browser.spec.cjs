'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const STORAGE_KEY = 'patchlight.recipe.v1';
const buttonOutput = page => page.getByRole('button', { name: 'ボタン 1の出力', exact: true });
const lightInput = page => page.getByRole('button', { name: 'あかり 1の入力', exact: true });
const pressButton = page => page.getByRole('button', { name: 'ボタン 1 押す', exact: true });
const light = page => page.getByRole('article', { name: 'あかり 1 ブロック', exact: true });
const readRecipe = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);

async function connectStarter(page) {
  await buttonOutput(page).click();
  await expect(buttonOutput(page)).toHaveAttribute('aria-pressed', 'true');
  await lightInput(page).click();
  await expect(page.locator('#edge-count')).toHaveText('1');
}

async function importJSON(page, value, filename = 'recipe.json') {
  await page.locator('#file-button').click();
  await page.locator('#import-input').setInputFiles({
    name: filename,
    mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
  });
}

// Every scenario checks the real page for uncaught errors and unexpected network
// traffic. Recipe sharing uses a URL fragment; no event or recipe request is needed.
test.beforeEach(async ({ page }) => {
  page.__appErrors = [];
  page.__externalRequests = [];
  page.on('pageerror', error => page.__appErrors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:4173') {
      page.__externalRequests.push(request.url());
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(page.__appErrors, 'No uncaught browser errors').toEqual([]);
  expect(page.__externalRequests, 'No CDN, analytics, or recipe upload requests').toEqual([]);
});

test('first visit: an unwired button cannot light a lamp; two port clicks make it work', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#recipe-title')).toHaveText('はじめてのあかり');
  await expect(page.locator('#edge-count')).toHaveText('0');
  await pressButton(page).click();
  await expect(page.locator('#preview-status')).toContainText('線をつなごう');
  await expect(light(page)).not.toHaveAttribute('data-lit', 'true');

  await connectStarter(page);
  await pressButton(page).click();
  await expect(light(page)).toHaveAttribute('data-lit', 'true');
  await expect(page.locator('#little-world')).toHaveClass(/lit/);
  await expect(page.locator('#lesson')).toHaveClass(/completed/);
  await expect(page.locator('#world-state')).toHaveText('あかりがついた');
});

test('keyboard ports, Escape cancellation, and arrow movement remain usable', async ({ page }) => {
  await page.goto('/');
  await buttonOutput(page).focus();
  await page.keyboard.press('Enter');
  await expect(buttonOutput(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(buttonOutput(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#edge-count')).toHaveText('0');

  await buttonOutput(page).focus();
  await page.keyboard.press('Space');
  await lightInput(page).focus();
  await page.keyboard.press('Enter');
  await expect(pressButton(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(light(page)).toHaveAttribute('data-lit', 'true');

  const before = await readRecipe(page);
  const handle = page.getByRole('button', { name: 'ボタン 1を移動', exact: true });
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(handle).toBeFocused();
  const moved = await readRecipe(page);
  expect(moved.nodes[0].x).toBe(before.nodes[0].x + 12);
  await page.locator('#undo-button').click();
  expect(await readRecipe(page)).toEqual(before);
});

test('first-use controls fit the phone screen and work with touch', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch reachability is covered by the phone project.');
  await page.goto('/');
  await expect(page.locator('#lesson-title')).toBeInViewport({ ratio: 1 });
  await expect(buttonOutput(page)).toBeInViewport({ ratio: 1 });
  await expect(lightInput(page)).toBeInViewport({ ratio: 1 });
  const geometry = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(geometry.content).toBeLessThanOrEqual(geometry.width);
  await buttonOutput(page).tap();
  await lightInput(page).tap();
  await pressButton(page).tap();
  await expect(light(page)).toHaveAttribute('data-lit', 'true');
  await expect(light(page)).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#share-button')).toBeVisible();
});

test('pointer drag changes only position and undo restores the recipe', async ({ page, context, isMobile }) => {
  await page.goto('/');
  await connectStarter(page);
  const before = await readRecipe(page);
  const handle = page.getByRole('button', { name: 'ボタン 1を移動', exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (isMobile) {
    // The phone project uses genuine browser touch input, exercising pointer
    // capture and touch-action instead of synthesizing DOM pointer events.
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: x + 48 * step / 8, y: y + 30 * step / 8 }],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 48, y + 30, { steps: 8 });
    await page.mouse.up();
  }
  const moved = await readRecipe(page);
  expect(moved.nodes[0].x).toBeCloseTo(before.nodes[0].x + 48, 0);
  expect(moved.nodes[0].y).toBeCloseTo(before.nodes[0].y + 30, 0);
  expect(moved.edges).toEqual(before.edges);
  await page.locator('#undo-button').click();
  expect(await readRecipe(page)).toEqual(before);
  await pressButton(page).click();
  await expect(light(page)).toHaveAttribute('data-lit', 'true');
});

test('removing a wire prevents output and undo restores the connection', async ({ page }) => {
  await page.goto('/');
  await connectStarter(page);
  await page.locator('.connections summary').click();
  await page.getByRole('button', { name: 'ボタン 1からあかり 1の線を外す', exact: true }).click();
  await expect(page.locator('#edge-count')).toHaveText('0');
  await pressButton(page).click();
  await expect(light(page)).not.toHaveAttribute('data-lit', 'true');
  await page.locator('#undo-button').click();
  await pressButton(page).click();
  await expect(light(page)).toHaveAttribute('data-lit', 'true');
});

test('night recipe blocks 70, then a real brightness change to 29 lights the lamp', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-preset="night"]').click();
  await page.getByRole('button', { name: '明るさ 1 この値を送る', exact: true }).click();
  await expect(page.locator('#preview-status')).toContainText('条件を満たさず');
  await expect(light(page)).not.toHaveAttribute('data-lit', 'true');
  const range = page.getByRole('slider', { name: '明るさ 1 明るさ', exact: true });
  await range.focus();
  await page.keyboard.press('Home');
  for (let count = 0; count < 29; count++) await page.keyboard.press('ArrowRight');
  await expect(range).toHaveValue('29');
  await expect(light(page)).toHaveAttribute('data-lit', 'true');
  await expect(page.locator('#event-list')).toContainText('条件：通りました');
});

test('changing brightness sends sensor events without resetting a downstream counter', async ({ page }) => {
  await page.goto('/');
  await importJSON(page, {
    version: 1,
    title: 'Count changing brightness',
    nodes: [
      { id: 'sensor', type: 'brightness', x: 42, y: 28, config: { value: 70 } },
      { id: 'count', type: 'counter', x: 42, y: 208, config: { every: 2 } },
      { id: 'lamp', type: 'light', x: 42, y: 388, config: { color: '#f6b94b' } },
    ],
    edges: [
      { id: 'first', from: 'sensor', to: 'count' },
      { id: 'second', from: 'count', to: 'lamp' },
    ],
  });
  await expect(page.locator('#file-dialog')).not.toBeVisible();
  const range = page.getByRole('slider', { name: '明るさ 1 明るさ', exact: true });
  await range.focus();
  await page.keyboard.press('ArrowRight');
  await expect(range).toHaveValue('71');
  await expect(page.locator('.output-count')).toHaveText('1');
  await expect(light(page)).not.toHaveAttribute('data-lit', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(range).toHaveValue('72');
  await expect(page.locator('.output-count')).toHaveText('0');
  await expect(light(page)).toHaveAttribute('data-lit', 'true');
  expect((await readRecipe(page)).nodes.find(node => node.id === 'sensor').config.value).toBe(72);
});

test('delayed sound arrives after its wait, and reset cancels pending output', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-15T00:00:00Z') });
  await page.goto('/?example=door');
  await page.clock.pauseAt(new Date('2026-09-15T01:00:00Z'));
  const trigger = page.getByRole('button', { name: '人感 1 人が来た', exact: true });
  await trigger.click();
  await expect(page.locator('#event-list')).toContainText('500 ms 待っています');
  await expect(page.locator('#world-state')).toHaveText('ひらめき待ち');
  await page.clock.runFor(500);
  await expect(page.locator('#world-state')).toHaveText('音に、届いた');
  await expect(page.locator('#preview-status')).toContainText('音 OFF');

  await trigger.click();
  await page.locator('#clear-button').click();
  await page.clock.runFor(1000);
  await expect(page.locator('#world-state')).toHaveText('ひらめき待ち');
  await expect(page.locator('#event-count')).toHaveText('0');
  await expect(page.locator('#sound-rings')).not.toHaveClass(/ringing/);
});

test('switching recipes cancels pending delayed events', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-15T00:00:00Z') });
  await page.goto('/?example=door');
  await page.clock.pauseAt(new Date('2026-09-15T01:00:00Z'));
  await page.getByRole('button', { name: '人感 1 人が来た', exact: true }).click();
  await expect(page.locator('#event-list')).toContainText('500 ms 待っています');
  await page.locator('[data-preset="color"]').click();
  await page.clock.runFor(1000);
  await expect(page.locator('#world-state')).toHaveText('ひらめき待ち');
  await expect(page.locator('#event-count')).toHaveText('0');
  await expect(page.locator('#paint-dots > *')).toHaveCount(0);
});

test('two motion events create one paint dot; a third does not create another', async ({ page }) => {
  await page.goto('/?example=color');
  const shake = page.getByRole('button', { name: '動き 1 振る', exact: true });
  await shake.click();
  await expect(page.locator('.output-count')).toHaveText('1');
  await expect(page.locator('#paint-dots > *')).toHaveCount(0);
  await shake.click();
  await expect(page.locator('#paint-dots > *')).toHaveCount(1);
  await expect(page.locator('.output-count')).toHaveText('0');
  await shake.click();
  await expect(page.locator('.output-count')).toHaveText('1');
  await expect(page.locator('#paint-dots > *')).toHaveCount(1);
  await page.locator('#clear-button').click();
  await expect(page.locator('#paint-dots > *')).toHaveCount(0);
  await expect(page.locator('.output-count')).toHaveText('0');
});

test('changing paint color preserves the picture and the next pair adds its new color', async ({ page }) => {
  await page.goto('/?example=color');
  const shake = page.getByRole('button', { name: '動き 1 振る', exact: true });
  await shake.click();
  await shake.click();
  await expect(page.locator('#paint-dots > *')).toHaveCount(1);
  const originalColor = await page.locator('#paint-dots > *').first().evaluate(dot => dot.style.backgroundColor);
  // Native OS color pickers are outside Playwright's page surface. Dispatch the
  // standard input/change events that the picker sends after choosing a color.
  await page.getByLabel('色 1 色', { exact: true }).evaluate(input => {
    input.value = '#4466cc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#paint-dots > *')).toHaveCount(1);
  await shake.click();
  await expect(page.locator('#paint-dots > *')).toHaveCount(1);
  await shake.click();
  await expect(page.locator('#paint-dots > *')).toHaveCount(2);
  await expect(page.locator('#paint-dots > *').first()).toHaveCSS('background-color', originalColor);
  await expect(page.locator('#paint-dots > *').last()).toHaveCSS('background-color', 'rgb(68, 102, 204)');
});

test('downloaded JSON reopens with identical blocks, values, and links', async ({ page }) => {
  await page.goto('/?example=night');
  const original = await readRecipe(page);
  await page.locator('#file-button').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-button').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('patchlight-recipe.json');
  const content = await fs.readFile(await download.path(), 'utf8');
  expect(JSON.parse(content)).toEqual(original);

  await page.locator('#restart-button').click();
  await expect(page.locator('#edge-count')).toHaveText('0');
  await importJSON(page, content);
  await expect(page.locator('#file-dialog')).not.toBeVisible();
  expect(await readRecipe(page)).toEqual(original);
  await expect(page.locator('#edge-count')).toHaveText('2');
});

test('invalid, hostile, and oversized imports preserve the current recipe', async ({ page }) => {
  await page.goto('/');
  await connectStarter(page);
  const original = await readRecipe(page);
  const invalid = JSON.stringify(original).replace('"version":1', '"version":1,"__proto__":{"polluted":true}');
  await importJSON(page, invalid);
  await expect(page.locator('#file-error')).toContainText('未対応の項目');
  expect(await readRecipe(page)).toEqual(original);
  expect(await page.evaluate(() => ({}).polluted)).toBeUndefined();
  await page.locator('#file-dialog .close-dialog').click();

  await importJSON(page, '{broken json');
  await expect(page.locator('#file-error')).not.toBeEmpty();
  expect(await readRecipe(page)).toEqual(original);
  await page.locator('#file-dialog .close-dialog').click();

  await importJSON(page, ' '.repeat(102401));
  await expect(page.locator('#file-error')).toContainText('100KB');
  expect(await readRecipe(page)).toEqual(original);
});

test('markup in a valid imported title is displayed as text', async ({ page }) => {
  await page.goto('/');
  const recipe = await readRecipe(page);
  recipe.title = '<img src=x onerror="window.importExecuted=true">';
  await importJSON(page, recipe);
  await expect(page.locator('#file-dialog')).not.toBeVisible();
  await expect(page.locator('#recipe-title')).toHaveText(recipe.title);
  await expect(page.locator('#recipe-title img')).toHaveCount(0);
  expect(await page.evaluate(() => window.importExecuted)).toBeUndefined();
});

test('autosave survives reload and outputs start clear', async ({ page }) => {
  await page.goto('/');
  await connectStarter(page);
  await pressButton(page).click();
  await expect(light(page)).toHaveAttribute('data-lit', 'true');
  const original = await readRecipe(page);
  await page.reload();
  await expect(page.locator('#edge-count')).toHaveText('1');
  expect(await readRecipe(page)).toEqual(original);
  await expect(light(page)).not.toHaveAttribute('data-lit', 'true');
  await pressButton(page).click();
  await expect(light(page)).toHaveAttribute('data-lit', 'true');
});

test('share URL opens the same recipe in a fresh browser context', async ({ page, browser }) => {
  await page.goto('/?example=color');
  const original = await readRecipe(page);
  await page.locator('#share-button').click();
  const url = await page.locator('#share-url').inputValue();
  expect(new URL(url).search).toBe('');
  expect(new URL(url).hash).toMatch(/^#recipe=[A-Za-z0-9_-]+$/);
  const recipient = await browser.newContext();
  try {
    const target = await recipient.newPage();
    const errors = [];
    target.on('pageerror', error => errors.push(error.message));
    await target.goto(url);
    await expect(target.locator('#edge-count')).toHaveText('2');
    expect(await readRecipe(target)).toEqual(original);
    const shake = target.getByRole('button', { name: '動き 1 振る', exact: true });
    await shake.click();
    await shake.click();
    await expect(target.locator('#paint-dots > *')).toHaveCount(1);
    expect(errors).toEqual([]);
  } finally {
    await recipient.close();
  }
});

test('the keyboard skip link is a normal page anchor and preserves the recipe', async ({ page }) => {
  await page.goto('/?example=color');
  const original = await readRecipe(page);
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workbench')).toBeFocused();
  await expect(page).toHaveURL(/#workbench$/);
  await expect(page.locator('#toast')).not.toBeVisible();
  expect(await readRecipe(page)).toEqual(original);
  await page.reload();
  await expect(page.locator('#recipe-title')).toHaveText(original.title);
  await expect(page.locator('#toast')).not.toBeVisible();
  expect(await readRecipe(page)).toEqual(original);
});

test('a malformed recipe link reports the problem and recovers the saved recipe', async ({ page }) => {
  await page.goto('/');
  await connectStarter(page);
  const original = await readRecipe(page);
  // Use a different document URL: changing only # would test hashchange rather
  // than the startup path that must recover the saved graph.
  await page.goto('/index.html#recipe=not-valid-base64');
  await expect(page.locator('#toast')).toContainText('共有レシピを開けませんでした');
  await expect(page.locator('#edge-count')).toHaveText('1');
  expect(await readRecipe(page)).toEqual(original);
  await pressButton(page).click();
  await expect(light(page)).toHaveAttribute('data-lit', 'true');
});

test('example and shared recipe seeds are consumed so edits survive reload', async ({ page }) => {
  await page.goto('/?example=color');
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  await page.locator('#share-button').click();
  const sharedURL = await page.locator('#share-url').inputValue();
  await page.locator('#share-dialog .close-dialog').click();

  for (const every of [3, 4]) {
    if (every === 4) {
      await page.goto(sharedURL);
      await expect(page).toHaveURL('http://127.0.0.1:4173/');
      await expect(page.getByRole('spinbutton', { name: '数える 1 回数', exact: true })).toHaveValue('2');
    }
    const count = page.getByRole('spinbutton', { name: '数える 1 回数', exact: true });
    await count.fill(String(every));
    await count.press('Tab');
    const edited = await readRecipe(page);
    expect(edited.nodes.find(node => node.type === 'counter').config.every).toBe(every);
    await page.reload();
    await expect(count).toHaveValue(String(every));
    expect(await readRecipe(page)).toEqual(edited);
  }
});

test('a seed URL remains recoverable when browser storage rejects writes', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () { throw new DOMException('Storage unavailable', 'QuotaExceededError'); };
  });
  await page.goto('/?example=night');
  await expect(page.locator('#recipe-title')).toHaveText('暗くなったら、あかりを。');
  await expect(page.locator('#save-status')).toHaveText('端末保存できません');
  await expect(page).toHaveURL(/\?example=night$/);
  await page.reload();
  await expect(page.locator('#edge-count')).toHaveText('2');
  await expect(page.locator('#save-status')).toHaveText('端末保存できません');
});

test('an empty numeric setting is rejected and restores the previous value', async ({ page }) => {
  await page.goto('/?example=night');
  const original = await readRecipe(page);
  const threshold = page.getByRole('spinbutton', { name: '条件 1 しきい値', exact: true });
  await threshold.fill('');
  await threshold.press('Tab');
  await expect(threshold).toHaveValue('30');
  await expect(page.locator('#toast')).toContainText('しきい値');
  expect(await readRecipe(page)).toEqual(original);
});

test('arrange fits all 32 supported blocks inside coordinate bounds without overlap', async ({ page }) => {
  await page.goto('/');
  const recipe = {
    version: 1, title: '32 blocks', edges: [],
    nodes: Array.from({ length: 32 }, (_, index) => ({
      id: `block-${index}`, type: 'button', x: 24, y: 12, config: {},
    })),
  };
  await importJSON(page, recipe);
  await expect(page.locator('#file-dialog')).not.toBeVisible();
  await page.locator('#arrange-button').click();
  const arranged = await readRecipe(page);
  expect(arranged.nodes).toHaveLength(32);
  for (const node of arranged.nodes) {
    expect(node.x).toBeGreaterThanOrEqual(0);
    expect(node.x).toBeLessThanOrEqual(3000);
    expect(node.y).toBeGreaterThanOrEqual(0);
    expect(node.y).toBeLessThanOrEqual(3000);
  }
  const rectangles = await page.locator('.node').evaluateAll(nodes => nodes.map(node => ({
    x: parseFloat(node.style.left), y: parseFloat(node.style.top), width: node.offsetWidth, height: node.offsetHeight,
  })));
  for (let index = 0; index < rectangles.length; index++) {
    for (let other = index + 1; other < rectangles.length; other++) {
      const a = rectangles[index], b = rectangles[other];
      const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      expect(overlaps, `blocks ${index} and ${other} must not overlap`).toBe(false);
    }
  }
});

test('opening index.html directly works without a build or a web server', async ({ page }) => {
  const fileURL = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
  await page.goto(fileURL + '?example=starter');
  await connectStarter(page);
  await pressButton(page).click();
  await expect(light(page)).toHaveAttribute('data-lit', 'true');
  await page.locator('#share-button').click();
  await expect(page.locator('#file-dialog')).toBeVisible();
  await expect(page.locator('#file-error')).toContainText('JSON を保存して共有');
});
