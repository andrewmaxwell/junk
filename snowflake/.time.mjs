// node snowflake/.time.mjs [grid]: loads each preset fresh like a visitor (grid: small, medium, large) and times how long it takes to grow full, with frame rate
import express from 'express';
import {chromium} from 'playwright';
const [grid = 'medium'] = process.argv.slice(2);
const app = express();
app.use(express.static(process.cwd()));
const server = app.listen(0);
const url = `http://localhost:${server.address().port}/snowflake/`;
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
await page.goto(url);
await page.waitForFunction(() => window.snow);
const presets = await page.evaluate(() =>
  [...document.querySelector('.lil-gui select').options]
    .map((o) => o.value)
    .filter((v) => !v.startsWith('(')),
);
const hashes = [];
for (const preset of presets) {
  await page.locator('.lil-gui select').first().selectOption(preset);
  hashes.push(await page.evaluate(() => location.hash));
}
for (const [k, preset] of presets.entries()) {
  await page.goto('about:blank');
  await page.goto(`${url}${hashes[k]}&grid=${grid}`);
  await page.waitForFunction(() => window.snow);
  const r = await page.evaluate(
    () =>
      new Promise((done) => {
        const t0 = performance.now();
        let frames = 0;
        const f = () => {
          frames++;
          const s = document.getElementById('stats').textContent;
          const t = performance.now() - t0;
          if (s.includes('full grown') || t > 120000)
            done({
              s: (t / 1000).toFixed(1),
              fps: ((frames * 1000) / t).toFixed(0),
              stats: s,
            });
          else requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }),
  );
  console.log(
    preset.padEnd(20),
    r.s + 's',
    r.fps + 'fps',
    r.stats.split('·').slice(1).join('·'),
  );
}
await browser.close();
server.close();
