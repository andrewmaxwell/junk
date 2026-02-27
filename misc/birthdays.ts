const data = `
Wesley	2013/10/07
Aisley	2014/05/21
Jojo	2013/07/06
Sam	2011/10/10
Calvin	2011/12/23
Aniyah	2012/05/16
Selena	2010/09/29
Bella	2011/05/12
Noelle	2011/06/20
Kailonna	2011/08/01
Nick	2009/03/27
Victoria	2010/02/28
Brady	2010/03/20
Levi	2008/11/28
Aidan	2009/06/17
Anneliese	2009/11/18
Polina	2006/04/05
Claire	2007/09/08
Hannah	2007/10/13
Ransom	2007/12/10
Loralee	2007/12/22
Jadon	2008/04/26
Krys	1983/12/30
Josh G	1987/12/21
Andrew	1988-06-30
Manny	1989/10/20
Sydney	1994/09/07
Selia	1994/11/30
Rose	2003/02/17`
  .trim()
  .split('\n')
  .map((r) => {
    const [name, date] = r.split('\t');
    return {name, date: Date.parse(date)};
  })
  .sort((a, b) => a.date - b.date);

const start = Date.parse('2026/01/01');
const end = Date.parse('2027/01/01');
const entries = [];

for (let i = 0; i < data.length - 1; i++) {
  for (let j = i + 1; j < data.length; j++) {
    for (let times = 2; times < 6; times++) {
      const date = (times * data[j].date - data[i].date) / (times - 1);
      if (date > start && date < end) {
        entries.push({a: data[i].name, b: data[j].name, times, date});
      }
    }
  }
}

entries
  .sort((a, b) => a.date - b.date)
  .forEach(({a, b, date, times}) =>
    console.log(
      `${a} ${date < Date.now() ? 'was' : 'will be'} ${times}x as old as ${b} on ${new Date(date).toDateString()}`,
    ),
  );

// for (let i = 0; i < data.length - 1; i++) {
//   const days = (data[i + 1].date - data[i].date) / (24 * 3600 * 1000);
//   console.log(
//     data[i].name,
//     'is',
//     Math.round(days),
//     'days older than',
//     data[i + 1].name,
//     '\n.'.repeat(days / 90),
//   );
// }
