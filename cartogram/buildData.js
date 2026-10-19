// Downloads the metric data and writes data/world.json and data/counties.json.
// Run with `node cartogram/buildData.js`. Geometry isn't saved here; the page
// loads it from world-atlas and us-atlas on jsdelivr.
import Papa from 'papaparse';
import {writeFileSync} from 'fs';

const dir = new URL('./data/', import.meta.url);

const getText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
};
const parse = (text) =>
  Papa.parse(text, {header: true, skipEmptyLines: true}).data;

const worldMetrics = [
  {
    key: 'medianIncome',
    name: 'Median income',
    unit: '$/day',
    slug: 'daily-median-income',
  },
  {
    key: 'gdpPerCapita',
    name: 'GDP per capita',
    unit: '$ PPP',
    slug: 'gdp-per-capita-worldbank',
  },
  {
    key: 'happiness',
    name: 'Happiness (life ladder 0-10)',
    unit: '',
    slug: 'happiness-cantril-ladder',
  },
  {
    key: 'childMortality',
    name: 'Child mortality',
    unit: '% before age 5',
    slug: 'child-mortality',
  },
  {
    key: 'lifeExpectancy',
    name: 'Life expectancy',
    unit: 'years',
    slug: 'life-expectancy',
  },
  {
    key: 'hdi',
    name: 'Human Development Index',
    unit: '',
    slug: 'human-development-index',
  },
  {
    key: 'extremePoverty',
    name: 'Extreme poverty',
    unit: '% under $3/day',
    slug: 'share-of-population-in-extreme-poverty',
  },
  {
    key: 'co2PerCapita',
    name: 'CO₂ per capita',
    unit: 't/yr',
    slug: 'co-emissions-per-capita',
  },
  {key: 'population', name: 'Population', unit: 'people', slug: 'population'},
];

const buildWorld = async () => {
  const [countries, atlas] = await Promise.all([
    getText(
      'https://cdn.jsdelivr.net/npm/world-countries@5/countries.json',
    ).then(JSON.parse),
    getText(
      'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json',
    ).then(JSON.parse),
  ]);
  // world-atlas ids are ISO numeric codes; a few disputed areas have no id and
  // are matched by name instead.
  const geoms = atlas.objects.countries.geometries;
  const featureIds = new Set(geoms.map((g) => g.id ?? g.properties.name));
  const iso3ToId = {OWID_KOS: 'Kosovo'};
  for (const c of countries)
    if (c.ccn3 && featureIds.has(c.ccn3)) iso3ToId[c.cca3] = c.ccn3;

  const values = {};
  const years = {};
  for (const [mi, m] of worldMetrics.entries()) {
    const rows = parse(
      await getText(
        `https://ourworldindata.org/grapher/${m.slug}.csv?v=1&csvType=full&useColumnShortNames=true`,
      ),
    );
    const col = Object.keys(rows[0])[3];
    const latest = {};
    for (const r of rows) {
      const id = iso3ToId[r.code];
      const v = parseFloat(r[col]);
      const year = +r.year;
      if (!id || !isFinite(v) || year > 2026 || year < 2000) continue;
      if (!latest[id] || latest[id].year < year) latest[id] = {year, v};
    }
    for (const [id, {year, v}] of Object.entries(latest)) {
      (values[id] ??= Array(worldMetrics.length).fill(null))[mi] =
        +v.toPrecision(4);
      (years[mi] ??= []).push(year);
    }
    console.log(m.key, Object.keys(latest).length, 'countries');
  }
  const metrics = worldMetrics.map(({key, name, unit, slug}, i) => ({
    key,
    name,
    unit,
    source: `Our World in Data (${Math.min(...years[i])}–${Math.max(...years[i])}), ourworldindata.org/grapher/${slug}`,
  }));
  writeFileSync(new URL('world.json', dir), JSON.stringify({metrics, values}));
};

const countyMetrics = [
  {
    key: 'medianIncome',
    name: 'Median household income',
    unit: '$',
    col: 'v063_rawvalue',
  },
  {
    key: 'lifeExpectancy',
    name: 'Life expectancy',
    unit: 'years',
    col: 'v147_rawvalue',
  },
  {
    key: 'childMortality',
    name: 'Child mortality',
    unit: 'deaths per 100k under 18',
    col: 'v128_rawvalue',
  },
  {
    key: 'childPoverty',
    name: 'Children in poverty',
    unit: '%',
    col: 'v024_rawvalue',
    pct: true,
  },
  {
    key: 'unemployment',
    name: 'Unemployment',
    unit: '%',
    col: 'v023_rawvalue',
    pct: true,
  },
  {
    key: 'someCollege',
    name: 'Some college',
    unit: '% of adults 25-44',
    col: 'v069_rawvalue',
    pct: true,
  },
  {
    key: 'obesity',
    name: 'Adult obesity',
    unit: '%',
    col: 'v011_rawvalue',
    pct: true,
  },
  {
    key: 'smoking',
    name: 'Adult smoking',
    unit: '%',
    col: 'v009_rawvalue',
    pct: true,
  },
  {
    key: 'uninsured',
    name: 'Uninsured',
    unit: '%',
    col: 'v085_rawvalue',
    pct: true,
  },
  {
    key: 'overdose',
    name: 'Drug overdose deaths',
    unit: 'per 100k',
    col: 'v138_rawvalue',
  },
  {
    key: 'firearm',
    name: 'Firearm fatalities',
    unit: 'per 100k',
    col: 'v148_rawvalue',
  },
  {
    key: 'voterTurnout',
    name: 'Voter turnout',
    unit: '%',
    col: 'v177_rawvalue',
    pct: true,
  },
  {
    key: 'over65',
    name: 'Age 65 and older',
    unit: '%',
    col: 'v053_rawvalue',
    pct: true,
  },
  {key: 'rural', name: 'Rural', unit: '%', col: 'v058_rawvalue', pct: true},
  {key: 'population', name: 'Population', unit: 'people', col: 'v051_rawvalue'},
];

const buildCounties = async () => {
  const text = await getText(
    'https://www.countyhealthrankings.org/sites/default/files/media/document/analytic_data2025.csv',
  );
  // The first row is human-readable headers; the second has the short codes.
  const rows = parse(text.slice(text.indexOf('\n') + 1));
  const values = {};
  for (const r of rows) {
    if (r.countycode === '000') continue;
    values[r.fipscode] = countyMetrics.map(({col, pct}) => {
      const v = parseFloat(r[col]);
      return isFinite(v) ? +(pct ? v * 100 : v).toPrecision(4) : null;
    });
  }
  for (const m of countyMetrics) {
    if (!(m.col in rows[0])) throw new Error(`missing column ${m.col}`);
  }
  const metrics = countyMetrics.map(({key, name, unit}) => ({
    key,
    name,
    unit,
    source: 'County Health Rankings & Roadmaps 2025, countyhealthrankings.org',
  }));
  writeFileSync(
    new URL('counties.json', dir),
    JSON.stringify({metrics, values}),
  );
  console.log('counties', Object.keys(values).length);
};

await buildWorld();
await buildCounties();
