// ---------------------------------------------------------------------------
// The comfort model.
//
// Three layers, in order:
//
//   1. Hazards. Conditions with one right answer — lightning, ice underfoot,
//      damaging gusts, hazardous air — short-circuit the whole thing to zero.
//      They are not extreme cases of a comfort penalty, they are a different
//      question, and keeping them separate leaves room to add more without
//      distorting the curves below.
//   2. Thermal stress, from UTCI. One number, computed in `thermal.js`, that
//      already accounts for temperature, humidity, wind and radiation and the
//      way they interact. Nothing else in this file may score those again.
//   3. Everything else that makes a walk worse without being about heat: rain,
//      mechanical wind, sunburn risk, air quality, darkness.
//
// A walk score is 100 minus the layer-2 and layer-3 penalties, each 0-100,
// combined as a root-sum-square instead of a weighted average. That matters: an
// average lets one dealbreaker be diluted by everything else (heavy rain at a
// pleasant 68°F should not score 70), while RSS lets the worst factor dominate
// and still lets several mild annoyances stack up a little.
//
// It also means the largest penalty *is* the reason for the score, so the app
// can always say why it said what it said. See `limitingFactor`.
//
// Deliberately not scored on its own: cloud cover. Cloud is not uncomfortable
// in itself, and its real effects now arrive through UTCI properly — cloud sets
// how much of the sun's beam reaches you and how much heat the sky takes back
// at night, both of which land in mean radiant temperature.
// ---------------------------------------------------------------------------

import { feltTemperature } from './thermal.js';

// The one thermal number, in °F, re-exported so callers that display a "feels
// like" figure show the same quantity the score was computed from.
export { feltTemperature };

// Sunburn is a dose — intensity times time — so a shorter outing genuinely
// does buy tolerance for a given UV index. Thermal strain is not a dose in that
// sense, and this used to scale that too, which had it backwards twice over: a
// 30-minute walk came out with a 15% *wider* heat tolerance than an hour of
// sitting, handing the more metabolically loaded activity the more forgiving
// scale, on top of a band offset that already accounts for the difference
// between the two. UTCI's stress categories are steady-state judgements about a
// person already walking; sliding them by trip length was a second opinion
// about the same physiology, and it was worth ~8 points on a muggy afternoon.
const EXPOSURE_REFERENCE_MINUTES = 60;
// Sublinear: doubling the time outside does not double the misery, it just
// moves the threshold where you start noticing.
const exposureRelief = (minutes) => (EXPOSURE_REFERENCE_MINUTES / minutes) ** 0.2;


// Wind's cooling is already inside UTCI, so this scores only what UTCI has no
// opinion about: the mechanical nuisance of walking into it.
//
// The free ceiling used to be 15 mph, raised there because charging for a 12
// mph breeze on a hot day had the model calling the same wind a relief and an
// annoyance at once. The relief is real and it still wins — UTCI takes several
// degrees off a hot afternoon for a wind this file now charges a couple of
// points for — but 15 mph was too high a price for avoiding that. Beaufort
// calls it a *moderate breeze*: loose paper blows about and small branches
// move. A day like that is not a perfect day, and the score has to be able to
// say so, or a stiff wind and a still one are the same 100.
//
// So the ceiling comes down to the top of Beaufort 2, *light breeze*, and the
// far anchor stays exactly where it was: 40 mph sustained is still the wind
// that costs the whole score. Same shape, same endpoint, narrower free zone —
// the move the comfort band just made.
const WIND_FREE = 7; // top of Beaufort 2; the most wind a perfect day has
const WIND_TOTAL = 40; // sustained mph that costs the entire score
const GUST_WEIGHT = 0.7; // a gust is worse than its speed suggests, but is brief

const RAIN_TRACE = 0.2; // mm/hr; mist you would not turn back for
const RAIN_HALF_PENALTY = 2.5; // mm/hr above trace at which rain costs ~63 points
const SNOW_SOFTENING = 0.6; // snow is pleasanter to walk in than the same rain

// UV is not a thermal input — that job belongs to mean radiant temperature now.
// What is left is sunburn, which is a real reason to put a walk off and a poor
// reason to call an otherwise perfect 68°F afternoon uncomfortable.
//
// Read off the WHO's own categories for the same reason the AQI curve is: they
// are where the advice changes. Free through *low*, because that is the only
// band where nobody is told to do anything. *Moderate* starts the advice to
// cover up, and used to be free — which is how UV 5 came to be part of a
// perfect score.
const UV_MAX_PENALTY = 35; // a hat and sunscreen cap how bad sun alone can be
const UV_CURVE = [
  [2, 0], // top of "low": no advice attached, so no cost
  [5, 5], // top of "moderate"
  [7, 14], // top of "high"
  [10, 30], // top of "very high"
  [11, UV_MAX_PENALTY], // "extreme"
];

