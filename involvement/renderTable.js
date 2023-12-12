export const renderTable = ({
  data,
  columns,
  searchValue = '',
  sortCol,
  sortDir,
}) => {
  const cols = columns
    .map(({key, label, width}) => {
      const arrow = key === sortCol ? (sortDir > 0 ? '▽' : '△') : '';
      return `<th id="${key}" style="width: ${width}%">${label} ${arrow}</th>`;
    })
    .join('');

  searchValue = searchValue.toUpperCase();
  const rows = data
    .filter(
      (row) =>
        !searchValue ||
        Object.values(row).join('|').toUpperCase().includes(searchValue)
    )
    .sort((a, b) => {
      // empty fields come last regardless of sort
      if (!a[sortCol]) return 1;
      if (!b[sortCol]) return -1;
      return sortDir * a[sortCol].localeCompare(b[sortCol]);
    })
    .map((row) => {
      const cols = Object.values(row)
        .map((v) => `<td>${v}</td>`)
        .join('');
      return `<tr>${cols}</tr>`;
    })
    .join('');

  return `
    <table>
      <thead><tr>${cols}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
};
