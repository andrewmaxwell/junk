import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreComfort,
  comfortScore,
  comfortHeadline,
  comfortVerdict,
  comfortReason,
  comfortDelta,
  precipitationRate,
  isRaining,
  findBestWindow,
  rainOutlook,
  percentileOf,
  climatologyPhrase,
  describeHumidity,
  describeAirQuality,
  bandFor,
  feltTemperature,
  ACTIVITIES,
  DEFAULT_ACTIVITY,
  SCORE_BANDS,
  UNARCHIVED_FACTORS,
  FACTOR_LABELS,
} from '../js/comfort.js';
import { thermalStress } from '../js/thermal.js';
import { neutral, rowFeeling, hourly } from './helpers.js';

const { walk, sit } = ACTIVITIES;
// Mirrors NOTABLE_PENALTY in the model: below this a factor is not worth
// naming as the reason for a score.
const NOTABLE = 8;
const scoreOf = (conditions, activity = walk) => scoreComfort(conditions, { activity }).score;

// ---------------------------------------------------------------------------
// The regression this file exists for.
//
// 19 Aug 2026, Florissant MO, 9:29 AM: 75 °F air, 70 °F dew point, overcast,
// 4 mph wind, AQI 57. UTCI puts the felt temperature at 89 °F, one notch off
// *strong heat stress*, and a 1.9-mile walk in it was reported as unpleasant.
// The model called it 72 — "Good for a walk" — because the heat penalty was a
// quadratic wide enough not to bottom out early, and therefore far too flat
// through the middle of the range where real weather lives.
// ---------------------------------------------------------------------------
const HUMID_MORNING = neutral({
  temperature_2m: 75,
  dew_point_2m: 70,
  wind_speed_10m: 4,
  wind_gusts_10m: 15,
  cloud_cover: 100,
  uv_index: 0,
  us_aqi: 57,
  weather_code: 3,
  interval: 900,
  shortwave_radiation: 340,
  diffuse_radiation: 340,
  direct_radiation: 0,
  direct_normal_irradiance: 0,
  soil_temperature_0cm: 96,
});

test('the muggy 75 °F morning is not a good walk', () => {
  const felt = feltTemperature(HUMID_MORNING, walk);
  assert.ok(Math.abs(felt - 89) < 1.5, `felt ${felt}, expected about 89 °F`);

  const { score, limiter } = scoreComfort(HUMID_MORNING, { activity: walk });
  assert.equal(limiter, 'heat', 'heat has to be the stated reason');
  assert.ok(score < 70, `scored ${score}; "Good" starts at 70`);
  assert.ok(score >= 40, `scored ${score}; this is unpleasant, not dangerous`);
  assert.equal(comfortVerdict(score), 'Tolerable');
});

test('the same morning is still fine for sitting in the shade', () => {
  // The complaint was specifically about walking. Tightening the walk must not
  // drag the sitting answer down with it.
  assert.ok(scoreOf(HUMID_MORNING, sit) >= 85, scoreOf(HUMID_MORNING, sit));
  assert.ok(scoreOf(HUMID_MORNING, sit) > scoreOf(HUMID_MORNING, walk) + 25);
});

test('the reason names the mugginess', () => {
  const { limiter, penalties } = scoreComfort(HUMID_MORNING, {
    activity: walk,
  });
  const reason = comfortReason(HUMID_MORNING, limiter, penalties, walk);
  assert.match(reason, /muggy/i, reason);
});

// ---------------------------------------------------------------------------
// Score bands must agree with UTCI's own verdict.
//
// This is the invariant the bug violated: the app is built entirely on UTCI, so
// it may not hand out a word that contradicts the category UTCI assigns to the
// very same number. Scored on a clean row, where heat is the only factor in play.
// ---------------------------------------------------------------------------
const HEAT_CATEGORIES = [
  { felt: 78.8, stress: 'moderate heat stress', min: 65, max: 95 },
  { felt: 89.6, stress: 'strong heat stress', min: 30, max: 65 },
  { felt: 100.4, stress: 'very strong heat stress', min: 5, max: 30 },
  { felt: 114.8, stress: 'extreme heat stress', min: 0, max: 10 },
];

for (const { felt, stress, min, max } of HEAT_CATEGORIES) {
  test(`a walk in ${stress} scores between ${min} and ${max}`, () => {
    const row = rowFeeling(felt, walk);
    assert.equal(thermalStress(feltTemperature(row, walk)), stress, 'fixture drifted');
    const score = scoreOf(row, walk);
    assert.ok(score >= min && score <= max, `scored ${score}`);
  });
}

test('strong heat stress is never called Good or Great', () => {
  // The specific claim the screenshot falsified. Swept, not spot-checked,
  // because the failure was a whole region of the curve and not one point.
  for (let felt = 89.6; felt <= 100; felt += 0.5) {
    const score = scoreOf(rowFeeling(felt, walk), walk);
    assert.ok(score < 70, `felt ${felt} °F scored ${score}, which reads as "Good"`);
  }
});

