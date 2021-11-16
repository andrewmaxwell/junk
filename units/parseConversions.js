import {solve} from './solve.js';

export const parseConversions = (str) => {
  try {
    const result = {};
    for (const row of str.toLowerCase().split('\n')) {
      if (!row.trim()) continue;
      const [unitNames, value] = row.split('=');
      const ob = solve(value, result).simplified;
      for (const u of unitNames.split(',')) {
        for (const suffix of ['', 's', 'es']) {
          result[u.trim() + suffix] = ob;
        }
      }
    }
    return result;
  } catch (e) {
    console.error(e.stack);
    return {error: e.message};
  }
};
