// Downloads Google Calendar events into data/calendar/<calendar>.json. The
// whole range is refetched each run, since it's only a few requests.
// Usage: node health/fetchCalendar.js [--calendar primary] [--since 2010-01-01]

import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {dataDir, googleGet} from './googleAuth.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const calendar = arg('calendar', 'primary');
const since = arg('since', '2010-01-01');

const events = [];
let pageToken;
do {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: new Date(since).toISOString(),
    timeMax: new Date().toISOString(),
    maxResults: 2500,
  });
  if (pageToken) params.set('pageToken', pageToken);
  const page = await googleGet(
    'calendar',
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events?${params}`,
  );
  events.push(...page.items);
  pageToken = page.nextPageToken;
} while (pageToken);

const dir = join(dataDir, 'calendar');
await mkdir(dir, {recursive: true});
await writeFile(join(dir, `${calendar}.json`), JSON.stringify(events));
console.log(`${calendar}: ${events.length} events since ${since}`);