// ---------------------------------------------------------------------------
// The second regression of the same shape.
//
// 26 Aug 2026, Florissant MO, 6:50 AM: 71 °F air, 67 °F dew point, clear, 4 mph
// wind, AQI 52. The card scored it 100 — "Just about ideal for a walk" — with
// its own dew point tile saying "Muggy" two inches away, and the walk was
// reported as sweaty. UTCI had the mugginess all along: it puts this morning
// 6.8 °F warmer in felt temperature than the same air at a 45 °F dew point.
// The band threw it away, because every felt temperature from 50 to 72 °F
// scored an identical zero and this one landed 1.4 °F inside the edge.
// ---------------------------------------------------------------------------
const MUGGY_DAWN = neutral({
  temperature_2m: 71,
  dew_point_2m: 67,
  wind_speed_10m: 4,
  wind_gusts_10m: 8,
  cloud_cover: 0,
  uv_index: 0,
  us_aqi: 52,
  weather_code: 0,
  interval: 900,
  shortwave_radiation: 40,
  diffuse_radiation: 30,
  direct_radiation: 10,
  direct_normal_irradiance: 60,
  soil_temperature_0cm: 70,
});

test('a muggy dawn inside the band is not a perfect score', () => {
  const felt = feltTemperature(MUGGY_DAWN, walk);
  assert.equal(thermalStress(felt), null, 'still inside UTCI\'s neutral band');
  assert.ok(felt < walk.band[1], `felt ${felt}, expected inside the walk band`);

  const { score, penalties } = scoreComfort(MUGGY_DAWN, { activity: walk });
  assert.ok(penalties.heat > 0, 'the band has to charge for its own shoulder');
  assert.ok(score < 100, `scored ${score} on air the card calls muggy`);
  assert.ok(score >= 85, `scored ${score}; this is a good walk, just a damp one`);
});

test('the same air, dried out, costs nothing thermally', () => {
  // The control the old model could not tell apart from the case above. If the
  // gap ever closes, the shoulder has stopped being about mugginess and started
  // being a tax on every warm morning.
  const dry = { ...MUGGY_DAWN, dew_point_2m: 45 };
  assert.equal(scoreComfort(dry, { activity: walk }).penalties.heat, 0);

  // Compared on clean air, so the dew point is the only thing moving. On this
  // morning's actual AQI of 52 the gap is smaller, but only because a penalty
  // shared by both sides pulls them together under the root-sum-square — the
  // thermal signal itself is untouched, which is what the assertion above says.
  const clean = (row) => scoreOf({ ...row, us_aqi: 15 }, walk);
  assert.ok(
    clean(dry) - clean(MUGGY_DAWN) >= 5,
    'the dew point has to be worth something inside the band',
  );
  // And a genuinely perfect morning — dry, clean, calm, no sun to speak of —
  // is still allowed to be a 100.
  assert.equal(clean(dry), 100);
});

test('the score never says ideal over air the tile calls muggy', () => {
  // The contradiction itself, which is a display bug and not a scoring one: the
  // penalty is under the notability floor, so there is no limiter and the
  // sentence used to fall through to "Just about ideal".
  const { limiter, penalties } = scoreComfort(MUGGY_DAWN, { activity: walk });
  assert.equal(limiter, null, 'fixture drifted; this is the no-limiter path');
  assert.equal(describeHumidity(MUGGY_DAWN.dew_point_2m), 'Muggy');

  const reason = comfortReason(MUGGY_DAWN, limiter, penalties, walk);
  assert.match(reason, /muggy/i, reason);
  assert.doesNotMatch(reason, /ideal/i, reason);
});

test('sitting in the shade is not told it is muggy when it costs nothing', () => {
  // The mugginess clause is gated on the heat penalty, so it can only speak
  // when the score is already agreeing with it. Sitting has a higher band and
  // this air is well inside its core.
  const { limiter, penalties } = scoreComfort(MUGGY_DAWN, { activity: sit });
  assert.equal(penalties.heat, 0, 'fixture drifted; this should be free for sitting');
  assert.match(comfortReason(MUGGY_DAWN, limiter, penalties, sit), /ideal/i);
});

test('the band has a free core and the shoulder only grows outward', () => {
  for (const activity of [walk, sit]) {
    const [lo, hi] = activity.band;
    const mid = (lo + hi) / 2;
    assert.equal(scoreComfort(rowFeeling(mid, activity), { activity }).penalties.heat, 0);
    assert.equal(scoreComfort(rowFeeling(mid, activity), { activity }).penalties.cold, 0);

    // Monotone from the middle of the band out to each edge, with the edge
    // itself costing something — that is the whole point of the shoulder.
    let previous = -1;
    for (let felt = mid; felt <= hi; felt += 0.5) {
      const heat = scoreComfort(rowFeeling(felt, activity), { activity }).penalties.heat;
      assert.ok(heat >= previous, `${activity.key} heat fell at felt ${felt} °F`);
      previous = heat;
    }
    assert.ok(previous > 0, `${activity.key} band edge is still free`);
  }
});

