const getFilteredData = (data, searchValue) => {
  searchValue = searchValue.toUpperCase();
  return data.filter(
    (row) =>
      !searchValue ||
      Object.values(row).join('|').toUpperCase().includes(searchValue)
  );
};

const getTableHeaders = (columns, sortCol, sortDir) =>
  columns
    .map(({key, label, width}) => {
      const arrow = key === sortCol ? (sortDir > 0 ? '▽' : '△') : '';
      return `<th id="${key}" style="width: ${width}%">${label} ${arrow}</th>`;
    })
    .join('');

const getTableRows = (data, columns, sortCol, sortDir) =>
  data
    .sort((a, b) => {
      // empty fields come last regardless of sort
      if (a[sortCol] === '') return 1;
      if (b[sortCol] === '') return -1;
      if (a[sortCol] == b[sortCol]) return 0;
      return sortDir * (a[sortCol] < b[sortCol] ? -1 : 1);
    })
    .map((row) => {
      const cols = columns
        .map(({key}) => `<td>${row[key].join?.(', ') ?? row[key]}</td>`)
        .join('');
      return `<tr>${cols}</tr>`;
    })
    .join('');

const groupBy = (func, arr) => {
  const res = {};
  for (const t of arr) {
    const key = func(t);
    (res[key] = res[key] || []).push(t);
  }
  return res;
};

const scale = 0.5;

const makeBar = (members, titleLabel, color) => {
  const len = members.length * scale;
  const names = members.map((p) => p.name).join('\n');
  return `<span class="bar" style="width: ${len}%; background: ${color}" title="${titleLabel}:\n${names}"></span>`;
};

const getHistogram = ({data, countFunc, singular, plural}) =>
  Object.entries(groupBy(countFunc, data))
    .map(([count, people]) => {
      const memberBar = makeBar(
        people.filter((p) => p.memberSince),
        'Members',
        '#AAF'
      );
      const nonMemberBar = makeBar(
        people.filter((p) => !p.memberSince),
        'Non-members',
        '#CCC'
      );
      const percentage = Math.round((people.length / data.length) * 1000) / 10;
      const msgLabel = count == 1 ? singular : plural;
      return `${memberBar}${nonMemberBar} ${percentage}% of people are involved in ${count} ${msgLabel}`;
    })
    .join('<br/>');

export const renderTable = ({
  data,
  columns,
  searchValue = '',
  sortCol,
  sortDir,
}) => {
  const filtered = getFilteredData(data, searchValue);

  const ministryHistogram = getHistogram({
    data: filtered,
    countFunc: (p) =>
      p.ministries.length >= 5 ? '5 or more' : p.ministries.length,
    singular: 'ministry',
    plural: 'ministries',
  });

  const smallGroupHistogram = getHistogram({
    data: filtered,
    countFunc: (p) =>
      p.smallGroups.length >= 1 ? '1 or more' : p.smallGroups.length,
    singular: 'small group',
    plural: 'small groups',
  });

  return `
    <h3>Ministry Involvement Breakdown</h3>
    ${ministryHistogram}

    <h3>Small Group Involvement Breakdown</h3>
    ${smallGroupHistogram}

    <table>
      <thead><tr>${getTableHeaders(columns, sortCol, sortDir)}</tr></thead>
      <tbody>${getTableRows(filtered, columns, sortCol, sortDir)}</tbody>
    </table>`;
};
