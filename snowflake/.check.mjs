// node snowflake/.check.mjs outdir [hash] [width height]: loads the page in Chrome like a visitor, then tries random weather, with screenshots
import express from 'express';
import {chromium} from 'playwright';
const [out, hash = '', width = 1100, height = 750] = process.argv.slice(2);
const app = express();
app.use(express.static('/Users/andrew/junk'));
const server = app.listen(0);
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--enable-unsafe-webgpu'],
});
const page = await browser.newPage({
  viewport: {width: +width, height: +height},
  deviceScaleFactor: 2,
  hasTouch: +width < 600,
});
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on(
  'console',
  (m) =>
    m.type() !== 'log' &&
    !m.text().includes('404') &&
    console.log('console', m.type(), m.text()),
);
await page.goto(`http://localhost:${server.address().port}/snowflake/${hash}`);
const stats = () => page.locator('#stats').textContent();
const shot = (name) => page.screenshot({path: `${out}/${name}.png`});
await page.waitForTimeout(1500);
console.log('1.5s', await stats(), await page.evaluate(() => location.hash));
await shot('a-start');
await page.waitForFunction(
  () => document.getElementById('stats').textContent.includes('full grown'),
  null,
  {timeout: 60000},
);
await page.waitForTimeout(1500);
console.log('grown', await stats());
await shot('b-grown');
await page.evaluate(() => window.snow.settings.random());
await page.waitForTimeout(500);
console.log('random', await page.evaluate(() => location.hash));
await page.waitForTimeout(8000);
console.log('random 8s', await stats());
await shot('c-random');
await browser.close();
server.close();