test('the stress anchors survived moving the ramp inward', () => {
  // The tolerances are documented as landing stress 1.0 on a named UTCI
  // category. Measuring the ramp from the core rather than the band edge was
  // only safe because it kept those two temperatures fixed, so this checks the
  // published claim and not the arithmetic that implements it.
  for (const [activity, felt, stress] of [
    [walk, walk.band[1] + walk.hotTolerance, 'strong heat stress'],
    [walk, walk.band[0] - walk.coldTolerance, 'strong cold stress'],
    [sit, sit.band[1] + sit.hotTolerance, 'very strong heat stress'],
    [sit, sit.band[0] - sit.coldTolerance, 'moderate cold stress'],
  ]) {
    const row = rowFeeling(felt, activity);
    assert.equal(thermalStress(feltTemperature(row, activity)), stress, 'fixture drifted');
    const { penalties } = scoreComfort(row, { activity });
    const thermal = Math.max(penalties.heat, penalties.cold);
    assert.ok(
      Math.abs(thermal - 50) < 3,
      `${activity.key} at ${stress} cost ${thermal}, not the documented half`,
    );
  }
});

test('the neutral band is quiet', () => {
  // UTCI reports no thermal stress from 48.2 to 78.8 °F, and a walk in the
  // middle of that has nothing wrong with it.
  const row = rowFeeling(65, walk);
  assert.equal(scoreComfort(row, { activity: walk }).limiter, null);
  assert.ok(scoreOf(row, walk) >= 95, scoreOf(row, walk));
});

test('the score falls monotonically as heat rises and as cold deepens', () => {
  for (const activity of [walk, sit]) {
    let previous = 101;
    for (let felt = 72; felt <= 120; felt += 2) {
      const score = scoreOf(rowFeeling(felt, activity), activity);
      assert.ok(score <= previous, `${activity.key} rose at felt ${felt} °F`);
      previous = score;
    }
    previous = 101;
    for (let felt = 48; felt >= -30; felt -= 2) {
      const score = scoreOf(rowFeeling(felt, activity), activity);
      assert.ok(score <= previous, `${activity.key} rose at felt ${felt} °F`);
      previous = score;
    }
  }
});

// ---------------------------------------------------------------------------
// Activity profiles
// ---------------------------------------------------------------------------

test('walking is the less heat-tolerant activity at the same felt temperature', () => {
  // UTCI is defined for a person walking at 4 km/h. A seated person makes about
  // half the internal heat, so they need it warmer to break even — and the
  // exposure scaling must never invert that, which is exactly what it used to do.
  assert.ok(sit.band[1] > walk.band[1], 'sit band should sit higher');
  assert.ok(sit.hotTolerance > walk.hotTolerance, 'sit should absorb more heat');
  for (const felt of [85, 95, 105]) {
    const row = rowFeeling(felt, walk);
    const heat = (activity) => scoreComfort(row, { activity }).penalties.heat;
    assert.ok(heat(walk) > heat(sit), `walking not penalised more at ${felt} °F`);
  }
});

test('sitting still is the less cold-tolerant activity', () => {
  assert.ok(sit.coldTolerance < walk.coldTolerance);
  const row = rowFeeling(35, walk);
  const cold = (activity) => scoreComfort(row, { activity }).penalties.cold;
  assert.ok(cold(sit) > cold(walk), `${cold(sit)} vs ${cold(walk)}`);
});

test('each tolerance lands on a named UTCI stress category', () => {
  // What makes the tolerances defensible rather than dialled in: the point that
  // costs half the score is a published category edge, not a number someone liked.
  assert.equal(thermalStress(walk.band[1] + walk.hotTolerance), 'strong heat stress');
  assert.equal(thermalStress(walk.band[0] - walk.coldTolerance), 'strong cold stress');
  assert.equal(thermalStress(sit.band[1] + sit.hotTolerance), 'very strong heat stress');
  assert.equal(thermalStress(sit.band[0] - sit.coldTolerance), 'moderate cold stress');
});

test('exposure length still scales UV, which is a genuine dose', () => {
  assert.ok(walk.uvRelief > sit.uvRelief, 'a shorter outing burns less');
  assert.ok(Number.isFinite(walk.uvRelief));
  // And it has to actually reach the score: the same sun costs a 30-minute walk
  // less than it would an hour of it.
  const base = rowFeeling(65, walk);
  const sun = (activity) => scoreComfort({ ...base, uv_index: 8 }, { activity }).penalties.sun;
  assert.ok(sun(walk) < alongUvForAnHour(8), `${sun(walk)}`);
});

