// Drives the real page in headless Chromium. Serves this folder on a spare
// port, so no dev server is needed. Playwright isn't a repo dependency; this
// uses the copy npx caches (run `npx playwright --version` once to fetch it).
//
//   node careCalculator/test-browser.js
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {homedir} from 'node:os';
import {extname, join} from 'node:path';
import {WEIGHTS} from './model.js';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const npx = join(homedir(), '.npm/_npx');
    for (const d of fs.readdirSync(npx)) {
      const p = join(npx, d, 'node_modules/playwright/index.mjs');
      if (fs.existsSync(p)) return import(p);
    }
    throw new Error('Playwright not found; run `npx playwright --version`');
  }
}

const dir = new URL('.', import.meta.url).pathname;
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};
const server = http
  .createServer((req, res) => {
    const file = join(dir, req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, {'content-type': types[extname(file)] || ''});
    fs.createReadStream(file).pipe(res);
  })
  .listen(0);
const url = `http://localhost:${server.address().port}/`;

const {chromium} = await loadPlaywright();
// Installed Chrome, so the cached Playwright's browser version doesn't matter.
const browser = await chromium.launch({channel: 'chrome'});
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let checks = 0;
const check = (v, msg) => {
  assert.ok(v, msg);
  checks++;
};
const text = (sel) => page.locator(sel).first().textContent();
const active = () => page.evaluate(() => document.activeElement.dataset.key);
const saved = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('care-v5')).state);

