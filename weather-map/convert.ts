/*
cd weather-map
npx tsx watch convert.ts
*/

import fs from 'fs';
import {Dataset} from 'h5wasm/node';

/**
 * Compute a 0–100 outdoor comfort score for a single point, including precipitation effects.
 *
 * Inputs (NLDAS conventions):
 * - airTempK          (Tair):   Air temperature [K]
 * - specificHumidity  (Qair):   Specific humidity [kg/kg]
 * - surfacePressurePa (PSurf):  Surface pressure [Pa]
 * - windZonalMps      (Wind_E): Zonal wind component [m/s]
 * - windMeridMps      (Wind_N): Meridional wind component [m/s]
 * - shortwaveDownWm2  (SWdown): Downward shortwave radiation [W/m²]
 * - precipKgM2PerHr   (Rainf):  Hourly precip total [kg/m²/hr] (≡ mm/hr). Use 0 if unknown.
 *
 * Assumptions:
 * - Full-sun exposure (reduce by setting SWdown=0 to represent shade).
 * - No-data is -9999 (returns NaN).
 * - Neutral comfort ~22 °C with width 10 °C. Tunable below.
 */
// ----- Config (tunable) -----
const NODATA = -9999;

// Thermal comfort scoring (Gaussian)
const neutralC = 22; // °C where most feel best (light clothing, light activity)
const widthC = 10; // how quickly comfort declines away from neutral

// Sun correction (~ °C per 100 W/m² of SWdown)
const kSunPer100Wm2 = 0.7;

// Rain thermal cooling (subtract from feels-like): grows with rain rate and wind
// Chosen conservatively so even heavy rain cools by only a few °C.
const rainCoolingPerMmHrC = 0.12; // °C per (mm/hr)
const rainCoolingWindFactorPerMps = 0.06; // multiplier per m/s wind
const rainCoolingCapMmHr = 10; // cap intensity in mm/hr for thermal cooling

// Rain exposure penalty (points removed from score), stronger with wind-driven rain
const rainPenaltyMaxPoints = 55; // max points rain can remove
const rainPenaltyScaleMmHr = 2.0; // e-fold scale of intensity (mm/hr)
const rainPenaltyWindAmplificationPerMps = 0.25; // boosts "effective" rain with wind

// Snow tweak (if <= 0 °C, shift effects a bit)
const snowTempThresholdC = 0; // ≤0 °C likely snow/sleet
const snowCoolingMultiplier = 0.6; // snow wets less than rain → less evaporative cooling
const snowPenaltyMultiplier = 0.85; // snow still unpleasant, but usually less soaking than rain

