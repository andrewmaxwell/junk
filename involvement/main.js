import {getData} from './getData.js';
import {renderTable} from './renderTable.js';

const tableState = {
  data: await getData(),
  columns: [
    {key: 'name', label: 'Name', width: 20},
    {key: 'memberSince', label: 'Member Since', width: 20},
    {key: 'ministries', label: 'Ministries', width: 40},
    {key: 'smallGroups', label: 'Small Groups', width: 20},
  ],
  sortCol: 'name',
  sortDir: 1,
};

const render = () => {
  window.people.innerHTML = renderTable(tableState);
};

window.search.addEventListener('input', (e) => {
  tableState.searchValue = e.target.value;
  render();
});

document.body.addEventListener('click', (e) => {
  if (e.target?.tagName !== 'TH') return;
  const id = e.target.id;
  tableState.sortDir = id === tableState.sortCol ? -tableState.sortDir : 1;
  tableState.sortCol = id;
  render();
});

render();
