const allDifferentConstraint = (rowVars) => (domains) => {
  for (const v of rowVars) {
    if (domains[v].length !== 1) continue;
    for (const w of rowVars) {
      const index = domains[w].indexOf(domains[v][0]);
      if (v === w || index === -1) continue;
      if (domains[w].length === 1) return false;
      domains[w].splice(index, 1);
    }
  }
  return true;
};

const sameColumnConstraint = (s1, s3) => (domains) => {
  const possible = domains[s1].filter((x) => domains[s3].includes(x));
  if (!possible.length) return false;
  if (domains[s1].length !== possible.length) domains[s1] = possible;
  if (domains[s3].length !== possible.length) domains[s3] = [...possible];
  return true;
};

const leftOfConstraint = (s1, s3) => (domains) => {
  const s1Possible = domains[s1].filter((x) => domains[s3].some((y) => x < y));
  if (!s1Possible.length) return false;
  if (domains[s1].length !== s1Possible.length) domains[s1] = s1Possible;

  const s3Possible = domains[s3].filter((x) => domains[s1].some((y) => y < x));
  if (!s3Possible.length) return false;
  if (domains[s3].length !== s3Possible.length) domains[s3] = s3Possible;
  return true;
};

const nextToConstraint = (s1, s2) => (domains) => {
  const s1Possible = domains[s1].filter((x) =>
    domains[s2].some((y) => Math.abs(x - y) === 1)
  );
  if (!s1Possible.length) return false;
  if (domains[s1].length !== s1Possible.length) domains[s1] = s1Possible;

  const s2Possible = domains[s2].filter((x) =>
    domains[s1].some((y) => Math.abs(x - y) === 1)
  );
  if (!s2Possible.length) return false;
  if (domains[s2].length !== s2Possible.length) domains[s2] = s2Possible;
  return true;
};

const betweenConstraint = (s1, s2, s3) => (domains) => {
  const s2Possible = domains[s2].filter((x) =>
    domains[s1].some((y) =>
      domains[s3].some((z) => (y < x && x < z) || (z < x && x < y))
    )
  );
  if (!s2Possible.length) return false;
  if (domains[s2].length !== s2Possible.length) domains[s2] = s2Possible;
  return true;
};

const rowValues = {
  0: ['A', 'B', 'C', 'D', 'E'],
  1: ['F', 'G', 'H', 'I', 'J'],
  2: ['K', 'L', 'M', 'N', 'O'],
  3: ['P', 'Q', 'R', 'S', 'T'],
};

const findSolution = (domains, constraints) => {
  if (Object.values(domains).every((d) => d.length === 1)) return domains;

  const smallest = Object.keys(domains)
    .filter((v) => domains[v].length > 1)
    .reduce((a, b) => (domains[a].length <= domains[b].length ? a : b));

  for (const value of domains[smallest]) {
    domains[smallest] = [value]; // try this value

    // the constraints mutate the domains, so they need to be saved and restored
    const savedDomains = {};
    for (const v in domains) {
      savedDomains[v] = [...domains[v]];
    }

    if (constraints.every((c) => c(domains))) {
      const result = findSolution(domains, constraints);
      if (result) return result;
    }

    for (const v in domains) {
      domains[v] = savedDomains[v]; // restore domains
    }
  }
  return false;
};

const solve = (clues) => {
  const domains = {};
  for (const symbol of Object.values(rowValues).flat()) {
    domains[symbol] = [0, 1, 2, 3, 4];
  }

  const constraints = [
    ...Object.values(rowValues).map(allDifferentConstraint),
    ...clues.map(([s1, s2, s3]) => {
      if (s2 === '^') return sameColumnConstraint(s1, s3);
      if (s2 === '<') return leftOfConstraint(s1, s3);
      if (s1 === s3) return nextToConstraint(s1, s2);
      return betweenConstraint(s1, s2, s3);
    }),
  ];

  // apply constraints once before looking for solution
  constraints.forEach((c) => c(domains));

  const solution = findSolution(domains, constraints);

  if (!solution) return false;

  const result = [];
  for (const r in rowValues) {
    for (const t of rowValues[r]) {
      result[solution[t][0] + r * 5] = t;
    }
  }
  return result.join('');
};

// https://www.codewars.com/kata/5b044f0a3e9715078200029a/train/javascript

import {Test} from './test.js';
Test.failFast = true;

console.time();

Test.assertDeepEquals(
  solve([
    'MRT',
    'ABH',
    'LKO',
    'OKP',
    'JIM',
    'OPE',
    'GDO',
    'RAQ',
    'J^A',
    'M^P',
    'A<Q',
    'D<K',
    'OQO',
  ]),
  'EDBACGHIJFLMKONSPRTQ'
);

Test.assertDeepEquals(
  solve([
    'KLA',
    'JAB',
    'FJH',
    'CMF',
    'AQT',
    'GBN',
    'MAF',
    'Q^B',
    'J^E',
    'R^A',
    'M<R',
    'E<N',
    'N<F',
    'AMA',
    'MCM',
    'EPE',
  ]),
  'CEABDHJIFGOMNLKPSRQT'
);

Test.assertDeepEquals(
  solve([
    'PBJ',
    'KDO',
    'DHG',
    'AOR',
    'INM',
    'EMB',
    'GTD',
    'O^T',
    'P<Q',
    'T<P',
    'A<L',
    'P<F',
    'RIR',
    'IDI',
  ]),
  'CDBAEIJHGFKNOMLSRTPQ'
);

Test.assertDeepEquals(
  solve([
    'EMJ',
    'DJO',
    'AMN',
    'ADC',
    'CIL',
    'END',
    'GQS',
    'SAB',
    'Q<B',
    'RPR',
    'SAS',
    'FNF',
    'NPN',
    'SCS',
  ]),
  'ECDABFHIJGKNMLOPRSQT'
);

Test.assertDeepEquals(
  solve([
    'LCI',
    'CQH',
    'NOF',
    'AEC',
    'APG',
    'NGL',
    'EQB',
    'F^P',
    'M^S',
    'E<J',
    'B<F',
    'T<P',
    'F<A',
    'P<K',
    'S<Q',
    'LCL',
  ]),
  'BDCEAHIGFJMNOLKSQTPR'
);

Test.assertDeepEquals(
  solve([
    'KIT',
    'RGL',
    'GBJ',
    'LJT',
    'SPD',
    'KLS',
    'EKB',
    'FCI',
    'KLF',
    'KLO',
    'P^L',
    'M<G',
    'S<P',
    'T<L',
    'MPM',
  ]),
  'ACBDEFJIGHOMLKNTSPQR'
);

Test.assertDeepEquals(
  solve([
    'MPD',
    'BHK',
    'NLI',
    'SLN',
    'HBR',
    'RNA',
    'ORN',
    'G^Q',
    'Q<M',
    'H<N',
    'HKH',
    'FMF',
    'CMC',
    'DID',
  ]),
  'CABDEGHFJIKMNLOQTPRS'
);

Test.assertDeepEquals(
  solve('KRI,JHA,CKB,SCM,ACI,SLN,IHS,H<S,G<O,T<Q,N<D,S<P,TIT,FSF'.split(',')),
  'EDCABJIHGFNMLKOTQRSP'
);
console.timeEnd();
