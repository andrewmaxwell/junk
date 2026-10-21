// Turns the scorer's checkpoint into what the page loads. `score.js` runs this
// when it finishes; run it alone to change the output without scoring again.
//
//   node comfort/map/build/export.js --start 2025-10-20 --end 2026-10-19
//
// Months are calendar months, so a range that starts and ends in the same month
// (late October one year, early October the next) gives one October made of
// both pieces, and twelve months in all.
//
// Writes to data/:
//
//   <period>-<activity>.png, period `all` or `01`-`12`: one RGB image the size
//   of the HRRR grid, north up, one pixel per 3 km cell:
//     R  percent of waking hours at Good or better, 0-100
//     G  index into FACTORS of what cost the most hours below Good, 254 if none
//     B  0
//   and 255 in R and G where there is no data. Lossless PNG keeps it exact and
//   lets the page fetch one period at a time. Whole percents rather than finer
//   steps, and no mean score, halve the files (1.1 MB to 0.54 MB a month):
//   the low bits were noise that PNG cannot compress.
//
//   profile/<tx>-<ty>.bin: what a place's panel shows, for 3x3-cell (9 km)
//   blocks, 32x32 blocks to a file, gzipped. Per block, activity and calendar
//   month, the share of waking hours at Good or better and then the share lost
//   to each factor, all in whole percents, 255 where there is no
//   data. Stored value-major ([value][block]) because neighbouring blocks are
//   alike and that is what compresses: about 6 MB for the whole map.
//
//   meta.json: the grid, the encodings and the periods.

import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import sharp from 'sharp';
import {
  ACTIVITY_KEYS,
  DATA_DIR,
  FACTORS,
  GOOD_SCORE,
  GRID_DIR,
  STAT_FIELDS,
  WAKING_END_HOUR,
  WAKING_START_HOUR,
  runDir,
} from './common.js';

const NO_DATA = 255;
const NO_FACTOR = 254;
const SHARE_SCALE = 100;
const BLOCK = 3; // grid cells per profile block, each way
const TILE = 32; // profile blocks per file, each way

