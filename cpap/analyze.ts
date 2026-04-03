import * as edfjs from 'edfjs';
import fs from 'fs';
import path from 'path';

interface Breath {
  timeSeconds: number;
  inSeconds: number;
  outSeconds: number;
  inML: number;
  outML: number;
}

const SAMPLE_RATE = 25;
const flowToMlPerSample = 1000 / SAMPLE_RATE;

const movingAvg = (arr: number[], win: number) => {
  let sum = 0;
  return arr.map((val, i) => {
    sum += val;
    if (i >= win) sum -= arr[i - win];
    return sum / Math.min(i + 1, win);
  });
};

function analyzeFlowData(flowData: number[]): Breath[] {
  console.log('Smoothing and centering data...');
  const smoothed = movingAvg(flowData, Math.round(SAMPLE_RATE * 0.25));
  const baseline = movingAvg(smoothed, Math.round(SAMPLE_RATE * 10));
  const centered = smoothed.map((val, i) => val - baseline[i]);

  const breaths: Breath[] = [];
  let inPhase = {start: 0, duration: 0, vol: 0};
  let outPhase = {start: 0, duration: 0, vol: 0};
  let currentPhase = 'IN';

  for (let i = 0; i < centered.length; i++) {
    const isPositive = centered[i] > 0;
    const type = isPositive ? 'IN' : 'OUT';
    const vol = Math.abs(centered[i]) * flowToMlPerSample;

    if (type !== currentPhase) {
      if (currentPhase === 'OUT') {
        const minSamples = SAMPLE_RATE * 0.25; // drop noise < 0.25s
        if (inPhase.duration > minSamples && outPhase.duration > minSamples) {
          breaths.push({
            timeSeconds: inPhase.start / SAMPLE_RATE,
            inSeconds: inPhase.duration / SAMPLE_RATE,
            outSeconds: outPhase.duration / SAMPLE_RATE,
            inML: inPhase.vol,
            outML: outPhase.vol,
          });
        }
        inPhase = {start: i, duration: 0, vol: 0};
      } else {
        outPhase = {start: i, duration: 0, vol: 0};
      }
      currentPhase = type;
    }

    if (type === 'IN') {
      inPhase.duration++;
      inPhase.vol += vol;
    } else {
      outPhase.duration++;
      outPhase.vol += vol;
    }
  }
  return breaths;
}

// --- Run ---
const DATALOG_DIR = '/Volumes/CPAP/DATALOG/20260323';
const BREATHS_FILE = path.join(import.meta.dirname, 'breaths.csv');
const FLOW_FILE = path.join(import.meta.dirname, 'flow_rate.csv');

console.log('Finding all BRP files...');
const files = fs
  .readdirSync(DATALOG_DIR)
  .filter((f) => f.endsWith('_BRP.edf'))
  .sort();

const blocks: {startTimeMs: number; data: number[]}[] = [];

for (const file of files) {
  const filePath = path.join(DATALOG_DIR, file);
  console.log(`Loading flow data from ${file}...`);

  const buf = fs.readFileSync(filePath);
  const edf = new edfjs.EDF();
  edf.read_buffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );

  const channelKey = Object.keys(edf.channel_by_label).find((k) =>
    k.includes('Flow'),
  );
  if (channelKey) {
    const data = Array.from(
      edf.channel_by_label[channelKey].blob as Float32Array,
    ).map((v) => Math.round(v * 1000) / 1000);

    // Extracted directly from the EDF headers!
    const startTimeMs = new Date(edf.startdatetime).getTime();
    blocks.push({startTimeMs, data});
  } else {
    console.warn(`Warning: No flow channel found in ${file}`);
  }
}

let allFlowData = new Float32Array(0);

if (blocks.length > 0) {
  // Sort by true start time from the metadata
  blocks.sort((a, b) => a.startTimeMs - b.startTimeMs);

  const T0 = blocks[0].startTimeMs;
  const lastBlock = blocks[blocks.length - 1];

  // Create an array initialized to entirely zeroes for the true timeline
  const totalSamples =
    Math.ceil(((lastBlock.startTimeMs - T0) / 1000) * SAMPLE_RATE) +
    lastBlock.data.length;
  allFlowData = new Float32Array(totalSamples);

  for (const block of blocks) {
    const startIdx = Math.round(
      ((block.startTimeMs - T0) / 1000) * SAMPLE_RATE,
    );
    allFlowData.set(block.data, startIdx);
  }
}

const flowArray = Array.from(allFlowData);

console.log(
  `Processing ${flowArray.length} total samples (${Math.round(flowArray.length / SAMPLE_RATE)} seconds)...`,
);

const breaths = analyzeFlowData(flowArray);
console.log(`Extracted ${breaths.length} breaths.`);

// Save Breaths CSV
const breathsCsvData = [
  'timeSeconds,inSeconds,outSeconds,inML,outML',
  ...breaths.map(
    (b) =>
      `${b.timeSeconds.toFixed(1)},${b.inSeconds.toFixed(2)},${b.outSeconds.toFixed(2)},${b.inML.toFixed(1)},${b.outML.toFixed(1)}`,
  ),
].join('\n');
fs.writeFileSync(BREATHS_FILE, breathsCsvData);
console.log(`Saved breaths to ${BREATHS_FILE}`);

// Save Flow Rate CSV
console.log('Generating flow_rate.csv...');
const flowCsvData = ['timeSeconds,flowRate'];
for (let i = 0; i < flowArray.length; i++) {
  flowCsvData.push(
    `${(i / SAMPLE_RATE).toFixed(2)},${flowArray[i].toFixed(3)}`,
  );
}
fs.writeFileSync(FLOW_FILE, flowCsvData.join('\n'));
console.log(`Saved flow data to ${FLOW_FILE}`);
