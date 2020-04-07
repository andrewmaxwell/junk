/* eslint-disable sonarjs/no-duplicate-string */
const randEl = arr => arr[Math.floor(Math.random() * arr.length)];
const geographies = [
  {region: 'North America', country: 'Canada'},
  {region: 'North America', country: 'US'},
  {region: 'Latin America', country: 'Mexico'},
  {region: 'Latin America', country: 'Panama'},
  {region: 'Latin America', country: 'Ecuador'},
  {region: 'Latin America', country: 'Brazil'},
  {region: 'Latin America', country: 'Chile'},
  {region: 'Asia / Pacific', country: 'China'},
  {region: 'Asia / Pacific', country: 'Philippines'},
  {region: 'Asia / Pacific', country: 'India'},
  {region: 'Europe / Middle East', country: 'Belgium'},
  {region: 'Europe / Middle East', country: 'Spain'},
  {region: 'Europe / Middle East', country: 'France'},
  {region: 'Europe / Middle East', country: 'Germany'}
];
const bisunits = ['Corn', 'Soy', 'Cotton', 'Crop Protection'];

window.GetData = async () =>
  [...new Array(1000)].map((v, i) => ({
    pname: Math.random()
      .toString(16)
      .slice(2),
    id: 'thing' + i,
    year: randEl(['2019', '2020', '2021']),
    scopes: [...new Array(1 + Math.floor(Math.random() * 4))].map(() => ({
      ...randEl(geographies),
      bisunit: randEl(bisunits),
      product: 'Product ' + randEl(['A', 'B', 'C', 'D']),
      brand: 'Brand ' + randEl(['A', 'B', 'C', 'D'])
    }))
  }));