// The US AQI is a category scale wearing a number's clothing: the step from 90
// to 110 crosses a health advisory, the step from 20 to 40 crosses nothing.
// Interpolating between the category edges tracks that; a straight line from
// 50 did not, and charged 40 points for air the EPA calls acceptable.
// The back half of "Good" is not free any more, for the same reason the back
// half of the comfort band is not: AQI 48 is air the EPA is happy with, and it
// is still not the AQI 12 of a day worth calling perfect. Three points, which
// is under the notability floor by design — this may nudge a 100 off its perch
// and it may never be the headline.
const AQI_CURVE = [
  [25, 0], // clean air, and the only air that costs nothing
  [50, 3], // top of "Good"
  [100, 12], // top of "Moderate"
  [150, 45], // top of "Unhealthy for sensitive groups"
  [200, 85], // top of "Unhealthy"
];

// How a thermal penalty grows once the felt temperature leaves the band, in
// `stress` — the excess over the band divided by the activity's tolerance.
// Each activity's tolerance is set so stress 1.0 lands on a named UTCI stress
// category, which is what makes these numbers mean something (see ACTIVITIES).
//
// This used to be a bare quadratic, `100 * (excess / tolerance) ** 2`, where the
// one tolerance number had to be both the scale of the ramp and the point where
// the score bottomed out. It cannot be both. Set wide enough that 108°F felt
// wasn't already a zero, it was far too flat through the middle — and the middle
// is where nearly all real weather lives. UTCI would report *strong heat stress*
// and the ring beside it would say 70, which is the bottom of "Good": the app
// disagreeing out loud with the very index it is built on. Separating the two
// jobs lets the curve be steep where the categories change and still leave room
// above for genuinely dangerous heat.
const STRESS_CURVE = [
  [0, 0],
  [0.4, 12], // one category out: you notice, it is not a reason to stay in
  [1.0, 50], // the anchor category: half the score, gone
  [1.6, 85], // a category past it: this is now the entire story
  [2.4, 100],
];

// The band is not uniformly neutral, and charging nothing across the whole of
// it threw away the only humidity signal the model had. A walker's band is 22°F
// wide and every point in it used to score a flat 100 — so a 71°F morning at a
// 45°F dew point and the same morning at 67°F, which UTCI puts 8.5°F apart in
// felt temperature, both printed 100. The dew point tile eight inches from the
// ring said "Muggy" and the sentence under it said "Just about ideal". That is
// the contradiction the rain tile used to have with the score, and it has the
// same answer: the two readouts have to be reading the same number.
//
// So only the middle of the band is free. The outer SHOULDER_FRACTION at each
// end is where the score gets its resolution back, and nothing new is measured
// to do it — the felt temperature already carries the mugginess, the band was
// rounding its own interior off to zero.
const SHOULDER_FRACTION = 0.3; // of the band's width, at each end

// The free core, in °F. Outside this the penalty starts, gently.
function comfortCore(activity) {
  const shoulder = (activity.band[1] - activity.band[0]) * SHOULDER_FRACTION;
  return [activity.band[0] + shoulder, activity.band[1] - shoulder];
}

// Where stress 1.0 sits, in °F: the named UTCI category each tolerance was
// chosen to land on. Deriving the curve from *these* rather than from the band
// edge is what lets the core move without dragging the calibration with it —
// stress 1.0 is still strong heat stress for a walker at 90°F felt, still
// moderate cold stress for someone sitting at 31°F, exactly as the comments in
// ACTIVITIES claim. All that changed is where the ramp starts.
const heatAnchor = (activity) => activity.band[1] + activity.hotTolerance;
const coldAnchor = (activity) => activity.band[0] - activity.coldTolerance;

// Not scaled by walk length: rain soaks you in the first ten minutes, wind is a
// nuisance the whole way regardless, and darkness is a fact rather than a dose.
const DARKNESS_PENALTY = 14; // visibility and safety, not comfort exactly

const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const DRIZZLE_CODES = new Set([51, 53, 55, 56, 57]);

