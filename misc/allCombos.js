const allCombos = ([first, ...rest]) =>
  first ? allCombos(rest).flatMap((c) => first.map((t) => [t, ...c])) : [[]];

console.log(
  allCombos([
    ['taco', 'chicken', 'burger'],
    ['cheezit', 'twix', 'dorito'],
    ['black+white', 'black+blue', 'black+white+red'],
    ['banana', 'apple'],
    ['stuff'],
  ])
);
