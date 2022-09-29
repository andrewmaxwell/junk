const unique = (arr) => [...new Set(arr)];
const matchAll = (regex, str) => {
  const result = [];
  for (let match; (match = regex.exec(str)) !== null; result.push(match));
  return result;
};
const getNames = (func) => (text) =>
  unique(
    matchAll(/([A-Z][a-z]+) ("[A-Za-z]+" )?([A-Z][a-z]+)/g, text).map(func)
  );

const getFirstNames = getNames((m) => m[1]);
const getFamilyNames = getNames((m) => m[3]);
const getFullNames = getNames((m) => `${m[1]} ${m[3]}`);

import {Test, it} from './test.js';
const text =
  'Jon Stark se promenait avec Arya Stark et Claude "Evil" Baratheon. En croisant Jean Targaryen et Christine Frey, ils s\'enquirent de l\'état de Bernard Martell, en convalescence chez Francis "Francis" Tyrell.\
                 Arya Stark et Christine Frey repartirent vers Port-Royal tandis que Jean Targaryen resta discuter avec Jon "Sait-Rien" Stark.';
it('get random FirstNames Test Case', function () {
  Test.assertDeepEquals(getFirstNames(text), [
    'Jon',
    'Arya',
    'Claude',
    'Jean',
    'Christine',
    'Bernard',
    'Francis',
  ]);
  Test.assertDeepEquals(getFamilyNames(text), [
    'Stark',
    'Baratheon',
    'Targaryen',
    'Frey',
    'Martell',
    'Tyrell',
  ]);
  Test.assertDeepEquals(getFullNames(text), [
    'Jon Stark',
    'Arya Stark',
    'Claude Baratheon',
    'Jean Targaryen',
    'Christine Frey',
    'Bernard Martell',
    'Francis Tyrell',
  ]);
});
