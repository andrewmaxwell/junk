import fs from 'fs';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dataDir = join(__dirname, 'data');
const outputPath = join(__dirname, 'output.txt');

const jsonFiles = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
const seen = new Set();
const messages = jsonFiles.flatMap((f) => {
  const {messages} = JSON.parse(fs.readFileSync(join(dataDir, f), 'utf8'));
  return messages.filter((m) => {
    if (seen.has(m.timestamp_ms)) return false;
    seen.add(m.timestamp_ms);
    return true;
  });
});

// Ensure absolute chronological order
messages.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

// Build shortest unique initials for each sender first name
const decodedFirstName = (m) =>
  Buffer.from(m.sender_name, 'latin1').toString('utf8').split(' ')[0];
const firstNames = [...new Set(messages.map(decodedFirstName))].sort();

const initialsMap = {};
for (const name of firstNames) {
  for (let len = 1; len <= name.length; len++) {
    const candidate = name.substring(0, len);
    if (!Object.values(initialsMap).includes(candidate)) {
      initialsMap[name] = candidate;
      break;
    }
  }
}

const writeStream = fs.createWriteStream(outputPath);

// Legend so Claude knows who's who
const legend = firstNames.map((n) => `${initialsMap[n]}=${n}`).join(', ');
writeStream.write(`Participants: ${legend}\n`);

let currentDay = '';

for (const message of messages) {
  if (message.is_unsent) continue;
  if (!message.content) continue;
  if (message.content.match(/ reacted.+to your message/)) continue;

  // Decode Facebook's Latin-1 mojibake back to valid UTF-8 for emojis
  const decoded = Buffer.from(message.content, 'latin1').toString('utf8');
  const msgText = decoded.trim().replace(/\s+/g, ' ');

  const initial = initialsMap[decodedFirstName(message)];

  // Use UTC to avoid local Daylight Saving Time anomalies in the timeline
  const date = new Date(message.timestamp_ms).toISOString().split('T')[0];

  if (date !== currentDay) {
    writeStream.write(`\n[${date}]\n`);
    currentDay = date;
  }

  writeStream.write(`${initial}: ${msgText}\n`);
}

writeStream.end();
console.log(`Saved optimized output to ${outputPath}`);
