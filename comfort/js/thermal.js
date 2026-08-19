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
  -2.8365744e3, -6.028076559e3, 1.954263612e1, -2.737830188e-2,
  1.6261698e-5, 7.0229056e-10, -1.8680009e-13,
];
const SVP_LOG_COEFF = 2.7150305;

export function vapourPressure(tempC) {
  const tk = tempC + KELVIN;
  let logPressure = SVP_LOG_COEFF * Math.log(tk);
  for (let i = 0; i < SVP_COEFFS.length; i++) logPressure += SVP_COEFFS[i] * tk ** (i - 2);
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
export function meanRadiantTemperature(conditions, { shaded = false } = {}) {
  const airC = toC(conditions.temperature_2m);
  const airK = airC + KELVIN;
  const dewC = Math.min(toC(conditions.dew_point_2m ?? conditions.temperature_2m), airC);

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
  const longwaveUp = GROUND_EMISSIVITY * STEFAN_BOLTZMANN * (groundC + KELVIN) ** 4;

  const global = conditions.shortwave_radiation ?? 0;
  const diffuse = conditions.diffuse_radiation ?? 0;
  const beamNormal = shaded ? 0 : (conditions.direct_normal_irradiance ?? 0);
  const beamHorizontal = conditions.direct_radiation ?? Math.max(0, global - diffuse);
  const altitude = solarAltitude(beamHorizontal, beamNormal);

  const shortwave = skyView * (diffuse + GROUND_ALBEDO * global);

  const absorbed =
    HUMAN_EMISSIVITY * HEMISPHERE_FACTOR * (longwaveDown + longwaveUp) +
    HUMAN_ABSORPTION *
      (HEMISPHERE_FACTOR * shortwave + projectedAreaFactor(altitude) * beamNormal);

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
  [6.07562052e-01, 0, 0, 0, 0], [-2.27712343e-02, 1, 0, 0, 0], [8.06470249e-04, 2, 0, 0, 0],
  [-1.54271372e-04, 3, 0, 0, 0], [-3.24651735e-06, 4, 0, 0, 0], [7.32602852e-08, 5, 0, 0, 0],
  [1.35959073e-09, 6, 0, 0, 0], [-2.25836520e00, 0, 1, 0, 0], [8.80326035e-02, 1, 1, 0, 0],
  [2.16844454e-03, 2, 1, 0, 0], [-1.53347087e-05, 3, 1, 0, 0], [-5.72983704e-07, 4, 1, 0, 0],
  [-2.55090145e-09, 5, 1, 0, 0], [-7.51269505e-01, 0, 2, 0, 0], [-4.08350271e-03, 1, 2, 0, 0],
  [-5.21670675e-05, 2, 2, 0, 0], [1.94544667e-06, 3, 2, 0, 0], [1.14099531e-08, 4, 2, 0, 0],
  [1.58137256e-01, 0, 3, 0, 0], [-6.57263143e-05, 1, 3, 0, 0], [2.22697524e-07, 2, 3, 0, 0],
  [-4.16117031e-08, 3, 3, 0, 0], [-1.27762753e-02, 0, 4, 0, 0], [9.66891875e-06, 1, 4, 0, 0],
  [2.52785852e-09, 2, 4, 0, 0], [4.56306672e-04, 0, 5, 0, 0], [-1.74202546e-07, 1, 5, 0, 0],
  [-5.91491269e-06, 0, 6, 0, 0], [3.98374029e-01, 0, 0, 1, 0], [1.83945314e-04, 1, 0, 1, 0],
  [-1.73754510e-04, 2, 0, 1, 0], [-7.60781159e-07, 3, 0, 1, 0], [3.77830287e-08, 4, 0, 1, 0],
  [5.43079673e-10, 5, 0, 1, 0], [-2.00518269e-02, 0, 1, 1, 0], [8.92859837e-04, 1, 1, 1, 0],
  [3.45433048e-06, 2, 1, 1, 0], [-3.77925774e-07, 3, 1, 1, 0], [-1.69699377e-09, 4, 1, 1, 0],
  [1.69992415e-04, 0, 2, 1, 0], [-4.99204314e-05, 1, 2, 1, 0], [2.47417178e-07, 2, 2, 1, 0],
  [1.07596466e-08, 3, 2, 1, 0], [8.49242932e-05, 0, 3, 1, 0], [1.35191328e-06, 1, 3, 1, 0],
  [-6.21531254e-09, 2, 3, 1, 0], [-4.99410301e-06, 0, 4, 1, 0], [-1.89489258e-08, 1, 4, 1, 0],
  [8.15300114e-08, 0, 5, 1, 0], [7.55043090e-04, 0, 0, 2, 0], [-5.65095215e-05, 1, 0, 2, 0],
  [-4.52166564e-07, 2, 0, 2, 0], [2.46688878e-08, 3, 0, 2, 0], [2.42674348e-10, 4, 0, 2, 0],
  [1.54547250e-04, 0, 1, 2, 0], [5.24110970e-06, 1, 1, 2, 0], [-8.75874982e-08, 2, 1, 2, 0],
  [-1.50743064e-09, 3, 1, 2, 0], [-1.56236307e-05, 0, 2, 2, 0], [-1.33895614e-07, 1, 2, 2, 0],
  [2.49709824e-09, 2, 2, 2, 0], [6.51711721e-07, 0, 3, 2, 0], [1.94960053e-09, 1, 3, 2, 0],
  [-1.00361113e-08, 0, 4, 2, 0], [-1.21206673e-05, 0, 0, 3, 0], [-2.18203660e-07, 1, 0, 3, 0],
  [7.51269482e-09, 2, 0, 3, 0], [9.79063848e-11, 3, 0, 3, 0], [1.25006734e-06, 0, 1, 3, 0],
  [-1.81584736e-09, 1, 1, 3, 0], [-3.52197671e-10, 2, 1, 3, 0], [-3.36514630e-08, 0, 2, 3, 0],
  [1.35908359e-10, 1, 2, 3, 0], [4.17032620e-10, 0, 3, 3, 0], [-1.30369025e-09, 0, 0, 4, 0],
  [4.13908461e-10, 1, 0, 4, 0], [9.22652254e-12, 2, 0, 4, 0], [-5.08220384e-09, 0, 1, 4, 0],
  [-2.24730961e-11, 1, 1, 4, 0], [1.17139133e-10, 0, 2, 4, 0], [6.62154879e-10, 0, 0, 5, 0],
  [4.03863260e-13, 1, 0, 5, 0], [1.95087203e-12, 0, 1, 5, 0], [-4.73602469e-12, 0, 0, 6, 0],
  [5.12733497e00, 0, 0, 0, 1], [-3.12788561e-01, 1, 0, 0, 1], [-1.96701861e-02, 2, 0, 0, 1],
  [9.99690870e-04, 3, 0, 0, 1], [9.51738512e-06, 4, 0, 0, 1], [-4.66426341e-07, 5, 0, 0, 1],
  [5.48050612e-01, 0, 1, 0, 1], [-3.30552823e-03, 1, 1, 0, 1], [-1.64119440e-03, 2, 1, 0, 1],
  [-5.16670694e-06, 3, 1, 0, 1], [9.52692432e-07, 4, 1, 0, 1], [-4.29223622e-02, 0, 2, 0, 1],
  [5.00845667e-03, 1, 2, 0, 1], [1.00601257e-06, 2, 2, 0, 1], [-1.81748644e-06, 3, 2, 0, 1],
  [-1.25813502e-03, 0, 3, 0, 1], [-1.79330391e-04, 1, 3, 0, 1], [2.34994441e-06, 2, 3, 0, 1],
  [1.29735808e-04, 0, 4, 0, 1], [1.29064870e-06, 1, 4, 0, 1], [-2.28558686e-06, 0, 5, 0, 1],
  [-3.69476348e-02, 0, 0, 1, 1], [1.62325322e-03, 1, 0, 1, 1], [-3.14279680e-05, 2, 0, 1, 1],
  [2.59835559e-06, 3, 0, 1, 1], [-4.77136523e-08, 4, 0, 1, 1], [8.64203390e-03, 0, 1, 1, 1],
  [-6.87405181e-04, 1, 1, 1, 1], [-9.13863872e-06, 2, 1, 1, 1], [5.15916806e-07, 3, 1, 1, 1],
  [-3.59217476e-05, 0, 2, 1, 1], [3.28696511e-05, 1, 2, 1, 1], [-7.10542454e-07, 2, 2, 1, 1],
  [-1.24382300e-05, 0, 3, 1, 1], [-7.38584400e-09, 1, 3, 1, 1], [2.20609296e-07, 0, 4, 1, 1],
  [-7.32469180e-04, 0, 0, 2, 1], [-1.87381964e-05, 1, 0, 2, 1], [4.80925239e-06, 2, 0, 2, 1],
  [-8.75492040e-08, 3, 0, 2, 1], [2.77862930e-05, 0, 1, 2, 1], [-5.06004592e-06, 1, 1, 2, 1],
  [1.14325367e-07, 2, 1, 2, 1], [2.53016723e-06, 0, 2, 2, 1], [-1.72857035e-08, 1, 2, 2, 1],
  [-3.95079398e-08, 0, 3, 2, 1], [-3.59413173e-07, 0, 0, 3, 1], [7.04388046e-07, 1, 0, 3, 1],
  [-1.89309167e-08, 2, 0, 3, 1], [-4.79768731e-07, 0, 1, 3, 1], [7.96079978e-09, 1, 1, 3, 1],
  [1.62897058e-09, 0, 2, 3, 1], [3.94367674e-08, 0, 0, 4, 1], [-1.18566247e-09, 1, 0, 4, 1],
  [3.34678041e-10, 0, 1, 4, 1], [-1.15606447e-10, 0, 0, 5, 1], [-2.80626406e00, 0, 0, 0, 2],
  [5.48712484e-01, 1, 0, 0, 2], [-3.99428410e-03, 2, 0, 0, 2], [-9.54009191e-04, 3, 0, 0, 2],
  [1.93090978e-05, 4, 0, 0, 2], [-3.08806365e-01, 0, 1, 0, 2], [1.16952364e-02, 1, 1, 0, 2],
  [4.95271903e-04, 2, 1, 0, 2], [-1.90710882e-05, 3, 1, 0, 2], [2.10787756e-03, 0, 2, 0, 2],
  [-6.98445738e-04, 1, 2, 0, 2], [2.30109073e-05, 2, 2, 0, 2], [4.17856590e-04, 0, 3, 0, 2],
  [-1.27043871e-05, 1, 3, 0, 2], [-3.04620472e-06, 0, 4, 0, 2], [5.14507424e-02, 0, 0, 1, 2],
  [-4.32510997e-03, 1, 0, 1, 2], [8.99281156e-05, 2, 0, 1, 2], [-7.14663943e-07, 3, 0, 1, 2],
  [-2.66016305e-04, 0, 1, 1, 2], [2.63789586e-04, 1, 1, 1, 2], [-7.01199003e-06, 2, 1, 1, 2],
  [-1.06823306e-04, 0, 2, 1, 2], [3.61341136e-06, 1, 2, 1, 2], [2.29748967e-07, 0, 3, 1, 2],
  [3.04788893e-04, 0, 0, 2, 2], [-6.42070836e-05, 1, 0, 2, 2], [1.16257971e-06, 2, 0, 2, 2],
  [7.68023384e-06, 0, 1, 2, 2], [-5.47446896e-07, 1, 1, 2, 2], [-3.59937910e-08, 0, 2, 2, 2],
  [-4.36497725e-06, 0, 0, 3, 2], [1.68737969e-07, 1, 0, 3, 2], [2.67489271e-08, 0, 1, 3, 2],
  [3.23926897e-09, 0, 0, 4, 2], [-3.53874123e-02, 0, 0, 0, 3], [-2.21201190e-01, 1, 0, 0, 3],
  [1.55126038e-02, 2, 0, 0, 3], [-2.63917279e-04, 3, 0, 0, 3], [4.53433455e-02, 0, 1, 0, 3],
  [-4.32943862e-03, 1, 1, 0, 3], [1.45389826e-04, 2, 1, 0, 3], [2.17508610e-04, 0, 2, 0, 3],
  [-6.66724702e-05, 1, 2, 0, 3], [3.33217140e-05, 0, 3, 0, 3], [-2.26921615e-03, 0, 0, 1, 3],
  [3.80261982e-04, 1, 0, 1, 3], [-5.45314314e-09, 2, 0, 1, 3], [-7.96355448e-04, 0, 1, 1, 3],
  [2.53458034e-05, 1, 1, 1, 3], [-6.31223658e-06, 0, 2, 1, 3], [3.02122035e-04, 0, 0, 2, 3],
  [-4.77403547e-06, 1, 0, 2, 3], [1.73825715e-06, 0, 1, 2, 3], [-4.09087898e-07, 0, 0, 3, 3],
  [6.14155345e-01, 0, 0, 0, 4], [-6.16755931e-02, 1, 0, 0, 4], [1.33374846e-03, 2, 0, 0, 4],
  [3.55375387e-03, 0, 1, 0, 4], [-5.13027851e-04, 1, 1, 0, 4], [1.02449757e-04, 0, 2, 0, 4],
  [-1.48526421e-03, 0, 0, 1, 4], [-4.11469183e-05, 1, 0, 1, 4], [-6.80434415e-06, 0, 1, 1, 4],
  [-9.77675906e-06, 0, 0, 2, 4], [8.82773108e-02, 0, 0, 0, 5], [-3.01859306e-03, 1, 0, 0, 5],
  [1.04452989e-03, 0, 1, 0, 5], [2.47090539e-04, 0, 0, 1, 5], [1.48348065e-03, 0, 0, 0, 6],];

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

export function utci({ airC, windMs, tmrtC, vapourKPa }) {
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
const caches = { open: new WeakMap(), shaded: new WeakMap() };

// The one temperature the comfort model reasons about, in °F. Null when the row
// has no air temperature, which is the only field with no sane substitute.
export function feltTemperature(conditions, { shaded = false } = {}) {
  if (!Number.isFinite(conditions?.temperature_2m)) return null;
  const cache = shaded ? caches.shaded : caches.open;
  const cached = cache.get(conditions);
  if (cached !== undefined) return cached;

  const airC = toC(conditions.temperature_2m);
  const dewC = Math.min(toC(conditions.dew_point_2m ?? conditions.temperature_2m), airC);
  const felt = toF(
    utci({
      airC,
      windMs: (conditions.wind_speed_10m ?? 0) * MPH_TO_MS,
      tmrtC: meanRadiantTemperature(conditions, { shaded }),
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
