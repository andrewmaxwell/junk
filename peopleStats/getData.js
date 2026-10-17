const url =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTass7p8cGivjWrAA9TRot_qISNUzyilgcnbFA4tmhP4b1lgk6JKlzL3R3FPLpBksY1ebswFMtQALmF/pub?output=csv';

const processData = (str, hidden, getDiff) => {
  const data = window.Papa.parse(str, {
    header: true,
  })
    .data.map((row) => ({
      name: row['Your Name'].trim(),
      answers: Object.fromEntries(
        Object.entries(row)
          .map(([key, val]) => [key, +val])
          .filter(([, val]) => !isNaN(val)),
      ),
    }))
    .filter(({name}) => !hidden.includes(name));

  for (const row of data) {
    row.scores = {};
    row.totalDiff = 0;
    for (const r of data) {
      row.totalDiff += row.scores[r.name] = getDiff(
        Object.values(row.answers),
        Object.values(r.answers),
      );
    }
  }
  return data.sort((a, b) => a.totalDiff - b.totalDiff);
};

export const getData = async (hidden, getDiff) =>
  processData(await (await fetch(url)).text(), hidden, getDiff);
