/* ===========================================================
   One-array dataset (Sun, 8 planets, Pluto, major moons, 4 big asteroids)
   Radii in km; positions in AU (x,y), heliocentric ecliptic, 2-D.
   =========================================================== */

// ---------- constants & utilities ----------
const DEG = Math.PI / 180;
export const DAY_MS = 86_400_000;
export const AU_KM = 149_597_870.7;
const JD_UNIX_EPOCH = 2440587.5; // JD at 1970-01-01 00:00:00 UTC
const JD_J2000 = 2451545.0; // JD at 2000-01-01 12:00:00 TT (~UT ok)
const PHASE_REF_ISO = '2025-08-03T00:00:00Z'; // anchor for moon phases (optional)
const JD_PHASE_REF = Date.parse(PHASE_REF_ISO) / DAY_MS + JD_UNIX_EPOCH;

/** @param {number} ms */
const jdFromUnix = (ms) => ms / DAY_MS + JD_UNIX_EPOCH;

/** @param {number} d */
const rev = (d) => ((d % 360) + 360) % 360;

// Kepler solver (elliptic): returns true anomaly v and radius r (AU)
/**
 * @param {number} Mrad
 * @param {number} e
 * @param {number} aAU
 * */
function solveKepler(Mrad, e, aAU) {
  let E = Mrad + e * Math.sin(Mrad) * (1 + e * Math.cos(Mrad));
  for (let i = 0; i < 7; i++) {
    const f = E - e * Math.sin(E) - Mrad;
    const fp = 1 - e * Math.cos(E);
    E -= f / fp;
    if (Math.abs(f) < 1e-14) break;
  }
  const xv = Math.cos(E) - e;
  const yv = Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = aAU * Math.hypot(xv, yv);
  return {v, r};
}

// ---------- compact position factories ----------

// (1) Low-precision planetary elements -> position function
/** @param {{N0: number, Ndot: number, i0: number, idot: number, w0: number, wdot: number, a0: number, adot?: number, e0: number, edot: number, M0: number, Mdot: number}} el */
function positionFromElements(el) {
  /** @param {number} tMs */
  return (tMs) => {
    const d = jdFromUnix(tMs) - JD_J2000;
    const N = (el.N0 + (el.Ndot || 0) * d) * DEG;
    const i = (el.i0 + (el.idot || 0) * d) * DEG;
    const w = (el.w0 + (el.wdot || 0) * d) * DEG;
    const a = el.a0 + (el.adot || 0) * d;
    const e = el.e0 + (el.edot || 0) * d;
    const M = rev(el.M0 + el.Mdot * d) * DEG;

    const {v, r} = solveKepler(M, e, a);
    const cw = Math.cos(v + w),
      sw = Math.sin(v + w);
    const cN = Math.cos(N),
      sN = Math.sin(N),
      ci = Math.cos(i);
    return {
      x: r * (cN * cw - sN * sw * ci),
      y: r * (sN * cw + cN * sw * ci),
    };
  };
}

// (2) Pluto J2000 mean elements -> position function
function positionPluto() {
  const aAU = 39.48168677,
    e = 0.24880766,
    iDeg = 17.14175;
  const OmegaDeg = 110.30347,
    varpi = 224.06676,
    L0 = 238.92881;
  const omegaDeg = varpi - OmegaDeg; // arg of perihelion
  const M0 = L0 - varpi; // mean anomaly at J2000
  const n = 0.003973966; // deg/day
  /** @param {number} tMs */
  return (tMs) => {
    const dt = jdFromUnix(tMs) - JD_J2000;
    const Mdeg = M0 + n * dt;
    const {v, r} = solveKepler(Mdeg * DEG, e, aAU);
    const i = iDeg * DEG,
      w = omegaDeg * DEG,
      N = OmegaDeg * DEG;
    const cw = Math.cos(v + w),
      sw = Math.sin(v + w);
    const cN = Math.cos(N),
      sN = Math.sin(N),
      ci = Math.cos(i);
    return {x: r * (cN * cw - sN * sw * ci), y: r * (sN * cw + cN * sw * ci)};
  };
}