// --- Activities -------------------------------------------------------------
//
// "Is it nice out?" is two questions with different answers, and on a hot sunny
// afternoon they diverge completely: walking is miserable and sitting under a
// tree with a drink is the best part of the day. Each activity is a profile
// over the same machinery rather than a second model.
//
// The bands are *not* the same range shifted. UTCI is defined for a person
// walking at 4 km/h — that is its reference metabolic rate, about 2.3 MET — and
// a seated person at 1.2 MET is producing roughly half the internal heat. They
// need warmer air to break even, which moves the whole band up about 10°F.
//
// The asymmetry flips too. A walker can outrun cold and cannot escape heat, so
// their cold scale is the forgiving one. Someone sitting still has it exactly
// the other way round: they will happily read a book at 85°F in shade, and they
// will be shivering in twenty minutes at 45°F.
function defineActivity(profile) {
  return { ...profile, uvRelief: exposureRelief(profile.minutes) };
}

export const ACTIVITIES = {
  // A band, not a point. The first version of this model picked a single ideal
  // temperature and charged for every degree either side of it, which quietly
  // asserted that 70°F is worse than 60°F — an opinion, not a finding. UTCI
  // instead reports *no thermal stress* across 9-26°C (48-79°F), a range wide
  // enough that people inside it disagree about which end they prefer.
  //
  // A tolerance is the distance from the edge of that band to the UTCI stress
  // category that should cost half the score — the 1.0 anchor on STRESS_CURVE —
  // so each one is set to land on a named category rather than being dialled in
  // by feel. Walking: 72 + 18 = 90°F felt, just inside *strong heat stress*;
  // 50 - 42 = 8°F felt, just inside *strong cold stress*.
  //
  // Those two temperatures, and not the band edge or the tolerance separately,
  // are what the penalty curve is actually pinned to. Only the middle of the
  // band scores free — see SHOULDER_FRACTION — and the ramp runs from the edge
  // of that core to the anchor. Writing the tolerances this way keeps the
  // arithmetic above readable and lets the core move without any of it
  // changing meaning.
  //
  // Cold gets the wider scale because a walker can outrun cold and cannot
  // outrun heat, and because UTCI counts the heat a clear winter sky pulls out
  // of you radiatively — worth another 20°F on top of the wind — so a tolerance
  // tuned against apparent temperature would have scored most of a Midwestern
  // January as zero.
  walk: defineActivity({
    key: 'walk',
    label: 'Walking',
    short: 'Walking',
    phrase: 'for a walk',
    minutes: 30,
    shaded: false,
    band: [50, 72],
    hotTolerance: 18,
    coldTolerance: 42,
    skip: [],
  }),

  // Shade removes the sun's beam from the radiant load, which is the single
  // biggest term on a clear afternoon, so it also removes any reason to score
  // UV. Darkness goes too: sitting outside after sunset is not a hazard, it is
  // most of the point of sitting outside in July.
  //
  // Anchored the same way, and the asymmetry flips with it. Heat: 78 + 23 =
  // 101°F felt, a whole category further out than the walker's, because 1.2 MET
  // in shade is not 2.3 MET in the sun. Cold: 58 - 27 = 31°F felt, only
  // *moderate* cold stress and so the earlier of the two, because sitting still
  // is where cold wins — a book at 85°F in shade is fine and twenty minutes at
  // 45°F is not.
  sit: defineActivity({
    key: 'sit',
    label: 'Sitting in the shade',
    // The toggle is 100px wide; the legend and the secondary readout have room
    // for the qualifier that actually matters, which is the shade.
    short: 'Sitting out',
    phrase: 'for sitting out',
    minutes: 60,
    shaded: true,
    band: [58, 78],
    hotTolerance: 23,
    coldTolerance: 27,
    skip: ['sun', 'dark'],
  }),
};

export const DEFAULT_ACTIVITY = ACTIVITIES.walk;

// --- Layer 1: hazards -------------------------------------------------------

const STORM_CODES = new Set([95, 96, 99]);
const ICE_CODES = new Set([56, 57, 66, 67]); // freezing drizzle and freezing rain
const GALE_GUST_MPH = 50; // gusts that can put a branch or a sign into the road
const HAZARDOUS_AQI = 200; // bottom of the US AQI "Very unhealthy" band

// Keyed by the name each reports as the limiting factor, so a hazard explains
// itself through the same channel a penalty does. Checked in order.
const HAZARDS = {
  storm: (c) => STORM_CODES.has(c.weather_code),
  ice: (c) => ICE_CODES.has(c.weather_code),
  gale: (c) => (c.wind_gusts_10m ?? 0) >= GALE_GUST_MPH,
  air: (c) => (c.us_aqi ?? 0) >= HAZARDOUS_AQI,
};