// The curve read at face value, which is what an hour outside would cost.
const alongUvForAnHour = (uv) => {
  const curve = [[2, 0], [5, 5], [7, 14], [10, 30], [11, 35]];
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i - 1];
    const [x1, y1] = curve[i];
    if (uv <= x1) return y0 + ((y1 - y0) * (uv - x0)) / (x1 - x0);
  }
  return curve.at(-1)[1];
};

test('sitting in the shade skips UV and darkness', () => {
  const bright = neutral({ uv_index: 11, is_day: 0 });
  const { penalties } = scoreComfort(bright, { activity: sit });
  assert.ok(!('sun' in penalties), 'shade has no sunburn');
  assert.ok(!('dark' in penalties), 'sitting out after dark is the point');
  assert.ok(scoreComfort(bright, { activity: walk }).penalties.dark > 0);
});

test('the default activity is walking', () => {
  assert.equal(DEFAULT_ACTIVITY, walk);
  assert.equal(comfortScore(HUMID_MORNING), scoreOf(HUMID_MORNING, walk));
});

// ---------------------------------------------------------------------------
// Hazards
// ---------------------------------------------------------------------------

test('hazards short-circuit to zero regardless of how nice it otherwise is', () => {
  const perfect = rowFeeling(65, walk);
  for (const [over, limiter] of [
    [{ weather_code: 95 }, 'storm'],
    [{ weather_code: 99 }, 'storm'],
    [{ weather_code: 66 }, 'ice'],
    [{ weather_code: 57 }, 'ice'],
    [{ wind_gusts_10m: 55 }, 'gale'],
    [{ us_aqi: 210 }, 'air'],
  ]) {
    const result = scoreComfort({ ...perfect, ...over }, { activity: walk });
    assert.equal(result.score, 0, `${limiter} did not zero the score`);
    assert.equal(result.limiter, limiter);
    assert.equal(result.penalties[limiter], 100);
  }
});

test('a hazard reason gives no clothing advice', () => {
  // "Wait this one out; wear a shell" is the sentence contradicting itself.
  const storm = { ...rowFeeling(65, walk), weather_code: 95 };
  const { limiter, penalties } = scoreComfort(storm, { activity: walk });
  const reason = comfortReason(storm, limiter, penalties, walk);
  assert.doesNotMatch(reason, /wear/i, reason);
});

test('the hazard thresholds are edges, not approximations', () => {
  const base = rowFeeling(65, walk);
  assert.notEqual(scoreComfort({ ...base, wind_gusts_10m: 49.9 }).limiter, 'gale');
  assert.equal(scoreComfort({ ...base, wind_gusts_10m: 50 }).limiter, 'gale');
  // AQI 199 is still the largest ordinary penalty, so it is the limiter either
  // way; what changes at 200 is that it stops being survivable and zeroes out.
  assert.ok(scoreComfort({ ...base, us_aqi: 199 }).score > 0);
  assert.notEqual(scoreComfort({ ...base, us_aqi: 199 }).penalties.air, 100);
  assert.equal(scoreComfort({ ...base, us_aqi: 200 }).score, 0);
  assert.equal(scoreComfort({ ...base, us_aqi: 200 }).penalties.air, 100);
});

// ---------------------------------------------------------------------------
// Individual penalties
// ---------------------------------------------------------------------------

test('precipitation is normalised to mm/hr from either reporting interval', () => {
  assert.equal(precipitationRate({ precipitation: 2, interval: 3600 }), 2);
  assert.equal(precipitationRate({ precipitation: 0.5, interval: 900 }), 2);
  assert.equal(precipitationRate({ precipitation: undefined }), 0);
  assert.equal(precipitationRate({ precipitation: null }), 0);
  assert.equal(precipitationRate({}), 0);
});

test('a trace of rain is not rain', () => {
  const base = rowFeeling(65, walk);
  assert.equal(isRaining({ ...base, precipitation: 0.1 }), false);
  assert.equal(scoreComfort({ ...base, precipitation: 0.1 }).penalties.rain, 0);
  assert.equal(isRaining({ ...base, precipitation: 1 }), true);
  assert.ok(scoreComfort({ ...base, precipitation: 1 }).penalties.rain > 20);
});

test('the rain tile and the rain penalty answer the same question', () => {
  // They used to disagree: "Falling now" beside a score that had not noticed.
  const base = rowFeeling(65, walk);
  for (const precipitation of [0, 0.05, 0.2, 0.21, 0.5, 3, 20]) {
    const row = { ...base, precipitation };
    const wet = isRaining(row);
    const penalty = scoreComfort(row, { activity: walk }).penalties.rain;
    assert.equal(wet, penalty > 0, `disagreed at ${precipitation} mm`);
  }
});

