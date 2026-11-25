// Loads the live page in Chrome (like a user), samples frame rate and stats every 3 s, screenshots along the way.
import express from 'express';
import {chromium} from 'playwright';
const [out, seconds = 60, preset = ''] = process.argv.slice(2);
const app = express();
app.use(express.static('/Users/andrew/junk'));
const server = app.listen(0);
const port = server.address().port;
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--enable-unsafe-webgpu'],
});
const page = await browser.newPage({
  viewport: {width: 1100, height: 750},
  deviceScaleFactor: 2,
});
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on(
  'console',
  (m) =>
    m.type() === 'error' &&
    !m.text().includes('404') &&
    console.log('console', m.text()),
);
await page.goto(`http://localhost:${port}/snowflake/`);
await page.evaluate(() => {
  window.__frames = 0;
  const f = () => {
    window.__frames++;
    requestAnimationFrame(f);
  };
  f();
});
if (preset) await page.locator('.lil-gui select').first().selectOption(preset);
let last = 0;
for (let t = 3; t <= seconds; t += 3) {
  await page.waitForTimeout(3000);
  const [frames, stats] = await page.evaluate(() => [
    window.__frames,
    document.getElementById('stats').textContent,
  ]);
  console.log(`${t}s fps ${((frames - last) / 3).toFixed(1)}  ${stats}`);
  last = frames;
  if (t % 15 === 0) await page.screenshot({path: `${out}/live-${t}.png`});
}
await browser.close();
server.close();