// --- Layer 2 and 3: penalties -----------------------------------------------

const clamp100 = (n) => Math.min(100, Math.max(0, n));

// Below this a factor isn't worth mentioning as "the" reason for the score.
const NOTABLE_PENALTY = 8;

// And below this the *whole* stack is small enough that the day may still be
// called ideal. The two are different questions, and the sentence needs both:
// a breezy, bright, hazy day can have nothing worth naming on it — no single
// factor reaching NOTABLE_PENALTY — while plainly not being the day anyone
// pictures when they say perfect. Without this the copy answered the first
// question and printed the answer to the second.
const IDEAL_TOTAL = 4;

// Piecewise-linear lookup over [x, y] breakpoints, flat outside the ends.
function alongCurve(curve, x) {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i - 1];
    const [x1, y1] = curve[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return curve.at(-1)[1];
}

// Open-Meteo reports precipitation as a sum over the preceding `interval`
// seconds: 3600 for hourly rows, 900 for the current-conditions block. Both
// are normalized to mm/hr so every downstream curve reads the same units.
export function precipitationRate({ precipitation, interval = 3600 }) {
  if (!Number.isFinite(precipitation)) return 0;
  return precipitation * (3600 / interval);
}

// The single answer to "is it raining right now", used by the score and by the
// tile that sits eight inches from it. They used to answer separately and
// disagree: the tile said "Falling now" for any non-zero reading at all, while
// the model wrote off anything under `RAIN_TRACE` as mist. A tenth of a
// millimetre in the last quarter hour was enough to put "Falling now" on screen
// beside a score that had barely noticed, which reads as the app contradicting
// itself — and the reader is right, it was.
export const isRaining = (conditions) => precipitationRate(conditions) > RAIN_TRACE;

const PENALTIES = {
  // One continuous curve from the edge of the core to the far end of the scale,
  // rather than a flat band with a ramp bolted to each side. Two things fall
  // out of measuring stress from the core instead of the band edge: the score
  // has resolution through the shoulder, where most real weather sits, and the
  // anchors keep their published meaning, because the denominator still ends on
  // the same named UTCI category it always did.
  //
  // Heat and cold never both fire: SHOULDER_FRACTION is below half, so the core
  // is non-empty, and anything warm enough to be in the hot shoulder is above
  // the cold core edge and costs nothing there.
  heat(conditions, activity) {
    const core = comfortCore(activity)[1];
    const excess = feltTemperature(conditions, activity) - core;
    if (excess <= 0) return 0;
    return alongCurve(STRESS_CURVE, excess / (heatAnchor(activity) - core));
  },

  cold(conditions, activity) {
    const core = comfortCore(activity)[0];
    const deficit = core - feltTemperature(conditions, activity);
    if (deficit <= 0) return 0;
    return alongCurve(STRESS_CURVE, deficit / (core - coldAnchor(activity)));
  },

  // The trace subtraction is the difference between "it is raining" and "there
  // is water in the air". A tenth of a millimetre an hour used to cost four
  // points and could be the stated reason for an otherwise unblemished score.
  rain(conditions) {
    const rate = precipitationRate(conditions) - RAIN_TRACE;
    if (rate <= 0) return 0;
    const softening = SNOW_CODES.has(conditions.weather_code) ? SNOW_SOFTENING : 1;
    return clamp100(softening * 100 * (1 - Math.exp(-rate / RAIN_HALF_PENALTY)));
  },

  wind({ wind_speed_10m, wind_gusts_10m }) {
    const felt = Math.max(wind_speed_10m, (wind_gusts_10m ?? 0) * GUST_WEIGHT);
    const excess = felt - WIND_FREE;
    return excess <= 0 ? 0 : clamp100(100 * (excess / (WIND_TOTAL - WIND_FREE)) ** 2);
  },

  // The dose scaling divides the index rather than widening a tolerance: half
  // the time outside is half the dose, and the curve is read at the UV that
  // dose is equivalent to.
  sun({ uv_index }, activity) {
    return alongCurve(UV_CURVE, (uv_index ?? 0) / activity.uvRelief);
  },

  // Omitted rather than assumed when the air-quality request fails.
  air({ us_aqi }) {
    return Number.isFinite(us_aqi) ? alongCurve(AQI_CURVE, us_aqi) : 0;
  },

  dark({ is_day }) {
    return is_day === 0 ? DARKNESS_PENALTY : 0;
  },
};

