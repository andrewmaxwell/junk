import {GetDeps} from './GetDeps.js';
import fs from 'fs';

const dir = '../../ui/src/';
const entryPoints = [
  // 'client/index.js'
  'server/App.js'
  // 'audit-etl/index.js',
  // 'cache-builder/index.js',
  // 'members-cache/index.js',
  // 'reminders/index.js',
  // 'sectional/index.js',
];
const res = GetDeps(entryPoints.map(e => dir + e));

const keys = Object.keys(res);

console.log(keys.length + ' nodes');
console.log(
  keys.reduce((sum, key) => sum + res[key].dependencies.length, 0) + ' edges'
);

const visit = (key, depth) => {
  if (!res[key] || res[key].hasOwnProperty('depth')) return;
  res[key].depth = depth;
  res[key].dependencies.forEach(({id}) => visit(id, depth + 1));
};
keys.forEach(k => entryPoints.some(e => k.includes(e)) && visit(k, 0));

fs.writeFileSync(
  'output.json',
  JSON.stringify(res, null, 2).replace(/\/Users\/amaxw\/ui\/src\//g, '')
);

console.log(
  '\n\nMinimum depths from entry point\n' +
    keys
      .filter(k => res[k].hasOwnProperty('depth'))
      .sort((a, b) => res[a].depth - res[b].depth)
      .map(k => `${res[k].depth} - ${k}`)
      .join('\n')
      .replace(/\/Users\/amaxw\/ui\/src\//g, '')
);
