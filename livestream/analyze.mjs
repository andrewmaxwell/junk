// Reads a monitor log and compares each hop during every incident to the rest
// of the day, then prints which hop went bad first.
//
//   node analyze.mjs [logs/2026-11-01.jsonl]
import fs from 'node:fs';
import path from 'node:path';

const logDir = path.join(import.meta.dirname, 'logs');
const file =
  process.argv[2] ??
  path.join(
    logDir,
    fs
      .readdirSync(logDir)
      .filter((f) => f.endsWith('.jsonl'))
      .sort()
      .at(-1),
  );
const rows = fs
  .readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const clock = (t) => new Date(t).toLocaleTimeString();
const percentile = (sorted, p) => sorted[Math.floor((sorted.length - 1) * p)];

const pingStats = (pings) => {
  const ms = pings
    .filter((p) => p.ms !== null)
    .map((p) => p.ms)
    .sort((a, b) => a - b);
  return {
    count: pings.length,
    loss: pings.length ? (100 * (pings.length - ms.length)) / pings.length : 0,
    p50: percentile(ms, 0.5),
    p95: percentile(ms, 0.95),
  };
};

const pings = rows.filter((r) => r.k === 'ping');
const atem = rows.filter((r) => r.k === 'atem');
const targets = [...new Set(pings.map((p) => p.target))];
const fmt = (n) => (n === undefined ? '-' : n.toFixed(1));

// Pair up incident start and end rows. An unfinished one runs to the end of the log.
const incidents = [];
for (const r of rows.filter((r) => r.k === 'incident')) {
  if (r.phase === 'start')
    incidents.push({start: r.t, end: rows.at(-1).t, reason: r.reason});
  else if (incidents.length) incidents.at(-1).end = r.t;
}
const leadIn = 60000;
const during = (t, i) => t >= i.start - leadIn && t <= i.end;
const baseline = pings.filter((p) => !incidents.some((i) => during(p.t, i)));

const isBad = (now, base) =>
  now.count >= 5 &&
  (now.loss >= base.loss + 1 ||
    (base.p95 !== undefined && now.p95 > base.p95 * 2 + 20));

const verdict = (bad, measured) => {
  if (!measured)
    return 'Too few ping results around this incident to say anything.';
  const outside = ['youtube', 'google-dns', 'cloudflare'].filter((t) =>
    bad.has(t),
  );
  if (bad.has('atem') && !bad.has('router'))
    return "Only the path to the ATEM looks bad. Suspect its cable, its switch port or the LAN segment it's on.";
  if (bad.has('router'))
    return 'The router itself was slow from this Mac. That may be only the Mac\'s Wi-Fi: check whether "atem" was also bad, and the Wi-Fi rows. A wired test is needed before blaming the LAN.';
  // A lone router that deprioritizes ping isn't a problem, so later hops must agree
  if (bad.has('isp') && outside.length)
    return "Trouble starts at the first Spectrum hop: either the upload is saturated by something on our network, or it's the modem or Spectrum's local segment. Check the router's per-device traffic and the modem's signal page to separate these.";
  if (outside.length === 3)
    return 'The first hop is healthy but everything beyond it is bad. That points to Spectrum further upstream.';
  if (bad.has('youtube') && !bad.has('cloudflare'))
    return 'YouTube is bad while Cloudflare is fine: the path to YouTube or its ingest, rather than our connection.';
  if (bad.size)
    return `Partial signal, not conclusive: ${[...bad].join(', ')}.`;
  return "Every hop stayed healthy while the cache grew. That rules out a general network problem and leaves the ATEM's one stream: YouTube's ingest, that single route, or the ATEM. Compare with YouTube Studio's stream health for the same minutes.";
};

console.log(`${file}: ${clock(rows[0].t)} to ${clock(rows.at(-1).t)}\n`);

for (const i of incidents) {
  const within = atem.filter((a) => a.t >= i.start && a.t <= i.end);
  const peak = Math.max(0, ...within.map((a) => a.cache ?? 0));
  console.log(
    `Incident ${clock(i.start)} to ${clock(i.end)}: ${i.reason}, peak cache ${peak}`,
  );
  const bad = new Set();
  console.log('  hop          now loss%/p50/p95        normal loss%/p50/p95');
  for (const target of targets) {
    const now = pingStats(
      pings.filter((p) => p.target === target && during(p.t, i)),
    );
    const base = pingStats(baseline.filter((p) => p.target === target));
    if (isBad(now, base)) bad.add(target);
    console.log(
      `  ${target.padEnd(12)} ${fmt(now.loss)} / ${fmt(now.p50)} / ${fmt(now.p95)}`.padEnd(
        40,
      ) +
        `${fmt(base.loss)} / ${fmt(base.p50)} / ${fmt(base.p95)}${bad.has(target) ? '   BAD' : ''}`,
    );
  }
  const measured = targets.some(
    (target) =>
      pings.filter((p) => p.target === target && during(p.t, i)).length >= 5,
  );
  console.log(`  -> ${verdict(bad, measured)}\n`);
}
if (!incidents.length) console.log('No incidents in this log.\n');

// Five-minute table, for the "everyone starts at 10:30" question
const bucketSize = 5 * 60000;
const buckets = new Map();
for (const r of [...pings, ...atem]) {
  const key = Math.floor(r.t / bucketSize) * bucketSize;
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(r);
}
console.log(
  `time`.padEnd(13) +
    `cache  mbps  ${targets.map((t) => t.padEnd(14)).join('')}(p95ms/loss%)`,
);
for (const key of [...buckets.keys()].sort((a, b) => a - b)) {
  const group = buckets.get(key);
  const stream = group.filter((r) => r.k === 'atem' && r.bitrate !== undefined);
  const cache = stream.length
    ? String(Math.max(...stream.map((r) => r.cache ?? 0)))
    : '-';
  const mbps = stream.length
    ? (
        stream.reduce((sum, r) => sum + r.bitrate, 0) /
        stream.length /
        1e6
      ).toFixed(1)
    : '-';
  const cells = targets.map((target) => {
    const s = pingStats(
      group.filter((r) => r.k === 'ping' && r.target === target),
    );
    return `${fmt(s.p95)}/${s.loss.toFixed(0)}`.padEnd(14);
  });
  console.log(
    clock(key).padEnd(13) + cache.padEnd(7) + mbps.padEnd(6) + cells.join(''),
  );
}
