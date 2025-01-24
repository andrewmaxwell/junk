const convert = (m) => {
  const miles = m * 0.000621371;
  if (miles > 0.5) return `${miles.toLocaleString()} miles`;

  const feet = m * 3.28084;
  return `${feet.toLocaleString()} feet`;
};

const target = {name: 'a volleyball', m: 0.22};

const things = [
  {name: 'a proton', m: 1.5346983e-18},
  {name: 'a hydrogen atom', m: 5e-11},
  {name: 'a red blood cell', m: 0.0000075},
  {name: 'a grain of sand', m: 0.0005},
  {name: 'a ping pong ball', m: 0.04},
  {name: 'Missouri', m: 387_852},
  {name: 'the USA', m: 4_313_000},
];

for (let i = 0; i < things.length - 1; i++) {
  const thing1 = things[i].name;
  const thing2 = things[i + 1].name;
  const size = (things[i + 1].m * target.m) / things[i].m;

  console.log(
    `if ${thing1} was the size of ${target.name}, ${thing2} would be ${size} wide`
  );
}

/*


If a proton were the size of a volleyball, a hydrogen atom would be half the diameter of the earth (4,454 miles wide)

If an atom were the size of a volleyball:
- a red blood cell would be 20.5 miles wide
- a grain of sand would be 1300 miles wide

If the earth were the size of a volleyball:
- Jupiter would be nearly 8 feet wide
- the sun would be nearly 79 feet wide and 1.6 miles away
- the solar system would be 96.5 miles wide

If the sun were the size of a volleyball:
- The closest star would be 3,947 miles away
- the milky way would be 93,000,000 miles wide


*/

console.log();
