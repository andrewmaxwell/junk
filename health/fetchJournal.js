// Downloads the journal (the Energy Tracker Google Form's response sheet) into
// data/journal.csv. The sheet's ID is `journalSheetId` in data/config.json.
// Usage: node health/fetchJournal.js

import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {dataDir, googleGet, readJson} from './googleAuth.js';

const {journalSheetId} = (await readJson(join(dataDir, 'config.json'))) ?? {};
if (!journalSheetId) throw new Error('Missing journalSheetId in config.json');

// A range without a sheet name means the first sheet, the form responses.
// Formatted values keep timestamps the way the form wrote them.
const {values} = await googleGet(
  'drive',
  `https://sheets.googleapis.com/v4/spreadsheets/${journalSheetId}/values/A:Z`,
);

// The API drops trailing empty cells, so rows are padded to the header.
const quote = (v = '') => `"${String(v).replaceAll('"', '""')}"`;
const csv = values
  .map((row) => values[0].map((_, i) => quote(row[i])).join(','))
  .join('\n');
await writeFile(join(dataDir, 'journal.csv'), csv + '\n');
console.log(`journal: ${values.length - 1} entries`);