// (3) Circular moon around a parent -> position function
/** @param {{parentName: string, a_km: number, period_days: number, lambda0_deg: number, retrograde?: boolean}} param0 */
function positionMoonCircular({
  parentName,
  a_km,
  period_days,
  lambda0_deg = 0,
  retrograde = false,
}) {
  /** @param {number} tMs */
  return (tMs) => {
    const parentXY = getXY(parentName, tMs); // lazy lookup (defined below)
    const jd = jdFromUnix(tMs);
    const n = 360 / period_days; // deg/day
    const s = retrograde ? -1 : 1;
    const theta = (lambda0_deg + s * n * (jd - JD_PHASE_REF)) * DEG;
    const dx = (a_km / AU_KM) * Math.cos(theta);
    const dy = (a_km / AU_KM) * Math.sin(theta);
    return {x: parentXY.x + dx, y: parentXY.y + dy};
  };
}

// (4) Small body via time of perihelion -> position function
/** @param {{aAU: number, e: number, iDeg: number, omegaDeg: number, OmegaDeg: number, periodDays: number, periJD: number}} param0 */
function positionFromPerihelion({
  aAU,
  e,
  iDeg,
  omegaDeg,
  OmegaDeg,
  periodDays,
  periJD,
}) {
  /** @param {number} tMs */
  return (tMs) => {
    const jd = jdFromUnix(tMs);
    const n = 360 / periodDays; // deg/day
    const Mdeg = n * (jd - periJD); // M=0 at perihelion
    const {v, r} = solveKepler(Mdeg * DEG, e, aAU);
    const i = iDeg * DEG,
      w = omegaDeg * DEG,
      N = OmegaDeg * DEG;
    const cw = Math.cos(v + w),
      sw = Math.sin(v + w);
    const cN = Math.cos(N),
      sN = Math.sin(N),
      ci = Math.cos(i);
    return {x: r * (cN * cw - sN * sw * ci), y: r * (sN * cw + cN * sw * ci)};
  };
}

