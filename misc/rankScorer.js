const scores = `DABC
ABDC
BADC
DBAC
BADC
ABDC
ABDC
ABDC

BDAC

BACD
BDAC
BADC
BADC
DBAC
BDAC
DABC
ACDB
DBAC

BDAC`;

const points = {};
for (const row of scores.split('\n')) {
  for (let i = 0; i < row.length; i++) {
    points[row[i]] = (points[row[i]] || 0) + (row.length - i - 1);
  }
}

const result = Object.entries(points)
  .sort((a, b) => b[1] - a[1])
  .map((p, i) => i + 1 + '. ' + p.join(': '))
  .join('\n');

console.log(result);

/*

A 7UP
B SPRITE
C STARRY
D TWIST UP

A Papa John's
B Pizza Hut
C Domino's
D Little Caesar's
E Tombstone

A COKE
B RC
C ROOT BEER
D DR PEPPER
E PEPSI

A BLUE BUNNY
B BREYERS
C GREAT VALE
D PRARIE FARMS
*/
