// Display units. The model is calibrated in °F and mph throughout — every band,
// anchor and curve in comfort.js is written in them — so the data stays in
// those units end to end and only the numbers a person reads are converted.
// Fetching in Celsius instead would mean re-deriving every constant, and one
// that got missed would quietly score a 20°C afternoon as bitterly cold.

export const UNITS = {
  us: {
    key: 'us',
    symbol: '°F',
    name: 'Fahrenheit',
    temp: (f) => Math.round(f),
    speed: (mph) => `${Math.round(mph)} mph`,
  },
  metric: {
    key: 'metric',
    symbol: '°C',
    name: 'Celsius',
    temp: (f) => Math.round(((f - 32) * 5) / 9),
    speed: (mph) => `${Math.round(mph * 1.609344)} km/h`,
  },
};

// The countries that still read the weather in Fahrenheit. Anyone else opening
// this for the first time should not have to find the switch to understand it.
const FAHRENHEIT_REGIONS = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW']);

export function defaultUnits(language = globalThis.navigator?.language) {
  try {
    const {region} = new Intl.Locale(language).maximize();
    return FAHRENHEIT_REGIONS.has(region) ? UNITS.us : UNITS.metric;
  } catch {
    return UNITS.us;
  }
}
