// The Aranet4's moisture reading as a dew point, which is close to the same
// everywhere in the house and doesn't swing as the thermostat cycles.
//
// Units in and out are °F, like the rest of the app. The formula runs in °C.

const toC = (f) => (f - 32) / 1.8;
const toF = (c) => c * 1.8 + 32;

// Magnus formula, the usual one for weather.
const MAGNUS_B = 17.62;
const MAGNUS_C = 243.12;

export function dewPointF(tempF, rh) {
  const t = toC(tempF);
  const g = Math.log(rh / 100) + (MAGNUS_B * t) / (MAGNUS_C + t);
  return toF((MAGNUS_C * g) / (MAGNUS_B - g));
}
