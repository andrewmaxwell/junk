// Scores every waking hour at every 3 km HRRR cell and writes what the page
// draws.
//
//   node comfort/map/build/score.js --start 2025-10-15 --end 2026-10-14
//
// Starts `hrrr.py` for the same range and scores its hours in order as they
// land, across one worker per spare core. Progress is checkpointed every day of
// data, so an interrupted run resumes where it stopped: start it again with the
// same dates. `grid.py` must have been run once, and `cams.py` for the range if
// UV and air quality are to count.

import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {availableParallelism} from 'node:os';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import sharp from 'sharp';
import {
  ACTIVITY_KEYS,
  BUILD_DIR,
  DATA_DIR,
  FACTORS,
  GOOD_SCORE,
  GRID_DIR,
  STAT_FIELDS,
  WAKING_END_HOUR,
  WAKING_START_HOUR,
  runDir,
} from './common.js';

const CHECKPOINT_HOURS = 24;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2)
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  if (!args.start || !args.end) {
    console.error('Usage: score.js --start YYYY-MM-DD --end YYYY-MM-DD');
    process.exit(1);
  }
  return args;
}

const args = parseArgs();
const run = runDir(args.start, args.end);
const spool = join(run, 'spool');
await mkdir(spool, {recursive: true});

const grid = JSON.parse(await readFile(join(GRID_DIR, 'grid.json'), 'utf8'));
const cells = new Uint32Array(
  (await readFile(join(GRID_DIR, 'cells.u32'))).buffer,
);
const zoneBuffer = new SharedArrayBuffer(grid.count);
new Uint8Array(zoneBuffer).set(await readFile(join(GRID_DIR, 'zone.u8')));

// Local calendar months the range touches, in order.
const months = [];
for (let m = args.start.slice(0, 7); m <= args.end.slice(0, 7); ) {
  months.push(m);
  const [y, mo] = m.split('-').map(Number);
  m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

// --- Which cells count in which hour ------------------------------------------

const formatters = grid.zones.map(
  (timeZone) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }),
);

// For each zone, the month index this UTC hour is scored under, or -1 when it
// is not a waking hour there or falls outside the requested local dates.
// `hrrr.py` makes the same decision, to know which hours to fetch.
function zoneMonths(when) {
  return Int8Array.from(formatters, (format) => {
    const parts = Object.fromEntries(
      format.formatToParts(when).map((p) => [p.type, p.value]),
    );
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const hour = Number(parts.hour);
    if (hour < WAKING_START_HOUR || hour >= WAKING_END_HOUR) return -1;
    if (date < args.start || date > args.end) return -1;
    return months.indexOf(date.slice(0, 7));
  });
}

const hourName = (when) => when.toISOString().slice(0, 13).replace(/[-T]/g, '');

const hours = [];
const last = Date.parse(`${args.end}T00:00:00Z`) + 32 * 3_600_000;
for (let t = Date.parse(`${args.start}T00:00:00Z`); t < last; t += 3_600_000) {
  const zoneMonth = zoneMonths(new Date(t));
  if (zoneMonth.some((m) => m >= 0))
    hours.push({name: hourName(new Date(t)), zoneMonth});
}

// --- Stats and checkpoint -----------------------------------------------------

const fieldCount = STAT_FIELDS.length;
const statsLength =
  grid.count * ACTIVITY_KEYS.length * months.length * fieldCount;
const statsBuffer = new SharedArrayBuffer(statsLength * 2);
const stats = new Uint16Array(statsBuffer);

// One file, written whole and renamed into place, so the stats and the list of
// hours they include can never disagree: a crash between scoring and saving
// just means those hours are scored again, never twice.
const checkpointPath = join(run, 'checkpoint.bin');
const scored = new Set();

async function loadCheckpoint() {
  if (!existsSync(checkpointPath)) return;
  const file = await readFile(checkpointPath);
  const nameCount = file.readUInt32LE(0);
  const names = file.subarray(4, 4 + nameCount * 10).toString('latin1');
  for (let i = 0; i < nameCount; i++)
    scored.add(names.slice(i * 10, i * 10 + 10));
  const offset = 4 + nameCount * 10;
  stats.set(
    new Uint16Array(file.buffer, file.byteOffset + offset, statsLength),
  );
}

async function saveCheckpoint(pending) {
  for (const name of pending) scored.add(name);
  const names = Buffer.from([...scored].join(''), 'latin1');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(scored.size);
  await writeFile(checkpointPath + '.part', [
    header,
    names,
    Buffer.from(statsBuffer),
  ]);
  await rename(checkpointPath + '.part', checkpointPath);
  // Only now may the hours' files go, and `hrrr.py` stop considering them.
  await appendFile(
    join(run, 'scored.txt'),
    pending.map((n) => n + '\n').join(''),
  );
  await Promise.all(
    pending.map((name) => unlink(join(spool, `${name}.done`)).catch(() => {})),
  );
}

await loadCheckpoint();
// Anything scored after the last checkpoint is scored again.
for (const file of await readdir(spool)) {
  if (file.endsWith('.done') && !scored.has(file.slice(0, 10)))
    await rename(join(spool, file), join(spool, file.replace('.done', '.f32')));
}

// --- Workers -------------------------------------------------------------------

const fieldsPath = join(run, 'fields.json');
const fetcher = spawn(
  join(BUILD_DIR, '.venv', 'bin', 'python'),
  ['hrrr.py', '--start', args.start, '--end', args.end],
  {cwd: BUILD_DIR, stdio: ['ignore', 'pipe', 'inherit']},
);
let fetcherExit = null;
fetcher.on('exit', (code) => (fetcherExit = code));
fetcher.stdout.on('data', (chunk) => {
  for (const line of chunk.toString().trim().split('\n'))
    console.log(`[hrrr] ${line}`);
});
while (!existsSync(fieldsPath)) await sleep(500);
const fields = JSON.parse(await readFile(fieldsPath, 'utf8'));

