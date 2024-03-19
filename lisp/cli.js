// nodemon lisp/cli.js misc/minWindow.lisp

import fs from 'fs';
import {execute} from './execute.js';
import {parse} from './parse.js';

console.log(execute(parse(fs.readFileSync(process.argv[2], 'utf-8'))));
