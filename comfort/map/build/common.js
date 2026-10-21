// Shared between the scorer and its workers. The Python half of the pipeline
// (`grid.py`, `hrrr.py`, `cams.py`) writes into the same cache directories.

import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const BUILD_DIR = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(BUILD_DIR, '..', 'data');
export const CACHE_DIR = join(BUILD_DIR, 'cache');
export const GRID_DIR = join(CACHE_DIR, 'grid');

// One directory per requested date range, holding the hours waiting to be
// scored and the scorer's checkpoint. `hrrr.py` names it the same way.
export const runDir = (start, end) =>
  join(CACHE_DIR, 'runs', `${start}_${end}`);

// The same window the app's best-window search treats as walkable, in each
// cell's own local time. `hrrr.py` skips UTC hours outside it everywhere.
export const WAKING_START_HOUR = 6;
export const WAKING_END_HOUR = 22;
export const GOOD_SCORE = 70; // bottom of the app's "Good" band

export const ACTIVITY_KEYS = ['walk', 'sit'];
export const FACTORS = [
  'heat',
  'cold',
  'rain',
  'wind',
  'sun',
  'air',
  'dark',
  'storm',
  'ice',
  'gale',
];
// Waking hours, hours at Good or better, the score sum, then one count per
// factor of the hours below Good that the factor was most responsible for.
export const STAT_FIELDS = ['hours', 'good', 'scoreSum', ...FACTORS];