test('snow is gentler than the same rate of rain', () => {
  const base = { ...rowFeeling(30, walk), precipitation: 4 };
  const rain = scoreComfort({ ...base, weather_code: 61 }, { activity: walk }).penalties.rain;
  const snow = scoreComfort({ ...base, weather_code: 73 }, { activity: walk }).penalties.rain;
  assert.ok(snow < rain, `${snow} vs ${rain}`);
});

test('wind is free only up to a light breeze', () => {
  const base = rowFeeling(65, walk);
  const windPenalty = (over) =>
    scoreComfort({ ...base, ...over }, { activity: walk }).penalties.wind;
  assert.equal(windPenalty({ wind_speed_10m: 7, wind_gusts_10m: 7 }), 0, 'exactly at the edge');
  assert.equal(windPenalty({ wind_speed_10m: 4, wind_gusts_10m: 6 }), 0, 'a light breeze is free');
  // A gentle breeze costs something, but not enough to be worth a sentence —
  // it may never become the stated reason for a score.
  const gentle = windPenalty({ wind_speed_10m: 12, wind_gusts_10m: 12 });
  assert.ok(gentle > 0 && gentle < 8, `a 12 mph breeze cost ${gentle}`);
  // The far anchor did not move when the near one did.
  assert.ok(Math.abs(windPenalty({ wind_speed_10m: 40, wind_gusts_10m: 40 }) - 100) < 0.01);
  assert.ok(windPenalty({ wind_speed_10m: 30, wind_gusts_10m: 30 }) > 20);
  // A gust counts for less than its speed because it is brief.
  assert.ok(
    windPenalty({ wind_speed_10m: 5, wind_gusts_10m: 30 }) <
      windPenalty({ wind_speed_10m: 30, wind_gusts_10m: 30 }),
  );
});

test('air quality follows the EPA category edges, not a straight line', () => {
  const base = rowFeeling(65, walk);
  const air = (us_aqi) => scoreComfort({ ...base, us_aqi }, { activity: walk }).penalties.air;
  assert.equal(air(20), 0, 'genuinely clean air is free');
  // The top of "Good" is not free any more, but it is under the notability
  // floor, so it can nudge a 100 and can never be the headline.
  assert.ok(air(50) > 0 && air(50) < NOTABLE, `the top of "Good" cost ${air(50)}`);
  assert.ok(Math.abs(air(100) - 12) < 0.01, 'top of "Moderate"');
  assert.ok(Math.abs(air(150) - 45) < 0.01, 'top of "Unhealthy for sensitive groups"');
  assert.ok(air(57) < 5, `AQI 57 is acceptable air and cost ${air(57)}`);
  assert.equal(air(undefined), 0, 'a failed request must not be scored as clean');
  assert.equal(air(null), 0);
});

test('UV is capped, because a hat exists', () => {
  const base = rowFeeling(65, walk);
  const sun = (uv_index) => scoreComfort({ ...base, uv_index }, { activity: walk }).penalties.sun;
  assert.equal(sun(0), 0);
  assert.equal(sun(2), 0, 'the top of "low" is the last free UV');
  // "Moderate" is where the advice to cover up starts, so it is where the cost
  // starts — gently, and never as the stated reason for the score.
  assert.ok(sun(5) > 0 && sun(5) < NOTABLE, `UV 5 cost ${sun(5)}`);
  assert.ok(sun(11) > 0);
  assert.ok(sun(20) <= 35, `sunburn alone must not dominate: ${sun(20)}`);
  assert.equal(sun(20), sun(50), 'capped');
});

// ---------------------------------------------------------------------------
// What 100 is allowed to mean.
//
// Every factor used to have a hard threshold below which it cost exactly
// nothing, and each threshold was set where the factor starts to *bother* you
// rather than where it stops being *perfect*. Root-sum-square then combined
// them, and the RSS of four zeros is zero — so a day with a 15 mph wind
// gusting to 21, UV 5, AQI 50 and a drizzle scored 100, and the card called it
// "Just about ideal for a walk".
// ---------------------------------------------------------------------------
test('a pile of small annoyances is not a perfect day', () => {
  // Felt temperature pinned to the middle of the core throughout, so this is
  // only ever measuring the non-thermal factors.
  const perfect = rowFeeling(61, walk, {
    wind_speed_10m: 4,
    wind_gusts_10m: 6,
    uv_index: 1,
    us_aqi: 15,
    precipitation: 0,
  });
  assert.equal(scoreOf(perfect, walk), 100, 'a genuinely perfect day is still a 100');

  const annoying = { ...perfect, wind_speed_10m: 15, wind_gusts_10m: 21, uv_index: 5, us_aqi: 50 };
  const { score, limiter } = scoreComfort(annoying, { activity: walk });
  assert.ok(score < 95, `a breezy, bright, hazy day scored ${score}`);
  // Every one of them is still individually minor: none may be promoted to the
  // stated reason for the score, or the card starts blaming a 15 mph wind.
  assert.equal(limiter, null, `${limiter} was named as the reason`);

  // But the sentence may not call it ideal either, which is the half of this
  // the limiter cannot answer.
  const reason = comfortReason(annoying, limiter, scoreComfort(annoying, { activity: walk }).penalties, walk);
  assert.doesNotMatch(reason, /ideal/i, reason);
  assert.match(comfortReason(perfect, null, scoreComfort(perfect, { activity: walk }).penalties, walk), /ideal/i);
});

