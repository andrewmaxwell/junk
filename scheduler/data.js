const tsv = ([str]) => str.split('\n').map(r => r.split('\t'));
const split = str =>
  str
    .trim()
    .toLowerCase()
    .split(/\s*,\s*/)
    .filter(i => i);

const people = tsv`Sarah L			2	
Melanie			2	
Rachel			2	
Andrea	Nursery, 2&3	teacher, SS	2	
Josh G	CC, 2&3	SS	2	Beth
Beth			2	
Josh C			2	Margeurite
Margeurite			2	
Stacy P	2&3		2	
Stacy M			2	
Linda C	2&3, Nursery		2	
Zoya	CC	teacher	2	
Emma	CC	teacher	2	
Jordan	Nursery	teacher	2	
Riley	CC	teacher	2	
Willo			2	
Michael T	CC		2	Liberty
Liberty			2	
Dave P	CC		2	Jenny
Jenny			2	
Karen S			2	
Tim	CC		2	Anne
Anne			2	
Josh R	CC		2	April
April			2	
Rose	Nursery, CC	teacher	2	`.map(([name, whitelist, blacklist, freq], index) => ({
  name,
  whitelist: split(whitelist),
  blacklist: split(blacklist),
  freq: Number(freq),
  index
}));

const slots = tsv`12/15/19	SS	Nursery
12/15/19	SS	Nursery
12/15/19	Service	Nursery
12/15/19	Service	Nursery
12/15/19	SS	2&3 Teacher
12/15/19	SS	2&3 Helper
12/15/19	Service	2&3 Teacher
12/15/19	Service	2&3 Helper
12/15/19	Service	CC-Older Teacher
12/15/19	Service	CC-Older Helper
12/15/19	Service	CC-Younger Teacher
12/15/19	Service	CC-Younger Helper
12/22/19	SS	Nursery
12/22/19	SS	Nursery
12/22/19	Service	Nursery
12/22/19	Service	Nursery
12/22/19	SS	2&3 Teacher
12/22/19	SS	2&3 Helper
12/22/19	Service	2&3 Teacher
12/22/19	Service	2&3 Helper
12/22/19	Service	CC-Older Teacher
12/22/19	Service	CC-Older Helper
12/22/19	Service	CC-Younger Teacher
12/22/19	Service	CC-Younger Helper
12/29/19	SS	Nursery
12/29/19	SS	Nursery
12/29/19	Service	Nursery
12/29/19	Service	Nursery
12/29/19	SS	2&3 Teacher
12/29/19	SS	2&3 Helper
12/29/19	Service	2&3 Teacher
12/29/19	Service	2&3 Helper
12/29/19	Service	CC-Older Teacher
12/29/19	Service	CC-Older Helper
12/29/19	Service	CC-Younger Teacher
12/29/19	Service	CC-Younger Helper
1/5/20	SS	Nursery
1/5/20	SS	Nursery
1/5/20	Service	Nursery
1/5/20	Service	Nursery
1/5/20	SS	2&3 Teacher
1/5/20	SS	2&3 Helper
1/5/20	Service	2&3 Teacher
1/5/20	Service	2&3 Helper
1/5/20	Service	CC-Older Teacher
1/5/20	Service	CC-Older Helper
1/5/20	Service	CC-Younger Teacher
1/5/20	Service	CC-Younger Helper
1/12/20	SS	Nursery
1/12/20	SS	Nursery
1/12/20	Service	Nursery
1/12/20	Service	Nursery
1/12/20	SS	2&3 Teacher
1/12/20	SS	2&3 Helper
1/12/20	Service	2&3 Teacher
1/12/20	Service	2&3 Helper
1/12/20	Service	CC-Older Teacher
1/12/20	Service	CC-Older Helper
1/12/20	Service	CC-Younger Teacher
1/12/20	Service	CC-Younger Helper
1/19/20	SS	Nursery
1/19/20	SS	Nursery
1/19/20	Service	Nursery
1/19/20	Service	Nursery
1/19/20	SS	2&3 Teacher
1/19/20	SS	2&3 Helper
1/19/20	Service	2&3 Teacher
1/19/20	Service	2&3 Helper
1/19/20	Service	CC-Older Teacher
1/19/20	Service	CC-Older Helper
1/19/20	Service	CC-Younger Teacher
1/19/20	Service	CC-Younger Helper`
  .map(([date, time, role]) => {
    const key = [date, time, role].join(' ').toLowerCase();
    return {
      date,
      time,
      role,
      debug: [],
      week: Math.round(Date.parse(date) / 24 / 3600000 / 7),
      people: people.filter(
        ({whitelist, blacklist}) =>
          (!whitelist.length || whitelist.some(r => key.includes(r))) &&
          blacklist.every(t => !key.includes(t))
      )
    };
  })
  .sort((a, b) => a.week - b.week);

export const getData = async () => ({slots, people});

// console.log('people', people);
console.log('slots', slots);
