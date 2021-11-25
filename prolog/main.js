const prolog = (facts) => {
  console.log(facts);
  return (query) => {};
};

const {Test} = require('../misc/test');

const query = prolog(require('fs').readFileSync('./prolog/facts.txt', 'utf-8'));

const tests = `
mother_of(becky,mark). -> true
mother_of(becky,andrew). -> false
grandmother_of(becky, andrew). -> true
brother_of(andrew,joshua). -> true
brother_of(andrew,marie). -> false
sister_of(marie, andrew). -> true
sister_of(andrew, marie). -> false
ancestor_of(bill, isla). -> true
ancestor_of(isla, bill). -> false

`;

for (const row of tests.trim().split('\n')) {
  const [input, expected] = row.split(' -> ');
  Test.assertDeepEquals(query(input), expected);
}