test('a light breeze on clean air under a low sun is the last free day', () => {
  // The boundary of "perfect", spelled out so it cannot drift silently.
  const free = rowFeeling(61, walk, {
    wind_speed_10m: 7,
    wind_gusts_10m: 10,
    uv_index: 2,
    us_aqi: 25,
    precipitation: 0,
  });
  const { penalties } = scoreComfort(free, { activity: walk });
  for (const [factor, penalty] of Object.entries(penalties)) {
    assert.equal(penalty, 0, `${factor} charged ${penalty} on a perfect day`);
  }
  assert.equal(scoreOf(free, walk), 100);
});

test('darkness is a flat cost, not a dose', () => {
  const base = rowFeeling(65, walk);
  assert.equal(scoreComfort({ ...base, is_day: 1 }, { activity: walk }).penalties.dark, 0);
  assert.ok(scoreComfort({ ...base, is_day: 0 }, { activity: walk }).penalties.dark > 0);
});

// ---------------------------------------------------------------------------
// How penalties combine
// ---------------------------------------------------------------------------

test('one dealbreaker is not diluted by everything else being fine', () => {
  // The reason for root-sum-square over a weighted average: heavy rain at a
  // pleasant 68 °F must not average out to a decent score.
  const soaked = {
    ...rowFeeling(68, walk),
    precipitation: 15,
    weather_code: 65,
  };
  const score = scoreOf(soaked, walk);
  assert.ok(score < 25, `scored ${score}`);
  assert.equal(scoreComfort(soaked, { activity: walk }).limiter, 'rain');
});

test('several mild annoyances stack a little', () => {
  const base = rowFeeling(78, walk);
  const alone = scoreOf(base, walk);
  const piled = scoreOf({ ...base, us_aqi: 120, uv_index: 8, wind_speed_10m: 22 }, walk);
  assert.ok(piled < alone, `${piled} vs ${alone}`);
});

test('the score never leaves 0-100', () => {
  for (const felt of [-60, -20, 20, 65, 90, 130]) {
    for (const activity of [walk, sit]) {
      const score = scoreOf({ ...rowFeeling(felt, activity), us_aqi: 190, uv_index: 11 }, activity);
      assert.ok(score >= 0 && score <= 100, `${score} at felt ${felt}`);
      assert.equal(Number.isInteger(score), true);
    }
  }
});

test('missing air temperature yields no score rather than a wrong one', () => {
  for (const row of [{}, null, undefined, { temperature_2m: null }, { temperature_2m: 'x' }]) {
    assert.deepEqual(scoreComfort(row, { activity: walk }), {
      score: null,
      penalties: {},
      limiter: null,
    });
  }
});

test('excluding factors leaves both sides of a comparison on one scale', () => {
  // The ERA5 archive carries no UV and no air quality, so the historical
  // comparison has to score today without them too.
  const row = { ...rowFeeling(70, walk), uv_index: 11, us_aqi: 140 };
  const { penalties } = scoreComfort(row, {
    activity: walk,
    exclude: UNARCHIVED_FACTORS,
  });
  assert.ok(!('sun' in penalties));
  assert.ok(!('air' in penalties));
  assert.ok(
    scoreOf(row, walk) < comfortScore(row, { activity: walk, exclude: UNARCHIVED_FACTORS }),
  );
});

test('excluding a hazard stops it short-circuiting', () => {
  const stormy = { ...rowFeeling(65, walk), weather_code: 95 };
  assert.equal(scoreOf(stormy, walk), 0);
  assert.ok(comfortScore(stormy, { activity: walk, exclude: ['storm'] }) > 50);
});

test('the limiting factor is the largest penalty, if any is worth naming', () => {
  const base = rowFeeling(65, walk);
  assert.equal(scoreComfort(base, { activity: walk }).limiter, null, 'a fine day blames nothing');
  assert.equal(
    scoreComfort({ ...base, us_aqi: 55 }, { activity: walk }).limiter,
    null,
    'too small',
  );
  assert.equal(scoreComfort({ ...base, us_aqi: 145 }, { activity: walk }).limiter, 'air');
  const both = { ...rowFeeling(100, walk), us_aqi: 145 };
  assert.equal(scoreComfort(both, { activity: walk }).limiter, 'heat', 'the worse one wins');
});

// ---------------------------------------------------------------------------
// What the app says out loud
// ---------------------------------------------------------------------------

