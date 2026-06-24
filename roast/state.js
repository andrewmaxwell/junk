// Shared, mutable controller state — a single object imported everywhere.

export const s = {
  phase: 'CONNECTING', // CONNECTING PREFLIGHT ABORTED PREHEATING READY ROASTING COOLING DONE
  // COOLING covers the whole post-drop period; beansOut just silences the alarm.
  sid: null,
  BT: null, // bean temp
  ET: null, // exhaust temp
  AT: null, // ambient temp
  TS: null, // target temp (PID setpoint)
  HP: null, // burner % (live PID duty in auto, setpoint in manual)
  FC: null, // roasting air / fan %
  RC: null, // drum %
  AH: null, // auto-PID 0/1
  HS: null, // heater master switch 0/1
  CS: null, // cooling fan 0/1

  port: null,
  chargeTime: null,
  endTime: null,
  firstCrack: null,
  stableStart: null,
  coolingBaseTemp: null,
  beansOut: false, // set once BT confirms the beans left the drum (silences the alarm)
  beansOutTime: null,
  cmdHP: null, // burner % we last commanded (manual nudge base; echo lags this)
  dropConfirm: 0, // consecutive ticks BT has been at/above dropTemp (noise debounce)
  armed: false, // temp-step triggers start only after the post-charge turning point
  turningPoint: null, // {time, BT} — coolest point after charge
  nextStep: 0,
  stepTimes: [], // ms timestamp each tempStep fired (for the checklist); index-aligned
  recording: [],
  checks: [],
  exported: false,
};

// Machine readings cleared whenever the connection drops.
export const READING_VARS = [
  'BT',
  'ET',
  'AT',
  'TS',
  'HP',
  'FC',
  'RC',
  'AH',
  'HS',
  'CS',
];

export function resetReadings() {
  s.sid = null;
  for (const k of READING_VARS) s[k] = null;
}
