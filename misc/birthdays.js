const data = `Matt		1973/07/08
Krys	1	1983/12/30
Josh G		1987/12/21
Andrew		1988/06/30
Megan	1	1988/09/13
Manny	1	1989/10/20
Jenna	1	1990/01/25
Caleb	1	2005/02/09
Mirielle		2005/03/20
Abraham	1	2005/10/19
Ayden	1	2005/11/14
Peter		2006/02/17
Polina		2006/04/05
Jaisaac	1	2007/01/23
Illia		2007/05/20
Casey		2007/06/13
Sarah	1	2007/07/11
Daniel T	1	2007/08/06
Claire	1	2007/09/08
Hannah		2007/10/13
Loralee		2007/12/22
Jadon		2008/04/26
Jeremiah	1	2008/06/22
Levi		2008/11/28
Kaden		2008/12/13
Anneliese		2009/11/18
Morgan		2010/02/03
Victoria	1	2010/02/28
Brady		2010/03/20
Makayla 	1	2010/10/15
Hope		2011/01/20
Bella		2011/05/12`
  .split('\n')
  .map((r) => {
    const [name, , date] = r.split('\t');
    return {name, date: Date.parse(date)};
  })
  .sort((a, b) => a.date - b.date);

const result = [];
for (let i = 0; i < data.length - 1; i++) {
  for (let j = i + 1; j < data.length; j++) {
    result.push({
      a: data[i].name,
      b: data[j].name,
      date: new Date(2 * data[j].date - data[i].date),
    });
  }
}

console.log(
  result
    .sort((a, b) => a.date - b.date)
    // .filter(({a, b}) => (a + b).includes('Andrew'))
    .map(
      ({a, b, date}) =>
        `${a} ${
          date < Date.now() ? 'was' : 'will be'
        } twice as old as ${b} on ${date.toDateString()}`
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
    // '\n.'.repeat(days / 30.5)
  );
}
console.log('Bella is the youngest.');