test('every band has a label, a colour and a reachable score', () => {
  for (let score = 0; score <= 100; score++) {
    const band = bandFor(score);
    assert.ok(band, `no band for ${score}`);
    assert.ok(band.label && band.color);
  }
  assert.equal(bandFor(100).label, 'Great');
  assert.equal(bandFor(69).label, 'Tolerable');
  assert.equal(bandFor(70).label, 'Good');
  assert.equal(bandFor(0).label, 'Avoid');
  // Descending and gapless, which is what lets the ring paint them as a track.
  SCORE_BANDS.forEach((band, i) => {
    if (i) assert.ok(SCORE_BANDS[i - 1].min > band.min, 'bands out of order');
  });
});

test('the headline never contradicts the number beside it', () => {
  for (let felt = -20; felt <= 120; felt += 5) {
    const row = rowFeeling(felt, walk);
    const score = scoreOf(row, walk);
    const headline = comfortHeadline(score, walk);
    if (score >= 70) assert.match(headline, /Good|Great/, `${score}: ${headline}`);
    if (score < 30) assert.match(headline, /Bad/, `${score}: ${headline}`);
    assert.match(headline, /for a walk/);
  }
  assert.equal(comfortHeadline(null), 'No data');
  assert.equal(comfortVerdict(null), '–');
});

test('the reason always ends in a sentence and names a factor it can label', () => {
  for (const over of [
    {},
    { precipitation: 5, weather_code: 61 },
    { uv_index: 11 },
    { us_aqi: 160 },
    { wind_speed_10m: 35, wind_gusts_10m: 45 },
    { is_day: 0 },
    { weather_code: 95 },
    { temperature_2m: 105, dew_point_2m: 78 },
    { temperature_2m: 5, dew_point_2m: 0 },
  ]) {
    const row = neutral(over);
    const { limiter, penalties } = scoreComfort(row, { activity: walk });
    const reason = comfortReason(row, limiter, penalties, walk);
    assert.ok(reason.endsWith('.'), reason);
    assert.ok(reason.length > 10, reason);
    if (limiter) assert.ok(FACTOR_LABELS[limiter], `no label for ${limiter}`);
  }
  assert.equal(comfortReason({}, null, {}, walk), '');
});

test('drizzle with no limiter still admits it is wet', () => {
  // "Just about ideal" beside a tile reading "Drizzle" was the contradiction.
  const damp = {
    ...rowFeeling(65, walk),
    precipitation: 0.4,
    weather_code: 53,
  };
  assert.equal(scoreComfort(damp, { activity: walk }).limiter, null, 'fixture drifted');
  const reason = comfortReason(damp, null, {}, walk);
  assert.match(reason, /Drizzle/, reason);
  assert.match(reason, /shell/, reason);
});

test('a warm nudge and a heat emergency are not described the same way', () => {
  const say = (felt, over = {}) => {
    const row = { ...rowFeeling(felt, walk), ...over };
    const { limiter, penalties } = scoreComfort(row, { activity: walk });
    return comfortReason(row, limiter, penalties, walk);
  };
  assert.match(say(80), /manageable/i);
  assert.doesNotMatch(say(105, { dew_point_2m: 50 }), /manageable/i);
  assert.match(say(15), /Cold/);
});

test('humidity and air quality read out in plain words', () => {
  assert.equal(describeHumidity(45), 'Dry');
  assert.equal(describeHumidity(55), 'Comfortable');
  assert.equal(describeHumidity(62), 'Slightly muggy');
  assert.equal(describeHumidity(67), 'Muggy');
  assert.equal(describeHumidity(70), 'Oppressive');
  assert.equal(describeHumidity(undefined), '–');
  assert.equal(describeAirQuality(50), 'Good');
  assert.equal(describeAirQuality(57), 'Moderate');
  assert.equal(describeAirQuality(201), 'Hazardous');
  assert.equal(describeAirQuality(null), '–');
});

test('mugginess costs real score on its own', () => {
  // Air temperature held still at 82 °F, dew point swept from dry to oppressive.
  // Everything humidity does has to arrive through UTCI, so this is the check
  // that it arrives at all — and that it arrives as more than a rounding error.
  let previous = 101;
  for (let dew_point_2m = 45; dew_point_2m <= 77; dew_point_2m += 2) {
    const score = scoreOf(neutral({ temperature_2m: 82, dew_point_2m }), walk);
    assert.ok(score <= previous, `score rose at a ${dew_point_2m} °F dew point`);
    previous = score;
  }
  const dry = scoreOf(neutral({ temperature_2m: 82, dew_point_2m: 45 }), walk);
  const oppressive = scoreOf(neutral({ temperature_2m: 82, dew_point_2m: 77 }), walk);
  assert.equal(describeHumidity(77), 'Oppressive');
  assert.ok(
    dry - oppressive > 20,
    `only ${dry - oppressive} points between ${dry} and ${oppressive}`,
  );
});

