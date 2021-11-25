// nodemon -r esm lisp/cli lisp/solveMaze.txt

import fs from 'fs';
import {execute} from './execute';
import {parse} from './parse';

console.log(execute(parse(fs.readFileSync(process.argv[2], 'utf-8'))));