// `conditions` is one hourly row or the current-conditions block, optionally
// carrying `us_aqi`. Returns the score plus the penalty breakdown that produced
// it, so callers never have to re-derive why.
//
// `exclude` drops named factors. The historical comparison needs it: the ERA5
// archive carries no UV index and no air quality, so scoring today's weather
// with those factors and the 2019 record without them would compare two
// different scales and quietly flatter the past.
export function scoreComfort(conditions, { activity = DEFAULT_ACTIVITY, exclude = [] } = {}) {
  if (!Number.isFinite(conditions?.temperature_2m)) {
    return { score: null, penalties: {}, limiter: null };
  }

  for (const [key, hazardous] of Object.entries(HAZARDS)) {
    if (!exclude.includes(key) && hazardous(conditions)) {
      return { score: 0, penalties: { [key]: 100 }, limiter: key };
    }
  }

  const penalties = {};
  for (const [key, penalty] of Object.entries(PENALTIES)) {
    if (!exclude.includes(key) && !activity.skip.includes(key)) {
      penalties[key] = penalty(conditions, activity);
    }
  }

  const total = Math.min(100, Math.hypot(...Object.values(penalties)));
  return {
    score: Math.round(100 - total),
    penalties,
    limiter: limitingFactor(penalties),
  };
}

// Convenience for the many call sites that only want the number.
export const comfortScore = (conditions, options) => scoreComfort(conditions, options).score;

// Factors the weather archive cannot supply, so both sides of a historical
// comparison have to go without them. ERA5 accepts a `uv_index` request and
// answers with nulls, which is worse than refusing, so it stays on this list.
export const UNARCHIVED_FACTORS = ['sun', 'air'];

function limitingFactor(penalties) {
  let worst = null;
  for (const [key, value] of Object.entries(penalties)) {
    if (value >= NOTABLE_PENALTY && (!worst || value > penalties[worst])) worst = key;
  }
  return worst;
}

// The scale the score is read against, in one place. A bare "61" is a number
// with nothing behind it; these bands are what make it a judgement. The ring
// paints them as its track, the headline says the word, the chart's reference
// line is the bottom of Good, and the breakdown panel labels them — four
// readouts that each used to carry their own thresholds and could drift apart.
export const SCORE_BANDS = [
  { min: 85, label: 'Great', color: '#8FD19E' },
  { min: 70, label: 'Good', color: '#C3D68C' },
  { min: 50, label: 'Tolerable', color: '#FFC97F' },
  { min: 30, label: 'Poor', color: '#F0A377' },
  { min: 0, label: 'Avoid', color: '#E8846B' },
];

export const bandFor = (score) => SCORE_BANDS.find((band) => score >= band.min);

// The bare adjective, for places too small for a sentence — the secondary
// activity readout uses it beside its number.
export function comfortVerdict(score) {
  return score === null ? '–' : bandFor(score).label;
}

export function comfortHeadline(score, activity = DEFAULT_ACTIVITY) {
  if (score === null) return 'No data';
  if (score < 30) return `Bad ${activity.phrase} right now`;
  return `${comfortVerdict(score)} ${activity.phrase}`;
}

// What each factor is called out loud. Lived in the chart, which meant the
// breakdown panel and the tooltip were one rename away from disagreeing about
// what `air` is.
export const FACTOR_LABELS = {
  heat: 'Heat',
  cold: 'Cold',
  rain: 'Rain',
  wind: 'Wind',
  sun: 'UV',
  air: 'Air quality',
  dark: 'Darkness',
  storm: 'Storms',
  ice: 'Ice',
  gale: 'Gales',
};

// The dew point at which the tile stops hedging and says "Muggy" outright. The
// sentence beside the ring reads the same constant, because the whole failure
// this fixed was two readouts of the same air disagreeing in plain sight.
const MUGGY_DEW_POINT = 65;

const isMuggy = (conditions) => (conditions.dew_point_2m ?? 0) >= MUGGY_DEW_POINT;

export function describeHumidity(dewPoint) {
  if (!Number.isFinite(dewPoint)) return '–';
  if (dewPoint < 50) return 'Dry';
  if (dewPoint < 60) return 'Comfortable';
  if (dewPoint < MUGGY_DEW_POINT) return 'Slightly muggy';
  if (dewPoint < 70) return 'Muggy';
  return 'Oppressive';
}

