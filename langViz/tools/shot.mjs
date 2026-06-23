// Self-contained screenshot harness for langViz. Serves the langViz directory
// over an ephemeral HTTP port, loads it in headless Chromium (Playwright),
// optionally zooms toward a point, and writes a PNG. No external server needed.
//
//   node langViz/tools/shot.mjs [out.png] [waitMs] [zoom] [WxH]
//     out.png  output path           (default /tmp/langviz.png)
//     waitMs   settle time before shot (default 6000)
//     zoom     "steps,cx,cy" wheel-zoom toward screen point, OR
//              "@x0,y0,x1,y1" to frame an exact world-coordinate rect (optional)
//     WxH      viewport size          (default 1600x900)
//
// Prints any browser console errors so regressions surface without eyeballing.

import http from 'http';
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { extname, join, normalize } from 'path';

const ROOT = join(process.cwd(), 'langViz');
const OUT = process.argv[2] || '/tmp/langviz.png';
const WAIT = +(process.argv[3] || 6000);
const ZOOM = process.argv[4]; // "steps,cx,cy"
const [VW, VH] = (process.argv[5] || '1600x900').split('x').map(Number);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.bin': 'application/octet-stream', '.css': 'text/css',
};

// Locate the Playwright module + a Chromium executable wherever they landed
// (npx cache or local node_modules), tolerating version-suffixed directories.
async function findFirst(base, pred) {
  if (!existsSync(base)) return null;
  for (const name of await readdir(base)) {
    const hit = pred(name);
    if (hit && existsSync(hit)) return hit;
  }
  return null;
}
async function locate() {
  const npx = join(homedir(), '.npm/_npx');
  const pw =
    (await findFirst(npx, (d) => join(npx, d, 'node_modules/playwright/index.mjs'))) ||
    join(process.cwd(), 'node_modules/playwright/index.mjs');
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const exe =
    (await findFirst(cache, (d) => d.startsWith('chromium_headless_shell') &&
      join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'))) ||
    (await findFirst(cache, (d) => d.startsWith('chromium-') &&
      join(cache, d, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium')));
  return { pw, exe };
}

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const file = join(ROOT, normalize(p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('404'); }
});

await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const { pw, exe } = await locate();
const { chromium } = await import(pw);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

// parity mode: `node tools/shot.mjs parity "Thus saith the LORD"` prints the
// browser's top-10 next-token logits to compare against parity.py.
if (OUT === 'parity') {
  await page.waitForTimeout(1500);
  const text = process.argv[3] || 'Thus saith the LORD';
  const r = await page.evaluate((t) => window.__parityCheck(t), text);
  console.log('[parity] ids:', JSON.stringify(r.ids));
  for (const e of r.top) console.log(`  ${String(e.index).padStart(4)}  ${JSON.stringify(e.token).padEnd(10)}  ${e.logit}`);
  await browser.close();
  server.close();
  process.exit(0);
}

// perf mode: `node tools/shot.mjs perfcheck` measures effective render FPS by
// counting requestAnimationFrame fires over 1.5s (drops if a frame draws slowly).
if (OUT === 'perfcheck') {
  await page.waitForTimeout(2500);
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let n = 0; const t0 = performance.now();
    (function tick() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else resolve(Math.round(n / ((performance.now() - t0) / 1000))); })();
  }));
  console.log('effective FPS:', fps);
  await browser.close(); server.close(); process.exit(0);
}

await page.waitForTimeout(WAIT);

if (ZOOM && ZOOM.startsWith('@')) {
  const [x0, y0, x1, y1] = ZOOM.slice(1).split(',').map(Number);
  await page.evaluate(({ r, vw, vh }) => {
    const v = window.__viz.view;
    const w = r.x1 - r.x0, h = r.y1 - r.y0;
    v.scale = Math.min(vw / w, vh / h);
    v.tx = -r.x0 * v.scale + (vw - w * v.scale) / 2;
    v.ty = -r.y0 * v.scale + (vh - h * v.scale) / 2;
  }, { r: { x0, y0, x1, y1 }, vw: VW, vh: VH });
  await page.waitForTimeout(300);
} else if (ZOOM) {
  const [steps, cx, cy] = ZOOM.split(',').map(Number);
  for (let i = 0; i < steps; i++) {
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -260);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(1500);
}

await page.screenshot({ path: OUT });
await browser.close();
server.close();
console.log('errors:', JSON.stringify(errors));
console.log('wrote', OUT);
