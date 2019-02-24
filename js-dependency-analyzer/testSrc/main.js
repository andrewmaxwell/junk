import {GetDeps as getDeps} from './GetDeps.js';
import fs from 'fs';

export const abc = (...args) => args.join('-');

const res = getDeps(fs.readFileSync('../ui/src/client/index.js').toString());
fs.writeFileSync('output.json', JSON.stringify(res, null, 2));
