// Turns the ResMed SD card copy in data/cpap/ into tables, with times as
// local 'YYYY-MM-DD HH:MM:SS' strings.
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {annotations, readEdf} from './edf.js';

const addSeconds = (date, s) => new Date(date.getTime() + s * 1000);

// The machine's clock doesn't follow daylight saving time and runs a few
// minutes fast. Measured against the Fitbit in Sept 2026 (sleep onset and the
// heart rate jump on getting up both trail mask times by ~54 minutes). If the
// machine's clock gets fixed, this needs a date cutoff.
const clockBehindMinutes = {daylight: 54, standard: -6};

const zoneName = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  timeZoneName: 'short',
});
const daylightByDay = new Map();
const isDaylightTime = (date) => {
  const day = date.toISOString().slice(0, 10);
  if (!daylightByDay.has(day)) {
    daylightByDay.set(day, zoneName.format(date).endsWith('CDT'));
  }
  return daylightByDay.get(day);
};

// EDF times are the machine's wall clock, parsed as if they were UTC.
const local = (machineTime) => {
  const minutes =
    clockBehindMinutes[isDaylightTime(machineTime) ? 'daylight' : 'standard'];
  return addSeconds(machineTime, minutes * 60)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
};

// STR.edf has one record per day, starting at noon. Mask on/off times are
// minutes after that noon, with -1 for unused slots.
const nights = async (dir) => {
  const str = await readEdf(join(dir, 'STR.edf'));
  const nightRows = [];
  const sessions = [];
  for (let r = 0; r < str.records; r++) {
    const get = (label) => {
      const s = str.signal(label);
      return s.values.slice(
        r * s.samplesPerRecord,
        (r + 1) * s.samplesPerRecord,
      );
    };
    const one = (label) => {
      const v = get(label)[0];
      return v < 0 ? null : Math.round(v * 100) / 100;
    };
    const usage = one('Duration');
    if (!usage) continue;

    const noon = new Date(get('Date')[0] * 86400e3 + 12 * 3600e3);
    const on = get('MaskOn').filter((v) => v >= 0);
    const off = get('MaskOff').filter((v) => v >= 0);
    on.forEach((m, i) =>
      sessions.push({
        start: local(addSeconds(noon, m * 60)),
        end: local(addSeconds(noon, off[i] * 60)),
      }),
    );

    nightRows.push({
      date: local(noon).slice(0, 10),
      usage_min: usage,
      mask_on: local(addSeconds(noon, on[0] * 60)),
      mask_off: local(addSeconds(noon, off.at(-1) * 60)),
      mask_sessions: on.length,
      ahi: one('AHI'),
      hypopnea_index: one('HI'),
      apnea_index: one('AI'),
      obstructive_ai: one('OAI'),
      central_ai: one('CAI'),
      unknown_ai: one('UAI'),
      rera_index: one('RIN'),
      csr_pct: one('CSR'),
      leak_50: one('Leak.50'),
      leak_95: one('Leak.95'),
      leak_max: one('Leak.Max'),
      mask_press_50: one('MaskPress.50'),
      mask_press_95: one('MaskPress.95'),
      resp_rate_50: one('RespRate.50'),
      resp_rate_95: one('RespRate.95'),
      tidal_vol_50: one('TidVol.50'),
      minute_vent_50: one('MinVent.50'),
      ambient_humidity_50: one('AmbHumidity.50'),
      hum_level: one('S.HumLevel'),
      tube_temp_setting: one('S.Temp'),
      epr_level: one('S.EPR.Level'),
      mode: one('Mode'),
    });
  }
  return {nightRows, sessions};
};

const pldColumns = {
  'MaskPress.2s': 'mask_press',
  'Leak.2s': 'leak',
  'RespRate.2s': 'resp_rate',
  'TidVol.2s': 'tidal_vol',
  'MinVent.2s': 'minute_vent',
  'Snore.2s': 'snore',
  'FlowLim.2s': 'flow_lim',
};

// Per-minute averages of the 2-second PLD signals, plus event annotations.
const detail = async (dir) => {
  const events = [];
  const minutes = new Map();
  const datalog = join(dir, 'DATALOG');
  for (const day of (await readdir(datalog)).sort()) {
    for (const file of (await readdir(join(datalog, day))).sort()) {
      const path = join(datalog, day, file);
      if (file.endsWith('_EVE.edf') || file.endsWith('_CSL.edf')) {
        const edf = await readEdf(path);
        for (const a of annotations(edf)) {
          if (a.text === 'Recording starts') continue;
          events.push({
            time: local(addSeconds(edf.start, a.onset)),
            type: a.text,
            duration_s: a.duration,
          });
        }
      } else if (file.endsWith('_PLD.edf')) {
        const edf = await readEdf(path);
        for (const s of edf.signals) {
          const col = pldColumns[s.label];
          if (!col) continue;
          s.values.forEach((v, i) => {
            const minute = local(addSeconds(edf.start, i / s.hz)).slice(0, 16);
            let row = minutes.get(minute);
            if (!row) minutes.set(minute, (row = {minute, n: {}}));
            row[col] = (row[col] ?? 0) + v;
            row.n[col] = (row.n[col] ?? 0) + 1;
          });
        }
      }
    }
  }
  const minuteRows = [...minutes.values()].map(({minute, n, ...sums}) => ({
    time: `${minute}:00`,
    ...Object.fromEntries(
      Object.entries(sums).map(([k, v]) => [
        k,
        Math.round((v / n[k]) * 1000) / 1000,
      ]),
    ),
  }));
  return {events, minuteRows};
};

export const ingestCpap = async (dir) => {
  const {nightRows, sessions} = await nights(dir);
  const {events, minuteRows} = await detail(dir);
  return {
    cpap_nights: nightRows,
    cpap_sessions: sessions,
    cpap_events: events,
    cpap_minutes: minuteRows,
  };
};
