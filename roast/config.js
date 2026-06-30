// Runtime flags and the roast recipe.

export const SIM =
  process.argv.includes('--simulate') || process.argv.includes('--sim');
export const QUICK = SIM || process.argv.includes('--quick');
// Roast the decaf profile instead of the regular one (see decafRecipe below).
export const DECAF = process.argv.includes('--decaf');
export const TITLE =
  (SIM ? 'KALEIDO M1  [SIM]' : 'KALEIDO M1 LITE') + (DECAF ? '  [DECAF]' : '');

// Regular-bean recipe. Selected by default; pass --decaf for decafRecipe.
const regularRecipe = {
  // Serial
  baudRate: 57600, // Change to 115200 if 57600 doesn't connect

  // Pre-roast self-test (runs once, just before preheat)
  preflight: {
    enabled: true,
    minTemp: 0, // sane bean-temp sensor range for the "sensors live" check
    maxTemp: 300,
    airTest: 40, // command these test values and confirm the machine echoes them
    drumTest: 50,
    testBurner: false, // briefly pulse the burner to verify it actuates (see notes)
    burnerTest: 20,
  },

  // Preheat (auto-PID mode)
  preheat: {
    target: 185, // °C — machine PID maintains this
    air: 30, // % FC
    drum: 90, // % RC
    stableSeconds: 300, // 5 minutes of stability
    toleranceDeg: 2, // ±°C counts as "stable"
  },

  // Applied on Enter when READY (switches to manual burner control).
  // target = the SV/setpoint we raise to *before* leaving auto-PID. On the
  // Kaleido the setpoint caps the burner even in manual mode, so it must be
  // lifted clear of the whole roast (well above the drop temp) or it strangles
  // BT at the old preheat target (~185). This mirrors "set SV to max before
  // switching to manual" in Artisan.
  chargeStep: {target: 250, burner: 50, air: 30},

  // Temperature-triggered burner/air tweaks during the climb. These fire on the
  // way up, but only after the post-charge turning point (see control.js), so a
  // stale ~185 reading at charge can't fire them. They're best-effort: if a run
  // never dips below a step's temp it just won't fire, which is harmless.
  tempSteps: [
    {temp: 150, burner: 45},
    {temp: 175, burner: 40, air: 40},
    {temp: 188, burner: 35},
  ],

  // End of roast. The instant BT crosses dropTemp we cut the burner + air, turn
  // the cooling fan on, and ding like crazy to drop the beans. This fires
  // INDEPENDENTLY of the tempSteps' arming, so the roast always ends safely even
  // if the lower steps never armed (e.g. BT never dipped below 150 in a dry run).
  // The drum stays at 90% (only quit stops it) so the beans tumble out.
  dropTemp: 204, // °C bean temp that ends the roast
  dropStep: {burner: 0, air: 0, cooling: 1, heater: 0},
  dropConfirmTicks: 2, // consecutive readings at/above dropTemp before auto-dropping
  // (debounce vs. thermocouple spikes; ~3s, well under 1°C of overshoot)

  dropTempDrop: 5, // °C fall after drop that confirms beans are out (silences the alarm)
  rorWindowSec: 30, // window for rate-of-rise calculation
};

// Decaf (EA-processed) recipe. Identical to the regular recipe except for the
// FC-region tempSteps and a slightly lower dropTemp. EA decaf's post-FC
// exothermic reaction is weaker, so without intervention the ROR stalls/bowls
// out mid-development; this profile is validated across several roasts.
export const decafRecipe = {
  ...regularRecipe,
  tempSteps: [
    {temp: 150, burner: 45},
    {temp: 173, burner: 35, air: 40}, // gentler approach into FC than regular (air 40, burner 35)
    // Decaf-specific FC-sustaining bump: this machine's FC start lands ~177-183°C,
    // and decaf's weaker exothermic phase needs the extra heat here to hold ROR
    // through development. Regular beans don't need this step.
    {temp: 178, burner: 40},
    {temp: 188, burner: 35}, // step back down ~60s post-FC for a controlled glide to drop
  ],
  dropTemp: 202, // City+ target; decaf doesn't need regular's extra 2°C
};

// The recipe loaded for this run. Defaults to regular; --decaf selects decaf.
export const recipe = DECAF ? decafRecipe : regularRecipe;

if (QUICK) recipe.preheat.stableSeconds = 15;
