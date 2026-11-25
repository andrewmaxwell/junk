// node snowflake/.column.mjs cases.json: grows each case (as in .tune.mjs) and measures it as a column:
// flat: face-center radius over a flat face's (1 is flat, lower is fluted), per layer, averaged over the
// middle 80% of the height; sealed: layers with no hollow between the middle and a hollow layer (solid
// floors across the hollow); hollow: share of the height that's hollow from the ends; aspect: height / width
import fs from 'fs';
import express from 'express';
import {chromium} from 'playwright';
const cases = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const app = express();
app.use(express.static(process.cwd()));
const server = app.listen(0);
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
});
const page = await browser.newPage({viewport: {width: 300, height: 300}});
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:${server.address().port}/snowflake/`);
await page.waitForFunction(() => window.snow, null, {timeout: 20000});
for (const c of cases) {
  const {g, a} = await page.evaluate(async (c) => {
    const g = await window.snow.grow({...c, settle: 2});
    return {g, a: Array.from(await window.snow.cells())};
  }, c);
  const N = 160; // the Medium grid
  const layer = (N * (N + 1)) / 2;
  const nz = a.length / layer;
  const at = (q, r, z) => a[z * layer + (q * (q + 1)) / 2 + r];
  const rows = [];
  for (let z = 0; z < nz; z++) {
    let R = 0,
      F = 0,
      cells = 0,
      holes = 0;
    for (let q = 0; q < N; q++) {
      if (at(q, 0, z)) R = q;
      if (at(q, q, z)) F = q * Math.sqrt(3);
    }
    for (let r = 0; r < N; r++) {
      let out = -1;
      for (let q = N - 1; q >= r; q--)
        if (at(q, r, z)) {
          out = q;
          break;
        }
      for (let q = r; q <= out; q++) {
        if (at(q, r, z)) cells++;
        else holes++;
      }
    }
    if (cells) rows.push({R, F, holes, cells});
  }
  const h = rows.length;
  const mid = rows.slice(0, Math.floor(h * 0.8));
  const flat =
    mid.reduce((t, {R, F}) => t + Math.min(1, F / (R * 0.866 || 1)), 0) /
    mid.length;
  const first = rows.findIndex((r) => r.holes > 1);
  const hollow = first < 0 ? 0 : (h - first) / h;
  const sealed =
    first < 0 ? 0 : rows.slice(first).filter((r) => r.holes <= 1).length;
  const width = Math.max(...rows.map((r) => r.R));
  console.log(
    c.name.padEnd(28),
    `flat ${flat.toFixed(2)}  hollow ${hollow.toFixed(2)}  sealed ${sealed}  aspect ${(h / width).toFixed(2)}  steps ${g.steps}`,
  );
  if (c.rows)
    console.log(
      rows.map((r) => `${r.R}/${Math.round(r.F)}/${r.holes}`).join(' '),
    );
}
await browser.close();
server.close();