export function describeAirQuality(aqi) {
  if (!Number.isFinite(aqi)) return '–';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Poor';
  if (aqi <= 200) return 'Unhealthy';
  return 'Hazardous';
}

function describePrecipitation(conditions) {
  const rate = precipitationRate(conditions);
  const snow = SNOW_CODES.has(conditions.weather_code);
  if (rate <= 0) return 'None';
  if (rate < 2.5) {
    if (snow) return 'Light snow';
    // The codes distinguish drizzle from rain and the rate does not. Calling a
    // 0.4 mm/hr drizzle "Light rain" is how the tile came to sound like weather
    // worth cancelling a walk over.
    return DRIZZLE_CODES.has(conditions.weather_code) ? 'Drizzle' : 'Light rain';
  }
  if (rate < 10) return snow ? 'Snow' : 'Rain';
  return snow ? 'Heavy snow' : 'Heavy rain';
}

// A clause, not a sentence. It used to be its own sentence bolted onto the end,
// which read as two unrelated facts glued together — "Air quality is poor (AQI
// 137). Wear t-shirt weather." — where the second half neither knew nor cared
// what the first half had just said. Joined to the lead it becomes one opinion
// with its recommendation attached.
function suggestClothing(conditions, activity, isWet) {
  const felt = feltTemperature(conditions, activity);
  let clothing;
  if (felt >= 85) clothing = 'light, breathable clothing';
  else if (felt >= 70) clothing = 'a t-shirt';
  else if (felt >= 55) clothing = 'light layers';
  else if (felt >= 40) clothing = 'a jacket';
  else clothing = 'warm layers';
  if (isWet) clothing += ' and a shell';
  else if (conditions.uv_index >= 6) clothing += ' and sunscreen';
  return `wear ${clothing}`;
}

// Leads with whatever is actually holding the score down, so the sentence can
// never contradict the number above it.
// Graded by how large the penalty actually is, so a 14-point warmth nudge on an
// 85 doesn't get described in the same words as a 90-point heat emergency.
const SEVERE_PENALTY = 25;

const LIMITER_PHRASES = {
  storm: () => 'Thunderstorms, so wait this one out',
  ice: () => 'Freezing rain is glazing everything, so stay in',
  gale: () => 'Damaging gusts out there, so leave it for now',
  heat: (c, severe) => {
    if (!severe) {
      return isMuggy(c)
        ? 'Muggy enough that you will finish damp'
        : 'Warm, but manageable at an easy pace';
    }
    return isMuggy(c)
      ? 'Hot and muggy, so keep it short and carry water'
      : 'Hot enough to wear on you, so go early or late';
  },
  // Graded on the felt temperature rather than the penalty, because whether you
  // will warm up in ten minutes is a fact about the air, not about how far down
  // the score it dragged.
  cold: (c, severe, activity) => {
    const felt = feltTemperature(c, activity);
    if (felt >= 35) return 'Cool, but you will warm up within ten minutes';
    if (felt >= 15) return 'Cold, but fine once you are moving';
    return 'Cold enough to hurt exposed skin';
  },
  rain: (c) => `${describePrecipitation(c)} falling now`,
  wind: (c, severe) =>
    severe ? 'Strong wind will fight you the whole way' : 'Breezy enough to notice',
  air: (c) => `Air quality is ${describeAirQuality(c.us_aqi).toLowerCase()} (AQI ${Math.round(c.us_aqi)})`,
  // Neither of these tells you what to put on any more. The clothing clause
  // that follows already adds sunscreen above UV 6 — which is precisely when
  // this phrase fires — and it used to say it twice in one breath.
  sun: () => 'Sun is intense, so find shade where you can',
  dark: () => 'It is dark out, so stay visible',
};

// A hazard's advice is "don't", and what to wear while not going is not a
// question anyone has. Hazards are the one case where the clothing clause makes
// the sentence contradict itself — "wait this one out; wear a shell" — so it is
// dropped there and only there. A hazard is recognisable by costing the full
// 100 under a key layer 1 owns; no ordinary penalty ever reaches that.
const isHazard = (limiter, penalties) =>
  Object.hasOwn(HAZARDS, limiter) && penalties[limiter] === 100;

