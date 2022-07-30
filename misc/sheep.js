const mapping = {s: 2, h: 3, e: 5, p: 7};
const sheep = 2 * 3 * 5 * 5 * 7;

const count = (str) => {
  let result = 0;
  const rows = str.split('\n').map((r) => [...r].map((v) => mapping[v]));
  for (let i = 0; i < rows.length - 2; i++) {
    const top = rows[i];
    const middle = rows[i + 1];
    const bottom = rows[i + 2];
    for (let j = 0; j < top.length - 2; j++) {
      result +=
        (top[j] * top[j + 2] * middle[j + 1] * bottom[j] * bottom[j + 2] ===
          sheep) +
        (top[j + 1] *
          middle[j] *
          middle[j + 1] *
          middle[j + 2] *
          bottom[j + 1] ===
          sheep);
    }
  }
  return result;
};

import {Test} from './test.js';
Test.assertEquals(
  count(
    `ssh
hee
eep`
  ),
  1
);

Test.assertEquals(
  count(
    `ssh
hee
epp`
  ),
  2
);

Test.assertEquals(
  count(
    `hsh
hee
eep`
  ),
  0
);

Test.assertEquals(
  count(
    `
sshhss
heeeeh
eppppe`.trim()
  ),
  4
);

Test.assertEquals(
  count(
    `sshee
heesp
epphe`
  ),
  6
);
