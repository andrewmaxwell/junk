type Evt = {start: number; end: number};

const getOrder = (events: Evt[]) => {
  const rows: Evt[][] = [];
  for (const e of [...events].sort((a, b) => a.start - b.start)) {
    const r = rows.find((r) => r[r.length - 1].end <= e.start);
    if (r) r.push(e);
    else rows.push([e]);
  }
  return rows.flat();
};

import {Test} from './test.js';

Test.assertDeepEquals(
  getOrder([
    {start: 4, end: 6}, // 2
    {start: 3, end: 5}, // 3
    {start: 1, end: 4}, // 2
    {start: 0, end: 5}, // 1
    {start: 5, end: 7}, // 1
    {start: 2, end: 3}, // 3
  ]),
  [
    {start: 0, end: 5}, // 1
    {start: 5, end: 7}, // 1
    {start: 1, end: 4}, // 2
    {start: 4, end: 6}, // 2
    {start: 2, end: 3}, // 3
    {start: 3, end: 5}, // 3
  ],
);