export function comfortReason(conditions, limiter, penalties = {}, activity = DEFAULT_ACTIVITY) {
  if (!Number.isFinite(conditions?.temperature_2m)) return '';
  // Rain below the notability floor still leaves no limiter, and the sentence
  // used to answer that with "Just about ideal" while the tile beside it said
  // drizzle — a quieter version of the contradiction this whole area had. It
  // also passed `false` for wetness here and so withheld the shell it would
  // have recommended one branch down.
  if (!limiter) {
    const wet = isRaining(conditions);
    // Mugginess gets the same treatment one notch down. A dew point the tile
    // calls "Muggy" costs real score through the band's shoulder, but a few
    // points is under the notability floor, so the limiter is null and the
    // sentence used to fall through to "Just about ideal" — over air the card
    // had just called muggy. Gated on the heat penalty rather than on the dew
    // point alone, so it can only speak when the score agrees with it: at 71°F
    // in the shade the same air costs nothing and there is nothing to say.
    const muggy = !wet && isMuggy(conditions) && (penalties.heat ?? 0) > 0;
    // Several small things, none of them worth a sentence of its own. Naming
    // any one of them would be worse than naming none — "Breezy enough to
    // notice" as the whole story of a 93 blames a 15 mph wind for a day that
    // is also bright and hazy — so the sentence reports the pile rather than
    // picking a scapegoat out of it.
    const unremarkable = Math.hypot(...Object.values(penalties)) >= IDEAL_TOTAL;
    let lead;
    if (wet) {
      lead = `${describePrecipitation(conditions)} falling, but otherwise ideal ${activity.phrase}`;
    } else if (muggy) {
      lead = `Muggy, but otherwise fine ${activity.phrase}`;
    } else if (unremarkable) {
      lead = `Nothing much against it ${activity.phrase}`;
    } else {
      lead = `Just about ideal ${activity.phrase}`;
    }
    return `${lead}; ${suggestClothing(conditions, activity, wet)}.`;
  }

  const lead = LIMITER_PHRASES[limiter](
    conditions,
    (penalties[limiter] ?? 0) >= SEVERE_PENALTY,
    activity,
  );
  if (isHazard(limiter, penalties)) return `${lead}.`;

  return `${lead}; ${suggestClothing(conditions, activity, isRaining(conditions))}.`;
}

// --- Forecast-derived advice ------------------------------------------------

