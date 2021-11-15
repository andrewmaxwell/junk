import {parseConversions} from './parseConversions.js';
import {solve} from './solve.js';

const defaultConversions = `pl,planck_length = 1.616255e-35 m
pm,picometer = 1e-12 m
nm,nanometer = 1e-9 m
um,micrometer = 1e-6 m
mm,millimeter = 1e-3 m
cm,centimeter = 1e-2 m
m,meter = 1 m
km,kilometer = 1e3 m
in,inch = 2.54 cm
ft,foot,feet = 12 inches
yd,yard = 3 feet
mi,mile = 5280 feet
au,astronomical_unit = 1.496e11 m
ly,lightyear = 9.461e15 m
ac,acre = 43,560 ft2
L,liter = 0.001 m3
ul = 1e-6 L
mL = 1e-3 L
tsp,teaspoon = 4.92892 ml
tbsp,tablespoon = 3 teaspoons
floz = 2 tablespoons
cup = 8 floz
pint = 2 cups
quart,qt,q = 2 pints
gal,gallon = 4 quarts
ps,picosecond = 1e-12 s
ns,nanosecond = 1e-9 s
us,microsecond = 1e-6 s
ms,millisecond = 1e-3 s
s,second = 1 s
min,minute = 60 s
h,hr,hour = 60 minutes
d,day = 24 hours
w,week = 7 days
y,year = 365 days
cent,century = 100 years
millenium,millenia = 1000 years
kg,kilogram = 1 kg
g,gram = 0.001 kg
mg,milligram = 1e-6 kg
ug,microgram = 1e-9 kg
lb,pound = 0.453592 kg
tn,ton = 907.1847 kg
gold = 19300 kg/m3
water = 1 kg/L
beard = 5 nm/s
mph = miles per hour
N,newton = 1 kg m/s2
J,joule = 1 Newton meter
W,watt = 1 joule per second
A,amp = 1 coulomb per second`;

const examples = [
  ['1 ft', '0.305 m'],
  ['10 ft + 1 cm', '3.058 m'],
  ['1 acre * 2 feet to cubic meters', '2,466.964'],
  ['12 inches to ft', '1'],
  ['1.5e6 ft/hr', '127 m/s'],
  ['1 km2 * 10', '10,000,000 m2'],
  ['30 mi/gal to km/L', '12.754'],
  ['50 ft/s to km/hr', '54.864'],
  ['1 acre * 1 foot to gallons', '325,851.534'],
  ['1 m3 / day to tsp/s', '2.348'],
  ['5 + 3', '8'],
  ['(13 ft)^3 to liters', '62,212.112'],
  ['((9 - 7)^10 / 16 + 7) * 3', '213'],
  ['feet/second to miles/hour', '0.682'],
  ['1,000,000 * (0.5 mm/day) to mi/day', '0.311'],
  ['64 m2 ^ 0.5', '8 m'],
  ['453.6 g/week * 70 days to lbs', '10'],
  ['3 square inches per second for 1 year to acres', '15.083'],
  ['1e25 ac * 1e17 mi to ly3', '7.691'],
  ['1 ton / gold to L', '47.004'],
  ['1 square lightyear * 1 planck_length to cups', '6.115'],
  ['30,000 * 1 beard year to miles', '2.939'],
  ['1 cubic yard to cubic feet', '27'],
  ['1 / (60 miles per hour)', '0.037 s/m'],
];

const inputField = document.querySelector('#input');
const outputField = document.querySelector('#output');
const conversionField = document.querySelector('#conversions');

const runTests = () => {
  const conversions = parseConversions(defaultConversions);
  for (const [inputStr, expected] of examples) {
    const {solution} = solve(inputStr, conversions);
    if (solution === expected) {
      console.log('PASS');
    } else {
      console.error(
        `For "${inputStr}" expected "${expected}" but got "${solution}"`
      );
    }
  }
};

const outputSolution = () => {
  try {
    const conversions = parseConversions(conversionField.value);
    const s = solve(inputField.value, conversions);
    console.log(s);
    outputField.innerHTML = '= ' + s.solution;
  } catch (e) {
    outputField.innerHTML = `<span style="color:red">${e.message}</span>`;
  }
};

const init = () => {
  runTests();

  document.querySelector('#examples').innerHTML =
    'Examples: ' +
    examples
      .map(
        ([inputStr]) =>
          `<a href="javascript:void 0" data-value="${inputStr}">${inputStr}</a>`
      )
      .join('');

  document.addEventListener('click', (e) => {
    if (!e.target.dataset.value) return;
    inputField.value = e.target.dataset.value;
    outputSolution();
  });

  inputField.addEventListener('input', () => {
    localStorage.unitInput = inputField.value;
    outputSolution();
  });

  conversionField.addEventListener('input', outputSolution);

  if (localStorage.unitInput) inputField.value = localStorage.unitInput;

  conversionField.value = defaultConversions;
  outputSolution();
};

init();
