// Downloads the exports saved to Google Drive by hand from the phone:
// - Aranet4 CSVs (any file named Aranet4*.csv) into data/aranet/. Each export
//   holds the app's whole history; schema.sql drops the overlap.
// - The newest Google Maps Timeline export ("Timeline.json" or the phone's
//   "Timeline (2).json" duplicates) into data/Timeline.json, if it's newer
//   than the copy there and doesn't start later, which would lose history.
// Usage: node health/fetchDrive.js

import {mkdir, readdir, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {dataDir, googleGet, readJson} from './googleAuth.js';

const api = 'https://www.googleapis.com/drive/v3/files';

const findFiles = async (q) =>
  (
    await googleGet(
      'drive',
      `${api}?${new URLSearchParams({
        q: `${q} and trashed = false`,
        orderBy: 'modifiedTime desc',
        fields: 'files(id, name, modifiedTime)',
        pageSize: 1000,
      })}`,
    )
  ).files;

const download = (file) =>
  googleGet('drive', `${api}/${file.id}?alt=media`, 'text');

const aranetDir = join(dataDir, 'aranet');
await mkdir(aranetDir, {recursive: true});
const have = new Set(await readdir(aranetDir));
const aranet = (await findFiles("name contains 'Aranet4'")).filter(
  (f) => f.name.endsWith('.csv') && !have.has(f.name),
);
for (const file of aranet) {
  await writeFile(join(aranetDir, file.name), await download(file));
}
console.log(`Aranet4: ${aranet.length} new exports`);

const [timeline] = (await findFiles("name contains 'Timeline'")).filter((f) =>
  /^Timeline( \(\d+\))?\.json$/.test(f.name),
);
const timelinePath = join(dataDir, 'Timeline.json');
const localTime = await stat(timelinePath).then(
  (s) => s.mtime,
  () => 0,
);
if (!timeline) console.log('Timeline: no export in Drive');
else if (Date.parse(timeline.modifiedTime) <= localTime)
  console.log(`Timeline: up to date with ${timeline.name}`);
else {
  const text = await download(timeline);
  const firstStart = (t) => t?.semanticSegments?.[0]?.startTime ?? '';
  const old = firstStart(await readJson(timelinePath));
  const start = firstStart(JSON.parse(text));
  if (old && start.slice(0, 10) > old.slice(0, 10)) {
    console.log(
      `Timeline: skipped ${timeline.name}, which starts ${start.slice(0, 10)}, later than the current ${old.slice(0, 10)}`,
    );
  } else {
    await writeFile(timelinePath, text);
    console.log(
      `Timeline: ${timeline.name} (${timeline.modifiedTime.slice(0, 10)})`,
    );
  }
}
