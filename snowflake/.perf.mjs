// Times sim steps and preview frames separately in a visible Chrome window at retina size.
import express from 'express';
import {chromium} from 'playwright';
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
await page.goto(`http://localhost:${port}/snowflake/`);
await page.waitForFunction(() => window.snow);
for (const [name, path] of [
  ['fern', [[-15, 16]]],
  ['plate', [[-16, 2.8]]],
]) {
  const r = await page.evaluate((path) => window.snow.perf(path), path);
  console.log(name, JSON.stringify(r));
}
await browser.close();
server.close();