// ---------- single array of bodies (all data inlined) ----------
/** @type {Array<{name: string, radius_km: number, color: string, positionAt: (tMs: number) => {x: number, y: number}}>} */
export const CELESTIAL_BODIES = [
  // Sun + 8 planets
  {
    name: 'Sun',
    radius_km: 695700,
    color: '#ffcc33',
    positionAt: () => ({x: 0, y: 0}),
  },

  {
    name: 'Mercury',
    radius_km: 2440,
    color: '#9e9e9e',
    positionAt: positionFromElements({
      N0: 48.3313,
      Ndot: 3.24587e-5,
      i0: 7.0047,
      idot: 5.0e-8,
      w0: 29.1241,
      wdot: 1.01444e-5,
      a0: 0.387098,
      e0: 0.205635,
      edot: 5.59e-10,
      M0: 168.6562,
      Mdot: 4.0923344368,
    }),
  },
  {
    name: 'Venus',
    radius_km: 6052,
    color: '#d4b07b',
    positionAt: positionFromElements({
      N0: 76.6799,
      Ndot: 2.4659e-5,
      i0: 3.3946,
      idot: 2.75e-8,
      w0: 54.891,
      wdot: 1.38374e-5,
      a0: 0.72333,
      e0: 0.006773,
      edot: -1.302e-9,
      M0: 48.0052,
      Mdot: 1.6021302244,
    }),
  },
  {
    name: 'Earth',
    radius_km: 6371,
    color: '#2b6cff',
    positionAt: positionFromElements({
      N0: 0,
      Ndot: 0,
      i0: 0,
      idot: 0,
      w0: 282.9404,
      wdot: 4.70935e-5,
      a0: 1.0,
      e0: 0.016709,
      edot: -1.151e-9,
      M0: 356.047,
      Mdot: 0.9856002585,
    }),
  },
  {
    name: 'Mars',
    radius_km: 3390,
    color: '#c1440e',
    positionAt: positionFromElements({
      N0: 49.5574,
      Ndot: 2.11081e-5,
      i0: 1.8497,
      idot: -1.78e-8,
      w0: 286.5016,
      wdot: 2.92961e-5,
      a0: 1.523688,
      e0: 0.093405,
      edot: 2.516e-9,
      M0: 18.6021,
      Mdot: 0.5240207766,
    }),
  },
  {
    name: 'Jupiter',
    radius_km: 69911,
    color: '#c7a47d',
    positionAt: positionFromElements({
      N0: 100.4542,
      Ndot: 2.76854e-5,
      i0: 1.303,
      idot: -1.557e-7,
      w0: 273.8777,
      wdot: 1.64505e-5,
      a0: 5.20256,
      e0: 0.048498,
      edot: 4.469e-9,
      M0: 19.895,
      Mdot: 0.0830853001,
    }),
  },
  {
    name: 'Saturn',
    radius_km: 58232,
    color: '#d8c48a',
    positionAt: positionFromElements({
      N0: 113.6634,
      Ndot: 2.3898e-5,
      i0: 2.4886,
      idot: -1.081e-7,
      w0: 339.3939,
      wdot: 2.97661e-5,
      a0: 9.55475,
      e0: 0.055546,
      edot: -9.499e-9,
      M0: 316.967,
      Mdot: 0.0334442282,
    }),
  },
  {
    name: 'Uranus',
    radius_km: 25362,
    color: '#62d0e8',
    positionAt: positionFromElements({
      N0: 74.0005,
      Ndot: 1.3978e-5,
      i0: 0.7733,
      idot: 1.9e-8,
      w0: 96.6612,
      wdot: 3.0565e-5,
      a0: 19.18171,
      adot: -1.55e-8,
      e0: 0.047318,
      edot: 7.45e-9,
      M0: 142.5905,
      Mdot: 0.011725806,
    }),
  },
  {
    name: 'Neptune',
    radius_km: 24622,
    color: '#4b70dd',
    positionAt: positionFromElements({
      N0: 131.7806,
      Ndot: 3.0173e-5,
      i0: 1.77,
      idot: -2.55e-7,
      w0: 272.8461,
      wdot: -6.027e-6,
      a0: 30.05826,
      adot: 3.313e-8,
      e0: 0.008606,
      edot: 2.15e-9,
      M0: 260.2471,
      Mdot: 0.005995147,
    }),
  },

  // Pluto
  {
    name: 'Pluto',
    radius_km: 1188,
    color: '#c9d0e1',
    positionAt: positionPluto(),
  },

  // Moons (circular)
  {
    name: 'Moon',
    radius_km: 1737.4,
    color: '#bbbbbb',
    positionAt: positionMoonCircular({
      parentName: 'Earth',
      a_km: 384400,
      period_days: 27.321661,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Phobos',
    radius_km: 11.3,
    color: '#8b6b4f',
    positionAt: positionMoonCircular({
      parentName: 'Mars',
      a_km: 9377,
      period_days: 0.31891,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Deimos',
    radius_km: 6.2,
    color: '#9b7e69',
    positionAt: positionMoonCircular({
      parentName: 'Mars',
      a_km: 23460,
      period_days: 1.26244,
      lambda0_deg: 0,
    }),
  },

  {
    name: 'Io',
    radius_km: 1821.5,
    color: '#caa25b',
    positionAt: positionMoonCircular({
      parentName: 'Jupiter',
      a_km: 421800,
      period_days: 1.769138,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Europa',
    radius_km: 1560.8,
    color: '#dcd6d0',
    positionAt: positionMoonCircular({
      parentName: 'Jupiter',
      a_km: 671100,
      period_days: 3.551181,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Ganymede',
    radius_km: 2631.2,
    color: '#9a8b7a',
    positionAt: positionMoonCircular({
      parentName: 'Jupiter',
      a_km: 1070400,
      period_days: 7.154553,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Callisto',
    radius_km: 2410.3,
    color: '#6e6056',
    positionAt: positionMoonCircular({
      parentName: 'Jupiter',
      a_km: 1882700,
      period_days: 16.689017,
      lambda0_deg: 0,
    }),
  },

  {
    name: 'Titan',
    radius_km: 2575,
    color: '#c78b3c',
    positionAt: positionMoonCircular({
      parentName: 'Saturn',
      a_km: 1221870,
      period_days: 15.945421,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Rhea',
    radius_km: 764,
    color: '#cfcfcf',
    positionAt: positionMoonCircular({
      parentName: 'Saturn',
      a_km: 527040,
      period_days: 4.5175,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Iapetus',
    radius_km: 736,
    color: '#a9a399',
    positionAt: positionMoonCircular({
      parentName: 'Saturn',
      a_km: 3560850,
      period_days: 79.330183,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Dione',
    radius_km: 562,
    color: '#d9d9d9',
    positionAt: positionMoonCircular({
      parentName: 'Saturn',
      a_km: 377400,
      period_days: 2.736915,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Enceladus',
    radius_km: 252,
    color: '#f2f6f8',
    positionAt: positionMoonCircular({
      parentName: 'Saturn',
      a_km: 238020,
      period_days: 1.370218,
      lambda0_deg: 0,
    }),
  },

  {
    name: 'Miranda',
    radius_km: 235,
    color: '#d9d9d9',
    positionAt: positionMoonCircular({
      parentName: 'Uranus',
      a_km: 129900,
      period_days: 1.413479,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Ariel',
    radius_km: 579,
    color: '#cccccc',
    positionAt: positionMoonCircular({
      parentName: 'Uranus',
      a_km: 190900,
      period_days: 2.520379,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Umbriel',
    radius_km: 585,
    color: '#bfbfbf',
    positionAt: positionMoonCircular({
      parentName: 'Uranus',
      a_km: 266000,
      period_days: 4.144176,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Titania',
    radius_km: 788.9,
    color: '#b5b1ac',
    positionAt: positionMoonCircular({
      parentName: 'Uranus',
      a_km: 436300,
      period_days: 8.705867,
      lambda0_deg: 0,
    }),
  },
  {
    name: 'Oberon',
    radius_km: 761.4,
    color: '#a9a59f',
    positionAt: positionMoonCircular({
      parentName: 'Uranus',
      a_km: 583500,
      period_days: 13.463234,
      lambda0_deg: 0,
    }),
  },

  {
    name: 'Triton',
    radius_km: 1353.4,
    color: '#c8d3e6',
    positionAt: positionMoonCircular({
      parentName: 'Neptune',
      a_km: 354760,
      period_days: 5.876854,
      lambda0_deg: 0,
      retrograde: true,
    }),
  },

  // Main-belt asteroids (simple osculating via perihelion time)
  {
    name: 'Ceres',
    radius_km: 469.7,
    color: '#7f8b96',
    positionAt: positionFromPerihelion({
      aAU: 2.7672,
      e: 0.0788,
      iDeg: 10.586,
      OmegaDeg: 80.33,
      omegaDeg: 73.47,
      periodDays: 1681.34,
      periJD: 2459920.0963,
    }),
  },
  {
    name: 'Vesta',
    radius_km: 262.7,
    color: '#b9b7b3',
    positionAt: positionFromPerihelion({
      aAU: 2.363,
      e: 0.0888,
      iDeg: 7.139,
      OmegaDeg: 103.71,
      omegaDeg: 151.6,
      periodDays: 1326.8,
      periJD: 2459576.1719,
    }),
  },
  {
    name: 'Pallas',
    radius_km: 256,
    color: '#6e767b',
    positionAt: positionFromPerihelion({
      aAU: 2.7696,
      e: 0.2301,
      iDeg: 34.927,
      OmegaDeg: 172.9,
      omegaDeg: 310.86,
      periodDays: 1683.57,
      periJD: 2460010.5573,
    }),
  },
  {
    name: 'Hygiea',
    radius_km: 216.5,
    color: '#4a5257',
    positionAt: positionFromPerihelion({
      aAU: 3.144,
      e: 0.1096,
      iDeg: 3.832,
      OmegaDeg: 283.13,
      omegaDeg: 312.71,
      periodDays: 2036.0,
      periJD: 2461808.6597,
    }),
  },
];

const CELESTIAL_BODIES_BY_NAME = Object.fromEntries(
  CELESTIAL_BODIES.map((b) => [b.name, b]),
);

/**
 *
 * @param {string} name
 * @param {number} tMs
 */
function getXY(name, tMs) {
  const b = CELESTIAL_BODIES_BY_NAME[name];
  if (!b) throw new Error(`Body not found: ${name}`);
  return b.positionAt(tMs);
}