export async function exportData(start, end) {
  const grid = JSON.parse(await readFile(join(GRID_DIR, 'grid.json'), 'utf8'));
  const cells = new Uint32Array(
    (await readFile(join(GRID_DIR, 'cells.u32'))).buffer,
  );
  const file = await readFile(join(runDir(start, end), 'checkpoint.bin'));
  const offset = 4 + file.readUInt32LE(0) * 10;
  const stats = new Uint16Array(
    file.buffer.slice(file.byteOffset + offset, file.byteOffset + file.length),
  );

  // The months `score.js` kept, in its order, and which calendar month each is.
  const months = [];
  for (let m = start.slice(0, 7); m <= end.slice(0, 7); ) {
    months.push(m);
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  }
  const calendar = Array.from({length: 12}, (_, i) =>
    months
      .map((m, index) => (Number(m.slice(5)) === i + 1 ? index : -1))
      .filter((index) => index >= 0),
  );
  if (calendar.some((indexes) => !indexes.length))
    throw new Error('The range must cover all twelve calendar months.');

  const {nx, ny} = grid;
  const fieldCount = STAT_FIELDS.length;
  const factorOffset = STAT_FIELDS.indexOf(FACTORS[0]);

  // Adds a cell's counts over some months into `totals`.
  function addCell(totals, c, activity, monthIndexes) {
    for (const m of monthIndexes) {
      const base =
        ((c * ACTIVITY_KEYS.length + activity) * months.length + m) *
        fieldCount;
      for (let f = 0; f < fieldCount; f++) totals[f] += stats[base + f];
    }
  }

  // Grid cells in image order (top down), for both outputs.
  const imageCell = new Int32Array(nx * ny).fill(-1);
  for (let c = 0; c < grid.count; c++) {
    // HRRR's rows run south to north; images run top down.
    const x = cells[c] % nx;
    const y = ny - 1 - Math.floor(cells[c] / nx);
    imageCell[y * nx + x] = c;
  }

  await rm(DATA_DIR, {recursive: true, force: true});
  await mkdir(join(DATA_DIR, 'profile'), {recursive: true});

  // --- Map images ---
  const totals = new Float64Array(fieldCount);
  const periods = [
    {key: 'all', months: months.map((_, i) => i)},
    ...calendar.map((indexes, i) => ({
      key: String(i + 1).padStart(2, '0'),
      months: indexes,
    })),
  ];
  for (const period of periods) {
    for (const [a, activity] of ACTIVITY_KEYS.entries()) {
      const pixels = Buffer.alloc(nx * ny * 3);
      for (let p = 0; p < nx * ny; p++)
        pixels[p * 3] = pixels[p * 3 + 1] = NO_DATA;
      for (let p = 0; p < nx * ny; p++) {
        if (imageCell[p] < 0) continue;
        totals.fill(0);
        addCell(totals, imageCell[p], a, period.months);
        const [hours, good] = totals;
        if (!hours) continue;
        let worst = -1;
        for (let f = factorOffset; f < fieldCount; f++)
          if (totals[f] > 0 && (worst < 0 || totals[f] > totals[worst]))
            worst = f;
        pixels[p * 3] = Math.round((SHARE_SCALE * good) / hours);
        pixels[p * 3 + 1] = worst < 0 ? NO_FACTOR : worst - factorOffset;
      }
      await sharp(pixels, {raw: {width: nx, height: ny, channels: 3}})
        .png({compressionLevel: 9})
        .toFile(join(DATA_DIR, `${period.key}-${activity}.png`));
    }
  }

  // --- Profile tiles ---
  const values = 1 + FACTORS.length;
  const perBlock = ACTIVITY_KEYS.length * 12 * values;
  const bx = Math.ceil(nx / BLOCK);
  const by = Math.ceil(ny / BLOCK);
  let bytes = 0;
  for (let ty = 0; ty * TILE < by; ty++) {
    for (let tx = 0; tx * TILE < bx; tx++) {
      const tile = Buffer.alloc(perBlock * TILE * TILE, NO_DATA);
      let any = false;
      for (let j = 0; j < TILE; j++) {
        for (let i = 0; i < TILE; i++) {
          const block = j * TILE + i;
          const cellsHere = [];
          for (let dy = 0; dy < BLOCK; dy++) {
            for (let dx = 0; dx < BLOCK; dx++) {
              const x = (tx * TILE + i) * BLOCK + dx;
              const y = (ty * TILE + j) * BLOCK + dy;
              if (x < nx && y < ny && imageCell[y * nx + x] >= 0)
                cellsHere.push(imageCell[y * nx + x]);
            }
          }
          if (!cellsHere.length) continue;
          any = true;
          for (let a = 0; a < ACTIVITY_KEYS.length; a++) {
            for (let m = 0; m < 12; m++) {
              totals.fill(0);
              for (const c of cellsHere) addCell(totals, c, a, calendar[m]);
              if (!totals[0]) continue;
              const first = (a * 12 + m) * values;
              const put = (v, count) =>
                (tile[(first + v) * TILE * TILE + block] = Math.round(
                  (SHARE_SCALE * count) / totals[0],
                ));
              put(0, totals[1]);
              for (let f = 0; f < FACTORS.length; f++)
                put(1 + f, totals[factorOffset + f]);
            }
          }
        }
      }
      if (!any) continue;
      const gz = gzipSync(tile, {level: 9});
      bytes += gz.length;
      await writeFile(join(DATA_DIR, 'profile', `${tx}-${ty}.bin`), gz);
    }
  }

  await writeFile(
    join(DATA_DIR, 'meta.json'),
    JSON.stringify(
      {
        start,
        end,
        nx,
        ny,
        projection: grid.projection,
        periods: periods.map((p) => p.key),
        activities: ACTIVITY_KEYS,
        factors: FACTORS,
        goodScore: GOOD_SCORE,
        wakingHours: [WAKING_START_HOUR, WAKING_END_HOUR],
        encoding: {
          shareScale: SHARE_SCALE,
          noData: NO_DATA,
          noFactor: NO_FACTOR,
        },
        profile: {block: BLOCK, tile: TILE},
      },
      null,
      2,
    ),
  );
  console.log(
    `Wrote ${periods.length * ACTIVITY_KEYS.length} images and ` +
      `${(bytes / 1e6).toFixed(1)} MB of profile tiles to data/.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < argv.length; i += 2)
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  if (!args.start || !args.end) {
    console.error('Usage: export.js --start YYYY-MM-DD --end YYYY-MM-DD');
    process.exit(1);
  }
  await exportData(args.start, args.end);
}
