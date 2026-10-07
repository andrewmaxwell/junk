// ---------------------------------------------------------------------------
// The thermal environment.
//
// Everything about heat and cold funnels through one number: UTCI, the
// Universal Thermal Climate Index. UTCI is the equivalent air temperature of a
// reference environment that would put the same strain on you as the real one,
// and it is derived from a full physiological model of a person *walking at
// 4 km/h* — which is exactly the question this app asks. Air temperature,
// humidity, wind and radiation all enter it together, and the model handles
// their interactions itself: wind cools you more when you are sweating, dry
// heat is survivable where the same muggy heat is not.
//
// That replaces the previous approach of taking Open-Meteo's
// `apparent_temperature` and bolting corrections onto it. Apparent temperature
// is calibrated for a person standing still, and once you start adding a
// mugginess term on top of it and a wind penalty beside it, humidity and wind
// are influencing the score two or three times over with no principled account
// of how much each pass should count.
//
// UTCI needs mean radiant temperature, not UV, as its radiation input, so the
// second half of this file estimates Tmrt from Open-Meteo's radiation fluxes.
// The difference is the whole gap between standing in full sun and standing in
// shade at the same air temperature, which is worth 15-25°F of felt heat and
// which UV index does not measure at all — UV is a sunburn signal, and it still
// earns a penalty of its own in `comfort.js`, just not this one.
//
// Units in are the app's: °F, mph, W/m². Units out are °F.
// ---------------------------------------------------------------------------

const toC = (f) => (f - 32) / 1.8;
const toF = (c) => c * 1.8 + 32;
const MPH_TO_MS = 0.44704;
const KELVIN = 273.15;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// --- Humidity ---------------------------------------------------------------

// Saturation vapour pressure over water in hPa (Hardy 1998), the same
// formulation the published UTCI reference code uses. Fed the dew point rather
// than the air temperature it returns the actual vapour pressure, which is what
// UTCI wants and what dew point is a direct statement of — so no relative
// humidity is needed anywhere.
const SVP_COEFFS = [
  -2.8365744e3, -6.028076559e3, 1.954263612e1, -2.737830188e-2, 1.6261698e-5,
  7.0229056e-10, -1.8680009e-13,
];
const SVP_LOG_COEFF = 2.7150305;

export function vapourPressure(tempC) {
  const tk = tempC + KELVIN;
  let logPressure = SVP_LOG_COEFF * Math.log(tk);
  for (let i = 0; i < SVP_COEFFS.length; i++)
    logPressure += SVP_COEFFS[i] * tk ** (i - 2);
  return Math.exp(logPressure) * 0.01;
}

// --- Mean radiant temperature ----------------------------------------------

const STEFAN_BOLTZMANN = 5.670374419e-8;
const HUMAN_EMISSIVITY = 0.97; // longwave, clothed body
const HUMAN_ABSORPTION = 0.7; // shortwave, clothed body
const GROUND_EMISSIVITY = 0.95;
const GROUND_ALBEDO = 0.2; // grass and asphalt both sit near this
// A standing person sees the sky through half their surface and the ground
// through the other half.
const HEMISPHERE_FACTOR = 0.5;

// Fanger's projected area factor: how much of a standing body the sun's beam
// actually lands on, which is most at a low sun and least at noon. `altitude`
// is the solar elevation in degrees.
function projectedAreaFactor(altitude) {
  const angle = altitude * (0.998 - (altitude * altitude) / 50000);
  return 0.308 * Math.cos((angle * Math.PI) / 180);
}

// Direct radiation is the beam measured on a horizontal surface and DNI is the
// same beam measured face-on, so their ratio is the sine of the solar
// elevation. That saves importing a solar position library for the one number
// the projected area factor needs.
function solarAltitude(horizontal, normal) {
  if (!(normal > 0)) return 0;
  return (Math.asin(clamp(horizontal / normal, 0, 1)) * 180) / Math.PI;
}

// How much sky a person under a tree or an awning can still see. The rest of
// their upward hemisphere is a surface at roughly air temperature, which is
// both why shade is cooler by day and why it is *warmer* than open sky at
// night — a canopy radiates back what a clear sky would have taken.
const SHADE_SKY_VIEW = 0.6;

