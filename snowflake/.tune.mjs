// node snowflake/.tune.mjs cases.json outdir
import fs from 'fs';
import express from 'express';
import {chromium} from 'playwright';
import sharp from 'sharp';
const [casesFile, out] = process.argv.slice(2);
const cases = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
const app = express();
app.use(express.static(process.cwd()));
const server = app.listen(0);
const port = server.address().port;
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
});
for (const c of cases) {
  const page = await browser.newPage({
    viewport: {width: c.w ?? 500, height: c.h ?? 500},
  });
  page.on(
    'console',
    (m) => m.type() === 'error' && console.log('console:', m.text()),
  );
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/snowflake/`);
  await page.waitForFunction(() => window.snow, null, {timeout: 20000});
  await page.evaluate((s) => {
    Object.assign(window.snow.settings, s.settings ?? {});
    if (s.size) window.snow.settings.size = s.size;
    Object.assign(window.snow.camera, s.camera ?? {});
  }, c);
  const t = Date.now();
  const r = await page.evaluate((c) => window.snow.grow(c), c);
  const stats = await page.locator('#stats').textContent();
  console.log(
    c.name,
    JSON.stringify(r),
    ((Date.now() - t) / 1000).toFixed(1) + 's',
    stats,
  );
  await page.addStyleTag({
    content: '#chart,#stats,.lil-gui{display:none!important}',
  });
  if (c.chart)
    await page.addStyleTag({content: '#chart{display:block!important}'});
  await page.screenshot({path: `${out}/${c.name}.png`});
  await page.close();
}
await browser.close();
const cols = Math.ceil(Math.sqrt(cases.length));
const W = 500,
  H = 500;
const tiles = await Promise.all(
  cases.map(async (c, k) => ({
    input: await sharp(`${out}/${c.name}.png`)
      .resize(W, H)
      .composite([
        {
          input: Buffer.from(
            `<svg width="${W}" height="30"><text x="6" y="20" font-size="18" fill="#ff0" font-family="sans-serif">${c.name}</text></svg>`,
          ),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer(),
    left: (k % cols) * W,
    top: Math.floor(k / cols) * H,
  })),
);
await sharp({
  create: {
    width: cols * W,
    height: Math.ceil(cases.length / cols) * H,
    channels: 3,
    background: '#000',
  },
})
  .composite(tiles)
  .png()
  .toFile(`${out}/montage.png`);
server.close();
