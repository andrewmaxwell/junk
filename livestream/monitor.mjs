// Logs the ATEM's streaming stats next to latency to each hop between here and
// YouTube, so that when the cache fills we can see which hop was unhealthy.
// Read only: it never sends the ATEM a command, and never logs the stream key.
//
//   caffeinate -i node monitor.mjs [--atem 10.0.0.x] [--until 12:30] [--threshold 5]
import {execFile} from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {promisify} from 'node:util';
import {Atem} from 'atem-connection';

const run = promisify(execFile);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const logDir = arg('logs', path.join(import.meta.dirname, 'logs'));
const threshold = Number(arg('threshold', 5));
const until = arg('until');
const testIncident = flag('test-incident');

fs.mkdirSync(logDir, {recursive: true});
const day = new Date().toLocaleDateString('en-CA');
const logFile = path.join(logDir, `${day}.jsonl`);
const incidentFile = path.join(logDir, 'INCIDENT');
fs.rmSync(incidentFile, {force: true});

const log = (k, data) =>
  fs.appendFileSync(
    logFile,
    JSON.stringify({t: Date.now(), k, ...data}) + '\n',
  );
const say = (msg) => console.log(`${new Date().toLocaleTimeString()} ${msg}`);

// --- Latency: one ping per target per second ---
const latest = {};
const watchPing = (name, host) => {
  latest[name] = {host, ok: 0, lost: 0, ms: []};
  setInterval(async () => {
    const {stdout} = await run('ping', [
      '-n',
      '-c',
      '1',
      '-t',
      '2',
      host,
    ]).catch((e) => ({
      stdout: e.stdout ?? '',
    }));
    const time = stdout.match(/time=([\d.]+)/);
    const ms = time ? Number(time[1]) : null;
    log('ping', {target: name, ms});
    if (time) {
      latest[name].ok++;
      latest[name].ms.push(ms);
    } else latest[name].lost++;
  }, 1000);
};

// --- TCP connect time, which is closer to what the ATEM's stream does than ping ---
const tcpProbe = (name, host, port) =>
  new Promise((resolve) => {
    const began = performance.now();
    const socket = net.connect({host, port, timeout: 5000});
    const done = (ms) => {
      socket.destroy();
      log('tcp', {target: name, ms});
      resolve();
    };
    socket.on('connect', () => done(Math.round(performance.now() - began)));
    socket.on('timeout', () => done(null));
    socket.on('error', () => done(null));
  });

const traceTargets = {};
const trace = async () => {
  await Promise.all(
    Object.entries(traceTargets).map(async ([name, host]) => {
      const {stdout} = await run('traceroute', [
        '-n',
        '-w',
        '1',
        '-q',
        '3',
        '-m',
        '16',
        host,
      ]).catch((e) => ({stdout: e.stdout ?? ''}));
      log('trace', {target: name, stdout});
    }),
  );
};

const wifiInfo = async () => {
  const {stdout} = await run('system_profiler', ['SPAirPortDataType']).catch(
    () => ({stdout: ''}),
  );
  const current = stdout.split('Current Network Information:')[1] ?? '';
  const signal = current.match(/Signal \/ Noise: (-?\d+) dBm \/ (-?\d+) dBm/);
  const rate = current.match(/Transmit Rate: (\d+)/);
  const channel = current.match(/Channel: (.+)/);
  if (signal)
    log('wifi', {
      rssi: Number(signal[1]),
      noise: Number(signal[2]),
      rate: Number(rate?.[1]),
      channel: channel?.[1],
    });
};

// --- Finding the ATEM: it answers a hello on UDP 9910 ---
const hello = Buffer.from('101453ab00000000003a00000100000000000000', 'hex');
const findAtem = (gateway) =>
  new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const prefix = gateway.split('.').slice(0, 3).join('.');
    let found;
    socket.on('message', (msg, from) => {
      if (msg.length >= 12 && from.port === 9910) found ??= from.address;
    });
    socket.bind(() => {
      for (let i = 1; i < 255; i++)
        socket.send(hello, 9910, `${prefix}.${i}`, () => {});
    });
    setTimeout(() => {
      socket.close();
      resolve(found);
    }, 3000);
  });

// --- ATEM state and incident tracking ---
const STATES = {1: 'idle', 2: 'connecting', 4: 'streaming', 32: 'stopping'};
const atemNow = {connected: false};
let incident = null;
let clearSince = null;

const startIncident = (reason) => {
  incident = {started: Date.now(), reason, peak: 0};
  log('incident', {phase: 'start', reason});
  fs.writeFileSync(incidentFile, `${new Date().toString()}\n${reason}\n`);
  say(`INCIDENT: ${reason}`);
  run('osascript', [
    '-e',
    `display notification ${JSON.stringify(reason)} with title "Livestream" sound name "Sosumi"`,
  ]).catch(() => {});
  trace();
};
const endIncident = () => {
  log('incident', {
    phase: 'end',
    durationSeconds: Math.round((Date.now() - incident.started) / 1000),
    peak: incident.peak,
  });
  say(
    `Incident over after ${Math.round((Date.now() - incident.started) / 1000)}s, peak ${incident.peak}`,
  );
  trace();
  incident = null;
};