// The radiant temperature of a uniform imaginary enclosure that would load you
// the same way the real sky, sun and ground do (Thorsson et al. 2007, in the
// form Di Napoli et al. 2020 used to derive Tmrt from reanalysis fluxes).
//
// `shaded` is the difference between the two questions this app asks. Open-site
// is the pessimistic answer for a walk: it assumes nothing stands between you
// and the sun, and no forecast variable knows whether your street has trees, so
// a sunny-hour walk score is the bad end of a range you can walk yourself out
// of by choosing the shady side. Shaded is the honest answer for sitting under
// something, where the beam is gone entirely.
//
// With the radiation fields missing this degrades to a shade estimate near air
// temperature rather than failing, which is the right answer for an archive
// row that carries no fluxes.
export function meanRadiantTemperature(conditions, {shaded = false} = {}) {
  const airC = toC(conditions.temperature_2m);
  const airK = airC + KELVIN;
  const dewC = Math.min(
    toC(conditions.dew_point_2m ?? conditions.temperature_2m),
    airC,
  );

  // Brutsaert's clear-sky emissivity, lifted towards a black body as cloud
  // fills the sky in. This is why an overcast night is warmer than a clear one
  // at the same air temperature.
  const clearSky = 1.24 * (vapourPressure(dewC) / airK) ** (1 / 7);
  const cloud = clamp((conditions.cloud_cover ?? 50) / 100, 0, 1);
  const skyEmissivity = clamp(clearSky + (1 - clearSky) * cloud, 0, 1);
  const openSky = skyEmissivity * STEFAN_BOLTZMANN * airK ** 4;
  const canopy = STEFAN_BOLTZMANN * airK ** 4; // a leaf is near air temperature
  const skyView = shaded ? SHADE_SKY_VIEW : 1;
  const longwaveDown = skyView * openSky + (1 - skyView) * canopy;

  // Sunlit ground radiates well above air temperature, which is most of why a
  // hot afternoon keeps feeling hot in the first minutes after sunset. Ground
  // in shade never gets there, so it is taken at air temperature instead —
  // Open-Meteo's soil temperature is a sunlit-surface number.
  const groundC = shaded
    ? airC
    : toC(
        conditions.soil_temperature_0cm ??
          conditions.soil_temperature_0_to_7cm ??
          conditions.temperature_2m,
      );
  const longwaveUp =
    GROUND_EMISSIVITY * STEFAN_BOLTZMANN * (groundC + KELVIN) ** 4;

  const global = conditions.shortwave_radiation ?? 0;
  const diffuse = conditions.diffuse_radiation ?? 0;
  const beamNormal = shaded ? 0 : (conditions.direct_normal_irradiance ?? 0);
  const beamHorizontal =
    conditions.direct_radiation ?? Math.max(0, global - diffuse);
  const altitude = solarAltitude(beamHorizontal, beamNormal);

  const shortwave = skyView * (diffuse + GROUND_ALBEDO * global);

  const absorbed =
    HUMAN_EMISSIVITY * HEMISPHERE_FACTOR * (longwaveDown + longwaveUp) +
    HUMAN_ABSORPTION *
      (HEMISPHERE_FACTOR * shortwave +
        projectedAreaFactor(altitude) * beamNormal);

  return (absorbed / (HUMAN_EMISSIVITY * STEFAN_BOLTZMANN)) ** 0.25 - KELVIN;
}

// --- UTCI -------------------------------------------------------------------

