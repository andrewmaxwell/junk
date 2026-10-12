// Downloads Andrew's own (primary) Google Calendar, which includes the
// headache log, into data/calendar/primary.json. Other calendars in the list
// (shared, work, holidays) are left out. The whole range is refetched each
// run, since it's only a few requests.
// Usage: node health/fetchCalendar.js [--since 2010-01-01]

import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {dataDir, googleGet} from './googleAuth.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const since = arg('since', '2010-01-01');
const api = 'https://www.googleapis.com/calendar/v3';

const fetchAllPages = async (url, params) => {
  const items = [];
  let pageToken;
  do {
    if (pageToken) params.set('pageToken', pageToken);
    const page = await googleGet('calendar', `${url}?${params}`);
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items;
};

const events = await fetchAllPages(
  `${api}/calendars/primary/events`,
  new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: new Date(since).toISOString(),
    timeMax: new Date().toISOString(),
    maxResults: 2500,
  }),
);
const dir = join(dataDir, 'calendar');
await mkdir(dir, {recursive: true});
await writeFile(join(dir, 'primary.json'), JSON.stringify(events));
console.log(`primary: ${events.length} events since ${since}`);
