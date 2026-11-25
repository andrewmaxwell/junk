// node snowflake/.search.mjs runs out.json [seed] [around.json]: with around.json (a list of models), perturbs those instead; grows random model parameters and records how open (fill) and branched (edge) each crystal is seen from above
import fs from 'fs';
import express from 'express';
import {chromium} from 'playwright';
const [runs = 40, out = 'search.json', seed0 = 1, aroundFile] = process.argv.slice(2);
const around = aroundFile && JSON.parse(fs.readFileSync(aroundFile, 'utf8'));
let seed = +seed0;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const lin = (a, b) => a + rand() * (b - a);
const log = (a, b) => a * (b / a) ** rand();
const app = express();
app.use(express.static(process.cwd()));
const server = app.listen(0);
const browser = await chromium.launch({channel: 'chrome', args: ['--enable-unsafe-webgpu', '--enable-gpu']});
const page = await browser.newPage({viewport: {width: 300, height: 300}});
await page.goto(`http://localhost:${server.address().port}/snowflake/`);
await page.waitForFunction(() => window.snow);
const results = [];
for (let k = 0; k < +runs; k++) {
  if (around) {
    const from = around[Math.floor(rand() * around.length)];
    const model = Object.fromEntries(Object.entries(from).map(([k, v]) => [k, v * log(0.75, 1.33)]));
    model.b01 = lin(3.5, 6);
    model.b21 = model.b11;
    model.b31 = model.b30;
    model.diff = Math.min(0.16, model.diff);
    const r = await page.evaluate(async (model) => {
      const g = await window.snow.grow({model, steps: 15000, settle: 0});
      return {...g, ...(await window.snow.shape())};
    }, model);
    results.push({model, ...r});
    console.log(k, 'fill', r.fill.toFixed(2), 'edge', r.edge.toFixed(1), 'h', r.height, 'steps', r.steps);
    continue;
  }
  const b11 = lin(0.8, 1.5);
  const b30 = lin(0.8, 2.5);
  const model = {
    rho: lin(0.15, 0.6), kappa: log(0.0005, 0.05), mu: log(0.0002, 0.03), gamma: log(1e-5, 1e-3),
    b01: lin(2, 5), b10: lin(0.9, 2.5), b20: lin(0.9, 2.5), b11, b21: b11, b30, b31: b30,
    theta: lin(0, 0.05), xi: lin(0.01, 0.2), sigma: rand() < 0.5 ? 0 : lin(0, 0.03), diff: lin(0.05, 0.16),
  };
  const r = await page.evaluate(async (model) => {
    const g = await window.snow.grow({model, steps: 15000, settle: 0});
    return {...g, ...(await window.snow.shape())};
  }, model);
  results.push({model, ...r});
  console.log(k, 'fill', r.fill.toFixed(2), 'edge', r.edge.toFixed(1), 'h', r.height, 'steps', r.steps, 'p', r.progress.toFixed(2));
}
fs.writeFileSync(out, JSON.stringify(results, null, 1));
await browser.close();
server.close();