// The operational UTCI is a lookup into a physiological simulation; what
// everyone actually ships is Bröde et al.'s 6th-order polynomial fit to it,
// accurate to a few tenths of a degree over the whole domain. These 210 terms
// are that polynomial, transcribed mechanically from the published reference
// implementation as [coefficient, and the powers of air temperature, wind,
// radiant excess and vapour pressure it multiplies].
const UTCI_TERMS = [
  [6.07562052e-1, 0, 0, 0, 0],
  [-2.27712343e-2, 1, 0, 0, 0],
  [8.06470249e-4, 2, 0, 0, 0],
  [-1.54271372e-4, 3, 0, 0, 0],
  [-3.24651735e-6, 4, 0, 0, 0],
  [7.32602852e-8, 5, 0, 0, 0],
  [1.35959073e-9, 6, 0, 0, 0],
  [-2.2583652, 0, 1, 0, 0],
  [8.80326035e-2, 1, 1, 0, 0],
  [2.16844454e-3, 2, 1, 0, 0],
  [-1.53347087e-5, 3, 1, 0, 0],
  [-5.72983704e-7, 4, 1, 0, 0],
  [-2.55090145e-9, 5, 1, 0, 0],
  [-7.51269505e-1, 0, 2, 0, 0],
  [-4.08350271e-3, 1, 2, 0, 0],
  [-5.21670675e-5, 2, 2, 0, 0],
  [1.94544667e-6, 3, 2, 0, 0],
  [1.14099531e-8, 4, 2, 0, 0],
  [1.58137256e-1, 0, 3, 0, 0],
  [-6.57263143e-5, 1, 3, 0, 0],
  [2.22697524e-7, 2, 3, 0, 0],
  [-4.16117031e-8, 3, 3, 0, 0],
  [-1.27762753e-2, 0, 4, 0, 0],
  [9.66891875e-6, 1, 4, 0, 0],
  [2.52785852e-9, 2, 4, 0, 0],
  [4.56306672e-4, 0, 5, 0, 0],
  [-1.74202546e-7, 1, 5, 0, 0],
  [-5.91491269e-6, 0, 6, 0, 0],
  [3.98374029e-1, 0, 0, 1, 0],
  [1.83945314e-4, 1, 0, 1, 0],
  [-1.7375451e-4, 2, 0, 1, 0],
  [-7.60781159e-7, 3, 0, 1, 0],
  [3.77830287e-8, 4, 0, 1, 0],
  [5.43079673e-10, 5, 0, 1, 0],
  [-2.00518269e-2, 0, 1, 1, 0],
  [8.92859837e-4, 1, 1, 1, 0],
  [3.45433048e-6, 2, 1, 1, 0],
  [-3.77925774e-7, 3, 1, 1, 0],
  [-1.69699377e-9, 4, 1, 1, 0],
  [1.69992415e-4, 0, 2, 1, 0],
  [-4.99204314e-5, 1, 2, 1, 0],
  [2.47417178e-7, 2, 2, 1, 0],
  [1.07596466e-8, 3, 2, 1, 0],
  [8.49242932e-5, 0, 3, 1, 0],
  [1.35191328e-6, 1, 3, 1, 0],
  [-6.21531254e-9, 2, 3, 1, 0],
  [-4.99410301e-6, 0, 4, 1, 0],
  [-1.89489258e-8, 1, 4, 1, 0],
  [8.15300114e-8, 0, 5, 1, 0],
  [7.5504309e-4, 0, 0, 2, 0],
  [-5.65095215e-5, 1, 0, 2, 0],
  [-4.52166564e-7, 2, 0, 2, 0],
  [2.46688878e-8, 3, 0, 2, 0],
  [2.42674348e-10, 4, 0, 2, 0],
  [1.5454725e-4, 0, 1, 2, 0],
  [5.2411097e-6, 1, 1, 2, 0],
  [-8.75874982e-8, 2, 1, 2, 0],
  [-1.50743064e-9, 3, 1, 2, 0],
  [-1.56236307e-5, 0, 2, 2, 0],
  [-1.33895614e-7, 1, 2, 2, 0],
  [2.49709824e-9, 2, 2, 2, 0],
  [6.51711721e-7, 0, 3, 2, 0],
  [1.94960053e-9, 1, 3, 2, 0],
  [-1.00361113e-8, 0, 4, 2, 0],
  [-1.21206673e-5, 0, 0, 3, 0],
  [-2.1820366e-7, 1, 0, 3, 0],
  [7.51269482e-9, 2, 0, 3, 0],
  [9.79063848e-11, 3, 0, 3, 0],
  [1.25006734e-6, 0, 1, 3, 0],
  [-1.81584736e-9, 1, 1, 3, 0],
  [-3.52197671e-10, 2, 1, 3, 0],
  [-3.3651463e-8, 0, 2, 3, 0],
  [1.35908359e-10, 1, 2, 3, 0],
  [4.1703262e-10, 0, 3, 3, 0],
  [-1.30369025e-9, 0, 0, 4, 0],
  [4.13908461e-10, 1, 0, 4, 0],
  [9.22652254e-12, 2, 0, 4, 0],
  [-5.08220384e-9, 0, 1, 4, 0],
  [-2.24730961e-11, 1, 1, 4, 0],
  [1.17139133e-10, 0, 2, 4, 0],
  [6.62154879e-10, 0, 0, 5, 0],
  [4.0386326e-13, 1, 0, 5, 0],
  [1.95087203e-12, 0, 1, 5, 0],
  [-4.73602469e-12, 0, 0, 6, 0],
  [5.12733497, 0, 0, 0, 1],
  [-3.12788561e-1, 1, 0, 0, 1],
  [-1.96701861e-2, 2, 0, 0, 1],
  [9.9969087e-4, 3, 0, 0, 1],
  [9.51738512e-6, 4, 0, 0, 1],
  [-4.66426341e-7, 5, 0, 0, 1],
  [5.48050612e-1, 0, 1, 0, 1],
  [-3.30552823e-3, 1, 1, 0, 1],
  [-1.6411944e-3, 2, 1, 0, 1],
  [-5.16670694e-6, 3, 1, 0, 1],
  [9.52692432e-7, 4, 1, 0, 1],
  [-4.29223622e-2, 0, 2, 0, 1],
  [5.00845667e-3, 1, 2, 0, 1],
  [1.00601257e-6, 2, 2, 0, 1],
  [-1.81748644e-6, 3, 2, 0, 1],
  [-1.25813502e-3, 0, 3, 0, 1],
  [-1.79330391e-4, 1, 3, 0, 1],
  [2.34994441e-6, 2, 3, 0, 1],
  [1.29735808e-4, 0, 4, 0, 1],
  [1.2906487e-6, 1, 4, 0, 1],
  [-2.28558686e-6, 0, 5, 0, 1],
  [-3.69476348e-2, 0, 0, 1, 1],
  [1.62325322e-3, 1, 0, 1, 1],
  [-3.1427968e-5, 2, 0, 1, 1],
  [2.59835559e-6, 3, 0, 1, 1],
  [-4.77136523e-8, 4, 0, 1, 1],
  [8.6420339e-3, 0, 1, 1, 1],
  [-6.87405181e-4, 1, 1, 1, 1],
  [-9.13863872e-6, 2, 1, 1, 1],
  [5.15916806e-7, 3, 1, 1, 1],
  [-3.59217476e-5, 0, 2, 1, 1],
  [3.28696511e-5, 1, 2, 1, 1],
  [-7.10542454e-7, 2, 2, 1, 1],
  [-1.243823e-5, 0, 3, 1, 1],
  [-7.385844e-9, 1, 3, 1, 1],
  [2.20609296e-7, 0, 4, 1, 1],
  [-7.3246918e-4, 0, 0, 2, 1],
  [-1.87381964e-5, 1, 0, 2, 1],
  [4.80925239e-6, 2, 0, 2, 1],
  [-8.7549204e-8, 3, 0, 2, 1],
  [2.7786293e-5, 0, 1, 2, 1],
  [-5.06004592e-6, 1, 1, 2, 1],
  [1.14325367e-7, 2, 1, 2, 1],
  [2.53016723e-6, 0, 2, 2, 1],
  [-1.72857035e-8, 1, 2, 2, 1],
  [-3.95079398e-8, 0, 3, 2, 1],
  [-3.59413173e-7, 0, 0, 3, 1],
  [7.04388046e-7, 1, 0, 3, 1],
  [-1.89309167e-8, 2, 0, 3, 1],
  [-4.79768731e-7, 0, 1, 3, 1],
  [7.96079978e-9, 1, 1, 3, 1],
  [1.62897058e-9, 0, 2, 3, 1],
  [3.94367674e-8, 0, 0, 4, 1],
  [-1.18566247e-9, 1, 0, 4, 1],
  [3.34678041e-10, 0, 1, 4, 1],
  [-1.15606447e-10, 0, 0, 5, 1],
  [-2.80626406, 0, 0, 0, 2],
  [5.48712484e-1, 1, 0, 0, 2],
  [-3.9942841e-3, 2, 0, 0, 2],
  [-9.54009191e-4, 3, 0, 0, 2],
  [1.93090978e-5, 4, 0, 0, 2],
  [-3.08806365e-1, 0, 1, 0, 2],
  [1.16952364e-2, 1, 1, 0, 2],
  [4.95271903e-4, 2, 1, 0, 2],
  [-1.90710882e-5, 3, 1, 0, 2],
  [2.10787756e-3, 0, 2, 0, 2],
  [-6.98445738e-4, 1, 2, 0, 2],
  [2.30109073e-5, 2, 2, 0, 2],
  [4.1785659e-4, 0, 3, 0, 2],
  [-1.27043871e-5, 1, 3, 0, 2],
  [-3.04620472e-6, 0, 4, 0, 2],
  [5.14507424e-2, 0, 0, 1, 2],
  [-4.32510997e-3, 1, 0, 1, 2],
  [8.99281156e-5, 2, 0, 1, 2],
  [-7.14663943e-7, 3, 0, 1, 2],
  [-2.66016305e-4, 0, 1, 1, 2],
  [2.63789586e-4, 1, 1, 1, 2],
  [-7.01199003e-6, 2, 1, 1, 2],
  [-1.06823306e-4, 0, 2, 1, 2],
  [3.61341136e-6, 1, 2, 1, 2],
  [2.29748967e-7, 0, 3, 1, 2],
  [3.04788893e-4, 0, 0, 2, 2],
  [-6.42070836e-5, 1, 0, 2, 2],
  [1.16257971e-6, 2, 0, 2, 2],
  [7.68023384e-6, 0, 1, 2, 2],
  [-5.47446896e-7, 1, 1, 2, 2],
  [-3.5993791e-8, 0, 2, 2, 2],
  [-4.36497725e-6, 0, 0, 3, 2],
  [1.68737969e-7, 1, 0, 3, 2],
  [2.67489271e-8, 0, 1, 3, 2],
  [3.23926897e-9, 0, 0, 4, 2],
  [-3.53874123e-2, 0, 0, 0, 3],
  [-2.2120119e-1, 1, 0, 0, 3],
  [1.55126038e-2, 2, 0, 0, 3],
  [-2.63917279e-4, 3, 0, 0, 3],
  [4.53433455e-2, 0, 1, 0, 3],
  [-4.32943862e-3, 1, 1, 0, 3],
  [1.45389826e-4, 2, 1, 0, 3],
  [2.1750861e-4, 0, 2, 0, 3],
  [-6.66724702e-5, 1, 2, 0, 3],
  [3.3321714e-5, 0, 3, 0, 3],
  [-2.26921615e-3, 0, 0, 1, 3],
  [3.80261982e-4, 1, 0, 1, 3],
  [-5.45314314e-9, 2, 0, 1, 3],
  [-7.96355448e-4, 0, 1, 1, 3],
  [2.53458034e-5, 1, 1, 1, 3],
  [-6.31223658e-6, 0, 2, 1, 3],
  [3.02122035e-4, 0, 0, 2, 3],
  [-4.77403547e-6, 1, 0, 2, 3],
  [1.73825715e-6, 0, 1, 2, 3],
  [-4.09087898e-7, 0, 0, 3, 3],
  [6.14155345e-1, 0, 0, 0, 4],
  [-6.16755931e-2, 1, 0, 0, 4],
  [1.33374846e-3, 2, 0, 0, 4],
  [3.55375387e-3, 0, 1, 0, 4],
  [-5.13027851e-4, 1, 1, 0, 4],
  [1.02449757e-4, 0, 2, 0, 4],
  [-1.48526421e-3, 0, 0, 1, 4],
  [-4.11469183e-5, 1, 0, 1, 4],
  [-6.80434415e-6, 0, 1, 1, 4],
  [-9.77675906e-6, 0, 0, 2, 4],
  [8.82773108e-2, 0, 0, 0, 5],
  [-3.01859306e-3, 1, 0, 0, 5],
  [1.04452989e-3, 0, 1, 0, 5],
  [2.47090539e-4, 0, 0, 1, 5],
  [1.48348065e-3, 0, 0, 0, 6],
];

