const twiceAge = (younger, older) =>
  new Date(2 * Date.parse(younger) - Date.parse(older));

console.log(twiceAge('Oct 19, 2005', 'June 30, 1988'));