// Locale-safe hour formatting. The previous version formatted a time and then
// split the string on a space to pull "AM" off the end, which breaks in any
// locale that doesn't use one, and in en-US on browsers whose ICU emits a
// narrow no-break space. `formatToParts` asks for the pieces directly.
function hourParts(date) {
  const parts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).formatToParts(date);
  return {
    hour: parts.find((p) => p.type === 'hour')?.value ?? String(date.getHours()),
    period: parts.find((p) => p.type === 'dayPeriod')?.value ?? '',
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

function dayQualifier(date, now) {
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  if (days <= 0) return '';
  if (days === 1) return 'Tomorrow ';
  return `${date.toLocaleDateString(undefined, { weekday: 'short' })} `;
}

// e.g. "8–10 AM", "Tomorrow 6–8 AM", or "11 AM–1 PM" across the noon boundary.
function formatHourRange(start, end, now) {
  const a = hourParts(start);
  const b = hourParts(end);
  const range =
    a.period && a.period === b.period
      ? `${a.hour}–${b.hour} ${b.period}`
      : `${[a.hour, a.period].filter(Boolean).join(' ')}–${[b.hour, b.period].filter(Boolean).join(' ')}`;
  return `${dayQualifier(start, now)}${range}`;
}

const WALKABLE_START_HOUR = 6;
const WALKABLE_END_HOUR = 22;

// The best `blockHours`-long stretch in the next `horizonHours`, restricted to
// hours anyone would actually walk. One hour by default, because a 30-minute
// walk fits inside one and a wider block just averages away the peak you were
// looking for. Returns the score too, because knowing that the best window is
// a 62 tells you whether waiting is worth it, which the bare time range never did.
export function findBestWindow(
  rows,
  { blockHours = 1, horizonHours = 24, now = new Date(), activity = DEFAULT_ACTIVITY } = {},
) {
  const horizonEnd = now.getTime() + horizonHours * 60 * 60 * 1000;
  const pool = rows.filter((row) => {
    const hour = row.time.getHours();
    return (
      row.time.getTime() <= horizonEnd &&
      hour >= WALKABLE_START_HOUR &&
      hour < WALKABLE_END_HOUR
    );
  });

  let best = null;
  for (let i = 0; i <= pool.length - blockHours; i++) {
    const block = pool.slice(i, i + blockHours);
    // Filtering to walkable hours leaves gaps (9 PM jumps to 6 AM), so drop any
    // block that isn't actually consecutive hours.
    const span = (block.at(-1).time - block[0].time) / (60 * 60 * 1000);
    if (span !== blockHours - 1) continue;

    const scores = block.map((row) => comfortScore(row, { activity }));
    if (scores.some((s) => s === null)) continue;
    const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    if (!best || average > best.average) {
      best = {
        average,
        start: block[0].time,
        end: new Date(block.at(-1).time.getTime() + 60 * 60 * 1000),
      };
    }
  }
  if (!best) return null;

  return {
    score: Math.round(best.average),
    start: best.start,
    // `end` so the chart can outline the same hours the card names in words.
    end: best.end,
    label: formatHourRange(best.start, best.end, now),
  };
}

const RAIN_RATE_THRESHOLD = 0.5; // mm/hr; below this you barely notice
const RAIN_CHANCE_THRESHOLD = 40; // %

// Trust the ensemble probability when it exists and fall back to the raw amount
// when it doesn't. Doing it the other way round announced "rain at 1 AM" off a
// trace of modelled precipitation the ensemble itself put at 2%.
function rainLikely(row) {
  const chance = row.precipitation_probability;
  return Number.isFinite(chance)
    ? chance >= RAIN_CHANCE_THRESHOLD
    : precipitationRate(row) >= RAIN_RATE_THRESHOLD;
}

// "Now" is answered from the same current-conditions block the score is
// computed from, rather than from the hourly row covering the current clock
// hour. Those are different measurements — a quarter-hour accumulation against
// a whole-hour one — and reading one here and the other there was half of how
// the tile and the ring came to disagree.
//
// The forecast scan then starts from the next full hour, because an onset in
// the hour already in progress got announced as "From 5 AM" at 5:45, naming a
// time that had gone.
export function rainOutlook(current, rows, { hours = 6, now = new Date() } = {}) {
  if (isRaining(current)) return `${describePrecipitation(current)} now`;

  const window = rows.filter((row) => row.time > now).slice(0, hours);
  if (!window.length) return '–';

  const onset = window.find(rainLikely);
  if (!onset) return `Dry next ${hours}h`;

  const { hour, period } = hourParts(onset.time);
  const at = [hour, period].filter(Boolean).join(' ');
  const chance = onset.precipitation_probability;
  return Number.isFinite(chance) ? `${at} · ${Math.round(chance)}%` : `From ${at}`;
}

// Current score against the closest reading to 24 hours ago.
export function comfortDelta(history, currentScore, now = new Date(), activity = DEFAULT_ACTIVITY) {
  if (!history.length || currentScore === null) return null;
  const target = now.getTime() - DAY_MS;
  const closest = history.reduce((best, row) =>
    Math.abs(row.time - target) < Math.abs(best.time - target) ? row : best,
  );
  // Anything much further out than a couple of hours isn't "yesterday".
  if (Math.abs(closest.time - target) > 3 * 60 * 60 * 1000) return null;
  const past = comfortScore(closest, { activity });
  return past === null ? null : currentScore - past;
}

// --- Historical context -----------------------------------------------------

// Fewer samples than this and the percentile is noise dressed up as a fact.
const MIN_CLIMATOLOGY_SAMPLES = 60;

// Mid-rank percentile, so a score sitting exactly on a pile of identical
// historical scores lands in the middle of that pile rather than above or below
// all of it.
export function percentileOf(value, samples) {
  if (!Number.isFinite(value) || samples.length < MIN_CLIMATOLOGY_SAMPLES) return null;
  let below = 0;
  let equal = 0;
  for (const sample of samples) {
    if (sample < value) below += 1;
    else if (sample === value) equal += 1;
  }
  return Math.round(((below + equal / 2) / samples.length) * 100);
}

function partOfMonth(day) {
  if (day <= 10) return 'early';
  if (day <= 20) return 'mid';
  return 'late';
}

function partOfDay(hour) {
  if (hour < 5) return 'nights';
  if (hour < 12) return 'mornings';
  if (hour < 17) return 'afternoons';
  if (hour < 21) return 'evenings';
  return 'nights';
}

// e.g. "mid-August afternoons"
export function climatologyPhrase(now) {
  const month = now.toLocaleDateString(undefined, { month: 'long' });
  return `${partOfMonth(now.getDate())}-${month} ${partOfDay(now.getHours())}`;
}