// The polynomial is a fit, valid only over the range it was fitted on, so
// inputs are clamped rather than extrapolated. Wind in particular: UTCI is
// undefined below 0.5 m/s, and the polynomial does not merely lose accuracy
// there, it turns over and starts reporting *less* heat stress in still air.
const AIR_RANGE = [-50, 50]; // °C
const WIND_RANGE = [0.5, 17]; // m/s at 10 m, which is the height Open-Meteo reports
const RADIANT_RANGE = [-30, 70]; // °C above or below air temperature
const VAPOUR_RANGE = [0, 5]; // kPa

const powers = (x) => {
  const out = [1];
  for (let n = 1; n <= 6; n++) out[n] = out[n - 1] * x;
  return out;
};

export function utci({airC, windMs, tmrtC, vapourKPa}) {
  const air = clamp(airC, ...AIR_RANGE);
  const wind = clamp(windMs, ...WIND_RANGE);
  const radiant = clamp(tmrtC - air, ...RADIANT_RANGE);
  const vapour = clamp(vapourKPa, ...VAPOUR_RANGE);

  const a = powers(air);
  const w = powers(wind);
  const r = powers(radiant);
  const v = powers(vapour);

  let total = air;
  for (const [coefficient, i, j, k, l] of UTCI_TERMS) {
    total += coefficient * a[i] * w[j] * r[k] * v[l];
  }
  return total;
}