// ---------------------------------------------------------------------------
// Forecast-derived advice
// ---------------------------------------------------------------------------

test('the best window is the best walkable hour, with its score', () => {
  const now = new Date('2026-08-19T06:00:00');
  // Only one hour is inside the comfortable band, so there is a single winner
  // to find. Three tied hours would only test which one the loop happens to keep.
  const rows = hourly(
    [95, 92, 66, 98, 100, 105, 103].map((temperature_2m) => ({
      temperature_2m,
    })),
    now,
  );
  const best = findBestWindow(rows, { now, activity: walk });
  assert.ok(best);
  assert.equal(best.start.getHours(), 8, 'the 66 °F hour');
  assert.equal(best.end.getHours(), 9, 'end is exclusive of the next hour');
  assert.ok(best.score > 90, best.score);
  assert.match(best.label, /8/);
});

test('the best window never suggests the middle of the night', () => {
  const now = new Date('2026-08-19T20:00:00');
  const rows = hourly(
    Array.from({ length: 20 }, (_, i) => ({
      temperature_2m: i >= 4 && i <= 8 ? 68 : 95,
    })),
    new Date('2026-08-19T20:00:00'),
  );
  const best = findBestWindow(rows, { now, activity: walk });
  assert.ok(best);
  const hour = best.start.getHours();
  assert.ok(hour >= 6 && hour < 22, `suggested ${hour}:00`);
});

test('the best window returns null when there is nothing to pick from', () => {
  assert.equal(findBestWindow([], { now: new Date('2026-08-19T06:00:00') }), null);
});

test('rain now is reported from the current block, not the hourly row', () => {
  const now = new Date('2026-08-19T06:30:00');
  const raining = neutral({
    precipitation: 1,
    interval: 900,
    weather_code: 61,
  });
  assert.match(rainOutlook(raining, hourly([{}, {}]), { now }), /now$/);
});

test('rain onset is announced from the ensemble probability when there is one', () => {
  const now = new Date('2026-08-19T06:30:00');
  const dry = neutral();
  const rows = hourly(
    [
      { precipitation_probability: 5 },
      { precipitation_probability: 10 },
      { precipitation_probability: 80 },
    ],
    new Date('2026-08-19T07:00:00'),
  );
  const outlook = rainOutlook(dry, rows, { now, hours: 6 });
  assert.match(outlook, /9/, outlook);
  assert.match(outlook, /80%/, outlook);
});

test('a trace the ensemble puts at 2% is not announced as rain', () => {
  const now = new Date('2026-08-19T06:30:00');
  const rows = hourly(
    [{ precipitation: 0.3, precipitation_probability: 2 }],
    new Date('2026-08-19T07:00:00'),
  );
  assert.equal(rainOutlook(neutral(), rows, { now, hours: 6 }), 'Dry next 6h');
});

test('a day-over-day delta needs a reading from about a day ago', () => {
  const now = new Date('2026-08-19T12:00:00');
  const yesterday = [{ ...rowFeeling(95, walk), time: new Date('2026-08-18T12:00:00') }];
  const delta = comfortDelta(yesterday, 100, now, walk);
  assert.ok(delta > 0, `today should be better: ${delta}`);
  const stale = [{ ...rowFeeling(95, walk), time: new Date('2026-08-10T12:00:00') }];
  assert.equal(comfortDelta(stale, 100, now, walk), null, 'a week ago is not yesterday');
  assert.equal(comfortDelta([], 100, now, walk), null);
  assert.equal(comfortDelta(yesterday, null, now, walk), null);
});

test('a percentile needs enough history to be a fact', () => {
  const samples = Array.from({ length: 100 }, (_, i) => i);
  assert.equal(percentileOf(50, samples), 51);
  assert.equal(percentileOf(0, samples), 1, 'mid-rank, not zero');
  assert.equal(percentileOf(50, samples.slice(0, 30)), null, 'too few samples');
  assert.equal(percentileOf(null, samples), null);
  // A pile of identical scores puts you in the middle of the pile.
  assert.equal(percentileOf(7, Array(100).fill(7)), 50);
});

test('the climatology phrase reads like English', () => {
  assert.match(climatologyPhrase(new Date('2026-08-19T14:00:00')), /^mid-\w+ afternoons$/);
  assert.match(climatologyPhrase(new Date('2026-08-05T08:00:00')), /^early-\w+ mornings$/);
  assert.match(climatologyPhrase(new Date('2026-08-25T23:00:00')), /^late-\w+ nights$/);
  assert.match(climatologyPhrase(new Date('2026-08-25T02:00:00')), /^late-\w+ nights$/);
  assert.match(climatologyPhrase(new Date('2026-08-25T19:00:00')), /^late-\w+ evenings$/);
});