try {
  await page.goto(url);
  check(await page.locator('#undo').isDisabled(), 'nothing to undo at start');
  check((await text('.price')).includes('$25.00'), 'reference rate');
  check((await text('.total strong')) === '$50.00', 'reference total');
  check(
    (await page.locator('.seg').count()) === 5 &&
      (await text('.status')).includes('Covered by base pay'),
    'workload meter',
  );
  check(
    (await text('[data-scenario=solo]')).includes('Team -$1.00 · each +$11.50'),
    'solo shows per-person change',
  );
  check(
    (await text('[data-scenario=baby]')).includes('asleep half the time'),
    'newborn assumption shown',
  );

  // Focus moves normally after an edit (re-rendering inputs used to drop it).
  await page.fill('[data-key=hours]', '3');
  await page.keyboard.press('Tab');
  check((await active()) === 'caregivers', 'tab after edit keeps focus');
  check((await text('.total')).includes('3-hour booking'), 'hours applied');
  await page.fill('[data-key=hours]', '2');
  await page.click('[data-key=base]');
  check((await active()) === 'base', 'click after edit keeps focus');

  const comfortShown = () =>
    page.locator('[data-key=comfort]').first().isVisible();
  check(!(await comfortShown()), 'settling style hidden without settling');
  await page.selectOption('[data-key=settle] >> nth=0', '10');
  check(await comfortShown(), 'settling style shown with settling');
  await page.selectOption('[data-key=settle] >> nth=0', '0');
  await page.fill('[data-key=years] >> nth=0', '2');
  await page.fill('[data-key=mo] >> nth=0', '18');
  await page.keyboard.press('Tab');
  check((await saved()).children[0].months === 42, 'age from years + months');
  check(
    (await page.inputValue('[data-key=years] >> nth=0')) === '3' &&
      (await page.inputValue('[data-key=mo] >> nth=0')) === '6',
    'months roll over into years',
  );

  await page.selectOption('[data-key=parents]', 'false');
  check((await saved()).parents === false, 'parents saved');
  check((await text('.price')).includes('$27.00'), 'parents away rate');
  await page.click('#reset');

  // Toileting and food precautions only show for tasks the caregivers take on.
  const shown = (key) => page.locator(`[data-key=${key}]`).first().isVisible();
  check(
    !(await shown('toilet')) && !(await shown('allergy')),
    'task fields hidden',
  );
  await page.check('[data-key=diapers] >> nth=0');
  check(
    (await shown('toilet')) && !(await shown('allergy')),
    'toileting shown',
  );
  check(
    await page.evaluate(
      () => document.querySelector('[data-all=diapers]').indeterminate,
    ),
    'one child with a task shows as mixed',
  );
  check(
    (await saved()).children.map((c) => c.diapers).join() ===
      'true,false,false,false,false',
    'task set for one child',
  );
  check(
    (await active()) === 'diapers',
    'per-child task keeps focus on its checkbox',
  );
  await page.check('[data-all=feeding]');
  check(
    (await saved()).children.every((c) => c.feeding) &&
      (await page.locator('[data-key=allergy]').last().isVisible()),
    'toggle sets every child',
  );
  await page.uncheck('[data-key=feeding] >> nth=2');
  check(
    await page.evaluate(
      () => document.querySelector('[data-all=feeding]').indeterminate,
    ),
    'unticking one child makes the toggle mixed',
  );
  await page.check('[data-all=diapers]');
  await page.click('#add');
  check((await saved()).children[5].diapers, 'new child gets shared tasks');
  check(!(await saved()).children[5].feeding, 'but not partial ones');
  await page.click('#reset');

  await page.fill('.name >> nth=0', '<b>x</b>');
  await page.keyboard.press('Tab');
  check((await text('.breakdown td')) === '<b>x</b>', 'names are escaped');
  await page.fill('.name >> nth=0', '');
  await page.keyboard.press('Tab');
  check((await text('.breakdown td')) === 'Child 1', 'blank name fallback');
  check(
    (await page.locator('.remove').first().getAttribute('aria-label')) ===
      'Remove Child 1',
    'blank name remove label',
  );

  await page.fill('[data-key=caregivers]', '0');
  await page.keyboard.press('Tab');
  check((await saved()).caregivers === 1, 'caregivers clamped');
  await page.fill('[data-key=sleep] >> nth=1', '150');
  await page.keyboard.press('Tab');
  check((await saved()).children[1].sleep === 100, 'sleep clamped');
  await page.click('#reset');

  await page.click('[data-scenario=diapers]');
  check((await text('.price')).includes('$29.00'), 'diapers scenario');
  check(
    (await page.locator('[data-scenario=diapers]').count()) === 0,
    'applied scenario hidden',
  );
  check(
    (await page.locator('[data-scenario=away]').count()) === 1,
    'unapplied scenario shown',
  );
  check(!(await page.content()).includes('-$0.00'), 'no negative zero');
  await page.click('#undo');
  check((await text('.price')).includes('$25.00'), 'undo a comparison');

  check(
    (await text('#announce')) === '$25.00 per hour, $12.50 each',
    'price announced',
  );

  // Editing a field then clicking straight onto a button still clicks it.
  await page.click('#result details summary');
  await page.fill('[data-key=hours]', '3');
  await page.click('[data-scenario=away]');
  check(
    (await saved()).hours === 3 && (await saved()).parents === false,
    'click after an edit is not swallowed',
  );
  // The page address follows the plan.
  await page.fill('[data-key=hours]', '4');
  await page.keyboard.press('Tab');
  const linked = JSON.parse(
    Buffer.from(page.url().split('#')[1], 'base64url').toString(),
  );
  check(linked.hours === 4, 'address has the just-edited value');
  check(
    await page
      .locator('#result details')
      .first()
      .evaluate((d) => d.open),
    'workload table stays open across refreshes',
  );
  await page.click('#reset');

  await page.click('.remove');
  check((await saved()).children.length === 4, 'remove child');
  check(
    (await page.locator('.child').first().getAttribute('style')).includes(
      'series-2',
    ),
    'colors follow the child after a removal',
  );
  await page.click('#add');
  check((await saved()).children.length === 5, 'add child');
  check((await active()) === 'name', 'new child name focused');

  // Weights panel drives the quote and the assumptions text.
  await page.click('details.model summary');
  await page.locator('#weights .lil-gui input').first().fill('10');
  await page.keyboard.press('Enter');
  check((await saved()).weights.premium === 10, 'premium weight saved');
  check(
    (await text('#result')).includes('Using custom weights'),
    'custom weights flagged',
  );
  check((await text('#math')).includes('$10.00 ×'), 'formula follows weight');
  // Open weight folders survive re-renders.
  const folderClosed = () =>
    page.evaluate(() =>
      document
        .querySelector('#weights .lil-gui .lil-gui')
        .classList.contains('lil-closed'),
    );
  await page.locator('#weights .lil-gui .lil-gui .lil-title').first().click();
  await page.click('#add');
  check(!(await folderClosed()), 'weights folder stays open');
  await page.click('.remove >> nth=-1');
  await page.click('text=Restore default weights');
  check((await saved()).weights.premium === WEIGHTS.premium, 'restore weights');
  check(
    (await text('#math')).includes(
      `0 mo: ${WEIGHTS.supervision[0].value}, 12 mo:`,
    ),
    'assumptions text',
  );

  await page.click('#reset');
  for (let i = 0; i < 5; i++) await page.click('.remove');
  check((await text('.price')).includes('$0.00'), 'no children no cost');
  check((await text('.note')).includes('Add a child'), 'empty prompt');

  await page.click('#reset');
  await page.click('[data-scenario=baby]');
  check((await text('#result')).includes('Newborn:'), 'newborn warning');

  await page.reload();
  check((await saved()).children.length === 6, 'state survives reload');

  // The link alone reproduces the plan in a browser that has never seen it.
  const fresh = await browser.newPage();
  await fresh.goto(page.url());
  check(
    (await fresh.locator('.child').count()) === 6 &&
      (await fresh.locator('.price').textContent()) === (await text('.price')),
    'link reproduces the plan',
  );
  await fresh.close();

  // A crafted link can't inject markup: values are rebuilt, not trusted.
  const evil = '<img src=x onerror="document.title=1">';
  const crafted = {
    ...(await saved()),
    play: evil,
    weights: {included: evil, premium: evil, play: {led: evil}},
  };
  crafted.children[0].name = evil;
  const hash = Buffer.from(JSON.stringify(crafted)).toString('base64url');
  const attacked = await browser.newPage();
  await attacked.goto(url + '#' + hash);
  await attacked.click('details.model summary');
  check(
    (await attacked
      .locator('#result img, #math img, #children img')
      .count()) === 0 && (await attacked.title()) !== '1',
    'crafted link injects nothing',
  );
  check(
    (await attacked.locator('.name').first().inputValue()) === evil,
    'names still shown as typed',
  );
  await attacked.close();

  // Start blank, then focus lands somewhere sensible after a removal.
  await page.fill('[data-key=base]', '20');
  await page.keyboard.press('Tab');
  await page.click('#blank');
  check(
    (await saved()).children.length === 0 && (await saved()).base === 20,
    'start blank clears children, keeps settings',
  );
  check(
    await page.evaluate(() => document.activeElement.id === 'add'),
    'add child focused after blank',
  );
  await page.click('#add');
  await page.click('#add');
  await page.click('.remove');
  check((await active()) === 'name', 'focus moves to the next card');
  await page.fill('.name >> nth=0', 'Robin');
  await page.keyboard.press('Tab');
  check(
    (await page.locator('.child').first().getAttribute('aria-label')) ===
      'Robin' &&
      (await page
        .locator('[data-key=years]')
        .first()
        .getAttribute('aria-label')) === 'Robin, age in years',
    'rename updates the card and age labels',
  );

  // On a phone, Details scrolls to the quote without touching the plan URL.
  const phone = await context.newPage();
  await phone.setViewportSize({width: 390, height: 844});
  await phone.goto(page.url());
  const before = phone.url();
  await phone.click('#mini [data-scroll]');
  check(phone.url() === before, 'details keeps the plan in the URL');
  await phone.close();

  check(errors.length === 0, 'page errors: ' + errors.join('; '));
  console.log('PASS ' + checks + ' browser checks');
} finally {
  await browser.close();
  server.close();
}
