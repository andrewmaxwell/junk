// ---------------------------------------------------------------------------
// How it feels inside.
//
// Outside, "feels like" is UTCI (comfort/js/thermal.js), which models someone
// walking in wind and sun. Indoors there is neither, and the person is sitting
// on the couch, so the right index is SET, the Standard Effective Temperature
// from ASHRAE 55: the temperature of a still, 50% humid room that would feel
// the same as this one. It's a two-node model of skin and core, run for an
// hour of exposure until the body settles.
//
// This is a port of pythermalcomfort's `two_nodes_gagge` (SET output only),
// and test/indoor.test.js checks it against that library. Indoors at 68-74°F
// humidity only moves it a degree or two; it earns its keep in muggy summers.
//
// Units in and out are °F, like the rest of the app. The model runs in °C.
// ---------------------------------------------------------------------------

const toC = (f) => (f - 32) / 1.8;
const toF = (c) => c * 1.8 + 32;

// Saturation vapour pressure in mmHg, the form the Gagge model is written in.
const satTorr = (tempC) => Math.exp(18.6686 - 4030.183 / (tempC + 235));

// Magnus formula, the usual one for weather. Used to carry a dew point measured
// in one room (the Aranet4) over to a temperature measured in another (the
// thermostat): moisture spreads through a house far more evenly than heat.
const MAGNUS_B = 17.62;
const MAGNUS_C = 243.12;

export function dewPointF(tempF, rh) {
  const t = toC(tempF);
  const g = Math.log(rh / 100) + (MAGNUS_B * t) / (MAGNUS_C + t);
  return toF((MAGNUS_C * g) / (MAGNUS_B - g));
}

export function relativeHumidity(tempF, dewF) {
  const t = toC(tempF);
  const d = toC(dewF);
  const ratio = Math.exp(
    (MAGNUS_B * d) / (MAGNUS_C + d) - (MAGNUS_B * t) / (MAGNUS_C + t),
  );
  return Math.min(100, 100 * ratio);
}

// What people actually wear indoors, from the outdoor temperature at 6am
// (Schiavon & Lee 2013, the model ASHRAE 55 adopts): about 1 clo in winter,
// 0.5 in summer.
export function clothingFor(outdoor6amF) {
  const t = toC(outdoor6amF);
  if (t < -5) return 1;
  if (t < 5) return 0.818 - 0.0364 * t;
  if (t < 26) return 10 ** (-0.1635 - 0.0066 * t);
  return 0.46;
}

// Sitting quietly on a couch.
const SEATED_MET = 1.1;
// Still indoor air. The model's floor is 0.1 m/s anyway.
const STILL_AIR = 0.1;

