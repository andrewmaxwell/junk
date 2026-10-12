// Copies the CPAP SD card into data/cpap/ if it's plugged in. The card is the
// volume with a ResMed Identification.json. Files only get added or updated,
// so nights the machine has since deleted from the card stay. The card is
// ejected after a successful copy, ready to go back in the machine.
// Usage: node health/copyCpapCard.js

import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {dataDir} from './googleAuth.js';

const card = readdirSync('/Volumes')
  .map((v) => join('/Volumes', v))
  .find((v) => existsSync(join(v, 'Identification.json')));

if (card) {
  const out = execFileSync(
    'rsync',
    [
      '-a',
      '--itemize-changes',
      '--exclude',
      '.*',
      `${card}/`,
      join(dataDir, 'cpap/'),
    ],
    {encoding: 'utf8'},
  );
  const changed = out.split('\n').filter((l) => l.startsWith('>f')).length;
  console.log(`CPAP: ${changed} files copied from ${card}`);
  try {
    execFileSync('diskutil', ['eject', card], {stdio: 'pipe'});
    console.log('CPAP: card ejected');
  } catch (e) {
    console.log(`CPAP: couldn't eject the card: ${e.stderr}`.trim());
  }
} else console.log('CPAP: SD card not plugged in');