export function comfortScoreForPoint(
  airTempK: number,
  specificHumidity: number,
  surfacePressurePa: number,
  windZonalMps: number,
  windMeridMps: number,
  shortwaveDownWm2: number,
  precipKgM2PerHr: number,
): number {
  // ----- Validate inputs -----
  const inputs = [
    airTempK,
    specificHumidity,
    surfacePressurePa,
    windZonalMps,
    windMeridMps,
    shortwaveDownWm2,
    precipKgM2PerHr,
  ];
  if (inputs.some((v) => v === NODATA || !Number.isFinite(v))) return NaN;

  // ----- Core meteorology -----
  const airTempC = airTempK - 273.15; // °C
  const windSpeedMps = Math.hypot(windZonalMps, windMeridMps);

  // Vapour pressure from specific humidity and pressure:
  // e (Pa) = (q * p) / (0.622 + 0.378*q)
  const vapourPressurePa =
    (specificHumidity * surfacePressurePa) / (0.622 + 0.378 * specificHumidity);
  const vapourPressureHpa = vapourPressurePa / 100; // hPa for Apparent Temp formula

  // ----- Base "feels-like": Apparent Temperature (warm) vs Wind Chill (cold) -----
  const useWindChill = airTempC <= 10 && windSpeedMps * 3.6 >= 4.8; // 4.8 km/h threshold
  let baseFeelsLikeC: number;

  if (useWindChill) {
    const windKph = windSpeedMps * 3.6;
    const windKphPow = Math.pow(windKph, 0.16);
    baseFeelsLikeC =
      13.12 +
      0.6215 * airTempC -
      11.37 * windKphPow +
      0.3965 * airTempC * windKphPow;
  } else {
    // Australian Apparent Temperature (shade): T + 0.33*e(hPa) - 0.70*v(m/s) - 4.0
    baseFeelsLikeC =
      airTempC + 0.33 * vapourPressureHpa - 0.7 * windSpeedMps - 4.0;
  }

  // Sun correction from SWdown (already accounts for clouds; clamp non-negative)
  const S = Math.max(0, shortwaveDownWm2);
  const deltaSunC = kSunPer100Wm2 * (S / 100);

  // ----- Precipitation effects -----
  const rainRateMmHr = Math.max(0, precipKgM2PerHr); // kg/m²/hr == mm/hr
  const isSnowy = airTempC <= snowTempThresholdC;

  // Thermal cooling due to wetting/evaporation; stronger with wind, capped at heavy rain
  const rainCoolingMmHr = Math.min(rainRateMmHr, rainCoolingCapMmHr);
  const coolingMultiplier = 1 + rainCoolingWindFactorPerMps * windSpeedMps;
  let deltaRainC = -rainCoolingPerMmHrC * rainCoolingMmHr * coolingMultiplier;
  if (isSnowy) deltaRainC *= snowCoolingMultiplier;

  // Exposure/discomfort penalty (score points) increases with wind-driven rain
  const effectiveRainForPenalty =
    rainRateMmHr * (1 + rainPenaltyWindAmplificationPerMps * windSpeedMps);
  let rainPenaltyPoints =
    rainPenaltyMaxPoints *
    (1 - Math.exp(-effectiveRainForPenalty / rainPenaltyScaleMmHr));
  if (isSnowy) rainPenaltyPoints *= snowPenaltyMultiplier;

  // ----- Final feels-like and score -----
  const feelsLikeC = baseFeelsLikeC + deltaSunC + deltaRainC;

  // Base comfort from temperature alone
  const baseScore =
    100 * Math.exp(-Math.pow(feelsLikeC - neutralC, 2) / (2 * widthC * widthC));

  // Subtract exposure penalty from precipitation
  const finalScore = Math.max(0, Math.min(100, baseScore - rainPenaltyPoints));

  return finalScore;
}

const width = 464;
const height = 224;

const go = async () => {
  const h5wasm = await import('h5wasm/node');
  await h5wasm.ready;

  const counts = new Float32Array(width * height);
  const sums = new Float32Array(width * height);
  const dayTimeCounts = new Float32Array(width * height);
  const dayTimeSums = new Float32Array(width * height);

  for (const file of fs.readdirSync('data')) {
    if (!file.endsWith('.nc')) continue;
    console.log('processing', file);

    const f = new h5wasm.File(`data/${file}`, 'r');
    const {Tair, Qair, PSurf, Wind_E, Wind_N, SWdown, Rainf} =
      Object.fromEntries(
        f
          .keys()
          .map((key) => [key, (f.get(key) as Dataset).value as Float32Array]),
      );

    for (let i = 0; i < width * height; i++) {
      const score =
        comfortScoreForPoint(
          Tair[i],
          Qair[i],
          PSurf[i],
          Wind_E[i],
          Wind_N[i],
          SWdown[i],
          Rainf[i] * 3600, // convert from kg/m²/s to kg/m²/hr
        ) > 90
          ? 1
          : 0;
      if (SWdown[i] > 5) {
        dayTimeSums[i] += score;
        dayTimeCounts[i]++;
      }
      sums[i] += score;
      counts[i]++;
    }

    f.close();
  }

  const results = sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : 0));
  fs.writeFileSync('comfort-scores.json', JSON.stringify([...results]));

  const dayTimeResults = dayTimeSums.map((sum, i) =>
    dayTimeCounts[i] > 0 ? sum / dayTimeCounts[i] : 0,
  );
  fs.writeFileSync(
    'daytime-comfort-scores.json',
    JSON.stringify([...dayTimeResults]),
  );
  console.log('done');
};

go();