export function standardEffectiveTemperature({
  airF,
  rh,
  clo,
  radiantF = airF,
  met = SEATED_MET,
  airSpeed = STILL_AIR,
}) {
  const tdb = toC(airF);
  const tr = toC(radiantF);
  const vaporPressure = (rh * satTorr(tdb)) / 100;

  const v = Math.max(airSpeed, 0.1);
  const bodyWeight = 70; // kg
  const bodySurfaceArea = 1.8258; // m²
  const metFactor = 58.2;
  const sbc = 5.6697e-8;
  const cSw = 170; // regulatory sweating
  const cDil = 120; // vasodilation
  const cStr = 0.5; // vasoconstriction
  const tSkinNeutral = 33.7;
  const tCoreNeutral = 36.8;
  const bloodFlowNeutral = 6.3;

  let alfa = 0.1;
  const tBodyNeutral = alfa * tSkinNeutral + (1 - alfa) * tCoreNeutral;
  let tSkin = tSkinNeutral;
  let tCore = tCoreNeutral;
  let bloodFlow = bloodFlowNeutral;
  let eSkin = 0.1 * met;
  let qSensible = 0;
  let wettedness = 0;

  const rClo = 0.155 * clo;
  const fACl = 1 + 0.15 * clo;
  const lewis = 2.2;
  const rm = met * metFactor;
  let m = rm;
  const iCl = clo > 0 ? 0.45 : 1;
  const wMax = clo > 0 ? 0.59 * v ** -0.08 : 0.38 * v ** -0.29;

  let hCc = Math.max(3, 8.600001 * v ** 0.53);
  if (met > 0.85) hCc = Math.max(hCc, 5.66 * (met - 0.85) ** 0.39);

  let hR = 4.7;
  let rA = 1 / (fACl * (hR + hCc));
  let tOp = (hR * tr + hCc * tdb) / (hR + hCc);
  const qRes = 0.0023 * m * (44 - vaporPressure);
  const cRes = 0.0014 * m * (34 - tdb);

  // One step per minute for an hour.
  for (let minute = 1; minute < 60; minute++) {
    // Clothing surface temperature and the radiative coefficient depend on
    // each other, so iterate them to agreement. 0.7 is the fraction of a
    // seated body that radiates to the room.
    let tCl = (rA * tSkin + rClo * tOp) / (rA + rClo);
    for (let i = 0; i <= 150; i++) {
      hR = 4 * 0.95 * sbc * ((tCl + tr) / 2 + 273.15) ** 3 * 0.7;
      rA = 1 / (fACl * (hR + hCc));
      tOp = (hR * tr + hCc * tdb) / (hR + hCc);
      const next = (rA * tSkin + rClo * tOp) / (rA + rClo);
      const done = Math.abs(next - tCl) <= 0.01;
      tCl = next;
      if (done) break;
    }

    qSensible = (tSkin - tOp) / (rA + rClo);
    const coreToSkin = (tCore - tSkin) * (5.28 + 1.163 * bloodFlow);
    const sCore = m - coreToSkin - qRes - cRes;
    const sSkin = coreToSkin - qSensible - eSkin;
    tSkin += (sSkin * bodySurfaceArea) / (0.97 * alfa * bodyWeight * 60);
    tCore += (sCore * bodySurfaceArea) / (0.97 * (1 - alfa) * bodyWeight * 60);
    const tBody = alfa * tSkin + (1 - alfa) * tCore;

    const skinSignal = tSkin - tSkinNeutral;
    const warmSkin = Math.max(skinSignal, 0);
    const coldSkin = Math.max(-skinSignal, 0);
    const coreSignal = tCore - tCoreNeutral;
    const warmCore = Math.max(coreSignal, 0);
    const coldCore = Math.max(-coreSignal, 0);
    const warmBody = Math.max(tBody - tBodyNeutral, 0);

    bloodFlow = (bloodFlowNeutral + cDil * warmCore) / (1 + cStr * coldSkin);
    bloodFlow = Math.min(Math.max(bloodFlow, 0.5), 90);
    const sweat = Math.min(cSw * warmBody * Math.exp(warmSkin / 10.7), 500);
    let eRsw = 0.68 * sweat;

    const rEa = 1 / (lewis * fACl * hCc);
    const rEcl = rClo / (lewis * iCl);
    let eMax = (satTorr(tSkin) - vaporPressure) / (rEa + rEcl);
    if (eMax === 0) eMax = 0.001;
    let pRsw = eRsw / eMax;
    wettedness = 0.06 + 0.94 * pRsw;
    let eDiff = wettedness * eMax - eRsw;
    if (wettedness > wMax) {
      wettedness = wMax;
      pRsw = (wMax - 0.06) / 0.94;
      eRsw = pRsw * eMax;
      eDiff = 0.06 * (1 - pRsw) * eMax;
    }
    if (eMax < 0) {
      eDiff = 0;
      eRsw = 0;
      wettedness = wMax;
    }
    eSkin = eRsw + eDiff;
    m = rm + 19.4 * coldSkin * coldCore; // shivering
    alfa = 0.0417737 + 0.7451833 / (bloodFlow + 0.585417);
  }

  // The standard environment: still air, 50% humidity, and the clothing a
  // person at this activity would normally wear.
  const qSkin = qSensible + eSkin;
  const pSkin = satTorr(tSkin);
  let hCS = 3;
  if (met > 0.85) hCS = Math.max(hCS, 5.66 * (met - 0.85) ** 0.39);
  const hTS = hCS + hR;
  const rCloS = 1.52 / (met + 0.6944) - 0.1835;
  const rClS = 0.155 * rCloS;
  const fAClS = 1 + 0.25 * rCloS;
  const fClS = 1 / (1 + 0.155 * fAClS * hTS * rCloS);
  const iClS = ((0.45 * hCS) / hTS) * ((1 - fClS) / (hCS / hTS - fClS * 0.45));
  const hDS = 1 / (1 / (fAClS * hTS) + rClS);
  const hES = 1 / (1 / (lewis * fAClS * hCS) + rClS / (lewis * iClS));

  // Solve for the temperature at which that environment takes the same heat
  // from the skin as this one does (secant steps, like the reference).
  const error = (set) =>
    qSkin -
    hDS * (tSkin - set) -
    wettedness * hES * (pSkin - 0.5 * satTorr(set));
  let set = Math.round((tSkin - qSkin / hDS) * 100) / 100;
  for (let i = 0; i < 100; i++) {
    const e1 = error(set);
    const next = set - (0.0001 * e1) / (error(set + 0.0001) - e1);
    const done = Math.abs(next - set) <= 0.01;
    set = next;
    if (done) break;
  }
  return toF(set);
}