// Every call site wants this per weather row, and several want it more than
// once per row, so cache it against the row object rather than running 210
// terms again. Rows are plain objects created per fetch, so nothing is pinned.
// One cache per sun exposure, since the two answers differ for the same row.
const caches = {open: new WeakMap(), shaded: new WeakMap()};

// The one temperature the comfort model reasons about, in °F. Null when the row
// has no air temperature, which is the only field with no sane substitute.
export function feltTemperature(conditions, {shaded = false} = {}) {
  if (!Number.isFinite(conditions?.temperature_2m)) return null;
  const cache = shaded ? caches.shaded : caches.open;
  const cached = cache.get(conditions);
  if (cached !== undefined) return cached;

  const airC = toC(conditions.temperature_2m);
  const dewC = Math.min(
    toC(conditions.dew_point_2m ?? conditions.temperature_2m),
    airC,
  );
  const felt = toF(
    utci({
      airC,
      windMs: (conditions.wind_speed_10m ?? 0) * MPH_TO_MS,
      tmrtC: meanRadiantTemperature(conditions, {shaded}),
      vapourKPa: vapourPressure(dewC) / 10,
    }),
  );

  cache.set(conditions, felt);
  return felt;
}

// UTCI's published stress categories, in °F. These are the index's own words
// for its own numbers, not this app's opinion, which is exactly why they are
// worth showing: "96°" is a number, "strong heat stress" is a decision. The
// neutral band returns null so a pleasant day says nothing at all.
const STRESS_BANDS = [
  [114.8, 'extreme heat stress'],
  [100.4, 'very strong heat stress'],
  [89.6, 'strong heat stress'],
  [78.8, 'moderate heat stress'],
  [48.2, null], // UTCI's "no thermal stress"
  [32, 'slight cold stress'],
  [8.6, 'moderate cold stress'],
  [-16.6, 'strong cold stress'],
  [-40, 'very strong cold stress'],
];

export function thermalStress(felt) {
  if (!Number.isFinite(felt)) return null;
  // Not `?? 'extreme cold stress'`: the neutral band's label is deliberately
  // null, and `??` cannot tell that apart from falling off the end of the list.
  const band = STRESS_BANDS.find(([floor]) => felt >= floor);
  return band ? band[1] : 'extreme cold stress';
}