const updateIncident = (state, cache) => {
  if (incident) incident.peak = Math.max(incident.peak, cache ?? 0);
  if (!incident && state === 'streaming' && cache >= threshold)
    startIncident(`Cache at ${cache}`);
  if (incident && (cache ?? 0) < threshold) {
    clearSince ??= Date.now();
    if (Date.now() - clearSince > 30000) {
      endIncident();
      clearSince = null;
    }
  } else clearSince = null;
};

const watchAtem = (ip) => {
  const atem = new Atem({disableMultithreaded: true});
  atem.on('error', (e) => log('atemError', {message: String(e)}));
  atem.on('connected', () => {
    atemNow.connected = true;
    log('atemLink', {up: true, ip, model: atem.state?.info?.productIdentifier});
    say(`ATEM connected: ${atem.state?.info?.productIdentifier} at ${ip}`);
    // The service's own host is where the stream really goes. The key stays out of it.
    const url = atem.state?.streaming?.service?.url;
    const [low, high] = atem.state?.streaming?.service?.bitrates ?? [];
    log('atemService', {
      host: url && url.split('/')[2],
      lowBitrate: low,
      highBitrate: high,
    });
  });
  atem.on('disconnected', () => {
    atemNow.connected = false;
    log('atemLink', {up: false, ip});
    say('ATEM link lost');
  });
  atem.connect(ip).catch((e) => say(`ATEM connect failed: ${e.message}`));
  children.push({kill: () => atem.disconnect().catch(() => {})});

  setInterval(() => {
    const s = atem.state?.streaming;
    if (!atemNow.connected || !s) return;
    const state = STATES[s.status?.state] ?? s.status?.state;
    const cache = s.stats?.cacheUsed;
    const bitrate = s.stats?.encodingBitrate;
    log('atem', {state, error: s.status?.error, cache, bitrate});
    if (!incident && atemNow.state === 'streaming' && state === 'connecting')
      startIncident('Stream dropped and is reconnecting');
    Object.assign(atemNow, {state, cache, bitrate});
    updateIncident(state, cache);
  }, 1000);
};

// --- Main ---
const children = [];
const stop = () => {
  children.forEach((c) => c.kill());
  log('stop', {});
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const {stdout: route} = await run('route', ['-n', 'get', 'default']);
const gateway = route.match(/gateway: (\S+)/)[1];
const ingestHost = 'a.rtmp.youtube.com';
const [ingest] = await dns.resolve4(ingestHost);
// The first hop past the router that answers ping, since some of Spectrum's don't
const {stdout: hops} = await run('traceroute', [
  '-n',
  '-w',
  '1',
  '-q',
  '1',
  '-m',
  '6',
  '8.8.8.8',
]);
let ispHop;
for (const line of hops.split('\n').slice(1)) {
  const host = line.trim().split(/\s+/)[1];
  if (!host || host === '*') continue;
  const answered = await run('ping', ['-n', '-c', '2', '-t', '2', host]).then(
    () => true,
    () => false,
  );
  if (answered) {
    ispHop = host;
    break;
  }
}

log('start', {gateway, ispHop, ingest, threshold, until});
say(`Logging to ${logFile}`);
say(`Router ${gateway}, ISP hop ${ispHop}, YouTube ingest ${ingest}`);

watchPing('router', gateway);
if (ispHop) watchPing('isp', ispHop);
watchPing('youtube', ingest);
watchPing('google-dns', '8.8.8.8');
watchPing('cloudflare', '1.1.1.1');
traceTargets.youtube = ingest;
traceTargets.cloudflare = '1.1.1.1';

const tcp = () =>
  Promise.all([
    tcpProbe('youtube-rtmp', ingestHost, 1935),
    tcpProbe('youtube-rtmps', 'a.rtmps.youtube.com', 443),
    tcpProbe('cloudflare-https', '1.1.1.1', 443),
  ]);
tcp();
setInterval(tcp, 15000);
wifiInfo();
setInterval(wifiInfo, 30000);
trace();
setInterval(() => incident && trace(), 60000);

let atemIp = arg('atem');
const connectWhenFound = async () => {
  atemIp ??= await findAtem(gateway);
  if (atemIp) {
    watchPing('atem', atemIp);
    watchAtem(atemIp);
  } else {
    log('atemSearch', {found: false});
    setTimeout(connectWhenFound, 30000);
  }
};
connectWhenFound();

// A status line every 30 seconds, and the optional stop time
setInterval(() => {
  const parts = Object.entries(latest).map(([name, l]) => {
    const total = l.ok + l.lost;
    const median = l.ms.sort((a, b) => a - b)[l.ms.length >> 1];
    const text = `${name} ${median?.toFixed(0) ?? '-'}ms ${total ? ((100 * l.lost) / total).toFixed(0) : 0}%`;
    Object.assign(l, {ok: 0, lost: 0, ms: []});
    return text;
  });
  const atem = atemNow.connected
    ? `ATEM ${atemNow.state} cache=${atemNow.cache ?? '-'} bitrate=${atemNow.bitrate ?? '-'}`
    : 'ATEM not connected';
  say(`${atem} | ${parts.join(' | ')}`);
}, 30000);

if (until) {
  const [hour, minute] = until.split(':').map(Number);
  const end = new Date();
  end.setHours(hour, minute, 0, 0);
  setTimeout(stop, end - Date.now());
}

if (testIncident) {
  setTimeout(() => startIncident('Test incident'), 5000);
  setTimeout(() => {
    endIncident();
    setTimeout(stop, 3000);
  }, 15000);
}
