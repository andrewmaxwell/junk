import fs from 'fs';
import path from 'path';

function readDirectoryRecursively(dir) {
  const dirName = path.basename(dir);
  if (dirName.startsWith('.') || dirName.endsWith('.lrdata')) return [];

  console.log('reading', dir);

  let results = [];
  try {
    fs.readdirSync(dir).forEach((file) => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);

      if (stats.isFile()) {
        results.push({
          fileName: path.basename(filePath),
          filePath,
          size: stats.size,
          dateCreated: stats.mtime,
          type: path.extname(filePath).toLowerCase(),
        });
      } else if (stats.isDirectory()) {
        results = results.concat(readDirectoryRecursively(filePath));
      }
    });
  } catch (e) {
    console.error(`Could not read ${dir}: ${e.message}`);
  }

  return results;
}

const directoryPath = '/Volumes/MaxwellSSD';
const files = readDirectoryRecursively(directoryPath);

const grouped = {};
for (const f of files) {
  const key = f.dateCreated.toISOString().slice(0, 7);
  if (!grouped[key]) grouped[key] = {};
  if (!grouped[key][f.type]) grouped[key][f.type] = 0;
  grouped[key][f.type] += f.size;
}

Object.entries(grouped)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([date, files]) => {
    console.log(date, files);
  });
