const data = `
Krys		1983/12/30
Josh G		1987/12/21
Andrew		1988-06-30
Manny	1	1989/10/20
Jenna		1990/01/25
Abraham	1	2005/10/19
Ayden	1	2005/11/14
Peter		2006/02/17
Polina		2006/04/05
Illia		2007/05/20
Casey		2007/06/13
Sarah		2007/07/11
Daniel T	1	2007/08/06
Claire	1	2007/09/08
Hannah		2007/10/13
Loralee		2007/12/22
Jadon		2008/04/26
Eliza		2008/09/24
Levi		2008/11/28
Kaden	1	2008/12/13
Nick		2009/03/27
Anneliese		2009/11/18
Morgan		2010/02/03
Victoria	1	2010/02/28
Brady		2010/03/20
Susan		2010/05/26
Noelle		2011/06/20
Calvin		2011/12/23`
  .trim()
  .split('\n')
  .map((r) => {
    const [name, , date] = r.split('\t');
    return {name, date: Date.parse(date)};
  })
  .sort((a, b) => a.twice - b.twice);

const result = [];
for (let i = 0; i < data.length - 1; i++) {
  for (let j = i + 1; j < data.length; j++) {
    result.push({
      a: data[i].name,
      b: data[j].name,
      twice: new Date(2 * data[j].date - data[i].date),
    });
  }
}

console.log(
  result
    .sort((a, b) => a.twice - b.twice)
    // .filter(({a, b}) => (a + b).includes('Andrew'))
    .map(
      ({a, b, twice}) =>
        `${a} ${
          twice < Date.now() ? 'was' : 'will be'
        } twice as old as ${b} on ${twice.toDateString()}`
    )
    .join('\n')
);

for (let i = 0; i < data.length - 1; i++) {
  const days = (data[i + 1].date - data[i].date) / (24 * 3600 * 1000);
  console.log(
    data[i].name,
    'is',
    Math.round(days),
    'days older than',
    data[i + 1].name
  );
}