const workerCount = Math.max(1, availableParallelism() - 1);
const workers = Array.from({length: workerCount}, (_, i) => {
  const from = Math.floor((grid.count * i) / workerCount);
  const to = Math.floor((grid.count * (i + 1)) / workerCount);
  return new Worker(new URL('./score-worker.js', import.meta.url), {
    workerData: {
      statsBuffer,
      zoneBuffer,
      fields,
      count: grid.count,
      monthCount: months.length,
      from,
      to,
    },
  });
});

const hourBuffer = new SharedArrayBuffer(fields.length * grid.count * 4);
const hourValues = new Uint8Array(hourBuffer);

function scoreHour(zoneMonth) {
  return Promise.all(
    workers.map(
      (worker) =>
        new Promise((resolve) => {
          worker.once('message', resolve);
          worker.postMessage({hourBuffer, zoneMonth});
        }),
    ),
  );
}

// --- Main loop -------------------------------------------------------------------

const todo = hours.filter(({name}) => !scored.has(name));
console.log(
  `${grid.count} cells, ${hours.length} hours (${todo.length} to score), ` +
    `${workerCount} workers`,
);

let pending = [];
const started = Date.now();
for (const [n, {name, zoneMonth}] of todo.entries()) {
  const path = join(spool, `${name}.f32`);
  while (!existsSync(path)) {
    if (fetcherExit !== null) {
      console.error(`\nhrrr.py exited (${fetcherExit}) without ${name}.`);
      await saveCheckpoint(pending);
      process.exit(1);
    }
    await sleep(250);
  }
  hourValues.set(await readFile(path));
  await scoreHour(zoneMonth);
  await rename(path, join(spool, `${name}.done`));
  pending.push(name);

  if (pending.length >= CHECKPOINT_HOURS || n === todo.length - 1) {
    await saveCheckpoint(pending);
    pending = [];
  }
  const elapsed = (Date.now() - started) / 1000;
  const eta = (elapsed / (n + 1)) * (todo.length - n - 1);
  process.stdout.write(
    `\r${name}: ${n + 1}/${todo.length} hours, ` +
      `${Math.round(elapsed / 60)} min elapsed, ~${Math.round(eta / 60)} min left `,
  );
}
console.log();
for (const worker of workers) worker.terminate();
fetcher.kill();

// --- Output --------------------------------------------------------------------

// One RGB image per period and activity, the size of the HRRR grid, north up:
//   R  share of waking hours at Good or better, 0-200 in half-percent steps
//   G  mean score, 0-100
//   B  index into FACTORS of what cost the most hours below Good, 254 if none
// and 255 in every channel where there is no data. Lossless PNG keeps it exact
// and lets the page fetch one period at a time.
const NO_DATA = 255;
const NO_FACTOR = 254;

async function writeImage(path, activity, monthIndexes) {
  const {nx, ny} = grid;
  const pixels = Buffer.alloc(nx * ny * 3, NO_DATA);
  const totals = new Float64Array(fieldCount);
  for (let c = 0; c < grid.count; c++) {
    totals.fill(0);
    for (const m of monthIndexes) {
      const base =
        ((c * ACTIVITY_KEYS.length + activity) * months.length + m) *
        fieldCount;
      for (let f = 0; f < fieldCount; f++) totals[f] += stats[base + f];
    }
    const [total, good, scoreSum] = totals;
    if (!total) continue;
    let worst = -1;
    for (let f = 3; f < fieldCount; f++)
      if (totals[f] > 0 && (worst < 0 || totals[f] > totals[worst])) worst = f;

    // HRRR's rows run south to north; images run top down.
    const cell = cells[c];
    const x = cell % nx;
    const y = ny - 1 - Math.floor(cell / nx);
    const p = (y * nx + x) * 3;
    pixels[p] = Math.round((200 * good) / total);
    pixels[p + 1] = Math.round(scoreSum / total);
    pixels[p + 2] = worst < 0 ? NO_FACTOR : worst - 3;
  }
  await sharp(pixels, {raw: {width: nx, height: ny, channels: 3}})
    .png({compressionLevel: 9})
    .toFile(path);
}

await mkdir(DATA_DIR, {recursive: true});
for (const file of await readdir(DATA_DIR)) await unlink(join(DATA_DIR, file));

const periods = [{key: 'all', months: months.map((_, i) => i)}];
months.forEach((month, i) => periods.push({key: month, months: [i]}));
for (const period of periods) {
  for (const [a, activity] of ACTIVITY_KEYS.entries()) {
    await writeImage(
      join(DATA_DIR, `${period.key}-${activity}.png`),
      a,
      period.months,
    );
  }
}

await writeFile(
  join(DATA_DIR, 'meta.json'),
  JSON.stringify(
    {
      start: args.start,
      end: args.end,
      nx: grid.nx,
      ny: grid.ny,
      projection: grid.projection,
      periods: periods.map((p) => p.key),
      activities: ACTIVITY_KEYS,
      factors: FACTORS,
      goodScore: GOOD_SCORE,
      wakingHours: [WAKING_START_HOUR, WAKING_END_HOUR],
      encoding: {goodScale: 200, noData: NO_DATA, noFactor: NO_FACTOR},
    },
    null,
    2,
  ),
);
console.log(`Wrote ${periods.length * ACTIVITY_KEYS.length} images to data/.`);
