// Records a short silent loop of each homepage project running, for the homepage to play on hover.
// Usage: npm run previews [-- project ...]   (no projects records every one), which then reruns
// generateHome.js so home/data.json knows which projects have previews.
// Serves the repo itself, drives Chrome with Playwright, grabs frames with the DevTools
// screencast, and encodes them with ffmpeg (which has to be installed). Projects that barely move
// get no preview, since the screenshot already shows them.
import fs from 'fs';
import os from 'os';
import path from 'path';
import {execFileSync} from 'child_process';
import express from 'express';
import sharp from 'sharp';
import {chromium} from 'playwright';

const WIDTH = 800; // 16:10, the same crop as the homepage cards
const HEIGHT = 500;
const SECONDS = 4;
const MIN_MOTION = 1; // percent of pixels changing, below which a project counts as still
const MIN_FRAMES = 30; // fewer changed frames than this is a jump or two, not motion

// Projects that need a little help to look like themselves. warmup is how long to let them run
// before recording (ms), and act runs on the page after loading.
const setup = {
  lambdagator: {warmup: 300, act: (page) => page.click('#watch')},
  bz: {warmup: 8000},
  island: {warmup: 4000}, // let the rivers form and the camera start drifting // let the broken fronts curl up into spirals
  // unstretch and stretch again every 2 seconds, so the 4-second clip loops cleanly
  cartogram: {
    warmup: 0,
    act: async (page) => {
      await page.getByRole('button', {name: 'Animate stretch'}).waitFor();
      await page.waitForTimeout(3000);
      await page.evaluate(() => {
        const button = [...document.querySelectorAll('.lil-gui button')].find(
          (b) => b.textContent.includes('Animate stretch'),
        );
        button.click();
        setInterval(() => button.click(), 2000);
      });
    },
  },
};

const projects =
  process.argv.length > 2
    ? process.argv.slice(2)
    : JSON.parse(fs.readFileSync('home/data.json')).map((p) => p.filePath);

const server = express().use(express.static('.')).listen(0);
const port = server.address().port;
const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--enable-unsafe-webgpu',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
fs.mkdirSync('home/previews', {recursive: true});

// the share of pixels that change noticeably over a fifth of a second, averaged over the clip,
// on small grayscale copies of the frames
const motion = async (frames) => {
  const small = await Promise.all(
    frames.map((f) =>
      sharp(f.data)
        .resize(160, 100, {fit: 'fill'})
        .grayscale()
        .raw()
        .toBuffer(),
    ),
  );
  let changed = 0;
  let pairs = 0;
  for (let i = 0, j = 0; i < small.length; i++) {
    while (j < small.length && frames[j].time < frames[i].time + 0.2) j++;
    if (j === small.length) break;
    for (let k = 0; k < small[i].length; k++) {
      if (Math.abs(small[i][k] - small[j][k]) > 12) changed++;
    }
    pairs++;
  }
  return (100 * changed) / Math.max(1, pairs) / small[0].length;
};

const record = async (project) => {
  const {warmup = 2000, act} = setup[project] || {};
  const page = await browser.newPage({
    viewport: {width: WIDTH, height: HEIGHT},
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/${project}/`, {waitUntil: 'load'});
  if (act) await act(page);
  // settings panels aren't part of the picture
  await page.addStyleTag({
    content: '.lil-gui, .dg.ac { display: none !important; }',
  });
  await page.waitForTimeout(warmup);

  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({data, metadata, sessionId}) => {
    frames.push({data: Buffer.from(data, 'base64'), time: metadata.timestamp});
    cdp.send('Page.screencastFrameAck', {sessionId}).catch(() => {});
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 90,
    maxWidth: WIDTH,
    maxHeight: HEIGHT,
  });
  await page.waitForTimeout(SECONDS * 1000);
  await cdp.send('Page.stopScreencast');
  await page.close();

  const out = `home/previews/${project}.mp4`;
  const amount = frames.length > 1 ? await motion(frames) : 0;
  const summary = `${project}: ${frames.length} frames, motion ${amount.toFixed(1)}%${errors.length ? `, errors: ${errors[0]}` : ''}`;
  if (amount < MIN_MOTION || frames.length < MIN_FRAMES) {
    fs.rmSync(out, {force: true});
    console.log(`${summary}, too still, no preview`);
    return;
  }

  // frames arrive only when the page changes, so each one is held until the next
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-'));
  const end = frames[0].time + SECONDS;
  const list = frames
    .map((f, i) => {
      fs.writeFileSync(`${dir}/${i}.jpg`, f.data);
      const duration = (frames[i + 1]?.time ?? end) - f.time;
      return `file '${dir}/${i}.jpg'\nduration ${Math.max(duration, 0.001).toFixed(4)}`;
    })
    .join('\n');
  fs.writeFileSync(
    `${dir}/list.txt`,
    `${list}\nfile '${dir}/${frames.length - 1}.jpg'\n`,
  );
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    `${dir}/list.txt`,
    '-vf',
    'fps=30,scale=640:400:flags=lanczos,format=yuv420p',
    '-t',
    String(SECONDS),
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '30',
    '-maxrate',
    '700k',
    '-bufsize',
    '1400k',
    '-profile:v',
    'high',
    '-movflags',
    '+faststart',
    '-an',
    out,
  ]);
  fs.rmSync(dir, {recursive: true});
  console.log(`${summary}, ${Math.round(fs.statSync(out).size / 1024)}KB`);
};

for (const project of projects) {
  try {
    await record(project);
  } catch (e) {
    console.log(`${project}: failed, ${e.message}`);
  }
}
await browser.close();
server.close();

// mark which projects have previews in home/data.json
await import('./generateHome.js');
