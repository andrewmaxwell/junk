# kaleido

Controller for a Kaleido M1 LITE roaster. Read `README.md` first for what it does. This file covers how it's built and the hard-won facts about the machine.

This project is **not** a plain static page like the rest of the repo. It needs a local Node server (the `serialport`, `ws`, and `express` packages from the root `package.json`) because the server owns the serial port. The browser UI is a plain ES module page served by that server. Browser libraries still come from CDNs.

## Layout

Files marked * aren't built yet.

```
server/
  main.js        node kaleido/server/main.js [--sim [--autopilot] [--speed 10]]
                 monitor (read-only on real hardware), or a whole simulated session;
                 --selftest [--no-heat] [--no-cable] runs selftest.js
  clock.js       real clock (with a speed-up for the sim) and a virtual clock for tests
  protocol.js    encode {[TAG VAL]}, parse {sid,VAR:val,...}
  port.js        the USB serial transport (finds the port, maps tty→cu)
  machine.js     desired-state reconciler + reconnect loop (see below)
  session.js     phases, charge detection, alarms; everything the roaster does comes from desiredState()
  procedure.js   loads/validates procedures; RoastTracker (TP, steps, drop); preheat stability; RoR
  autopilot.js   a simulated person (charges, marks FC, discharges) for tests and the demo
  sim.js         simulated roaster: same interface as port.js, plus the machine's quirks
  physics.js     the thermal model sim.js runs
  fitSim.js      fits physics.js to logs/ → simParams.json (rerun after adding logs)
  alog.js        .alog reader/writer; buildAlog turns a batch record into an Artisan profile
  alogTemplate.json  display + device setup copied from a real Artisan log (#37); regenerate with
                 node kaleido/server/alog.js --make-template <alog>
  recorder.js    numbers roasts, writes .alog + .json sidecar during and after each roast,
                 patches weight out / tasting notes in later
  selftest.js    empty-drum hardware checks (main.js --selftest); reports go to selftests/
test/            node --test kaleido/test/*.test.js
index.html, main.js *   browser UI (chart, buttons, speech, weights, bean picker, mic pop hints)
preheat.json          preheat settings + stability rule, shared by every bean
procedures/<bean>.json
beans.json            canonical bean slugs → name, supplier, old filename aliases
logs/                 .alog + .json sidecar per roast
logs-sim/             what --sim runs write (gitignored)
selftests/            self-test reports from the real roaster
analyze.js *          prints a compact summary of one or more roasts for Claude
```

## Session behavior

- **Ready** means the machine has confirmed every setting, BT has stayed within 1.5 °C of SV for 3 minutes, and ET isn't *rising* faster than 0.5 °C/min. Falling ET is fine: between batches you charged with ET still falling 0.5–1.5 °C/min from the last roast.
- **Charge** is only ever auto-detected; there's no button (the user's choice). It needs a bean chosen first. Without one, the app says "choose the next beans" and ignores any BT drop. Detection: 2 readings 5 °C or more below the BT average from 10–30 seconds earlier. A real charge drops BT about 70 °C, so there's plenty of margin. The roast clock is backdated to the last reading before the fall.
- **Turning point** is the first reading 2 °C above the lowest BT so far. Steps arm only after it.
- **Triggers** (steps and drop) need 3 consecutive readings at or above their temperature. At ~5 °C/min near the drop, that lands about 0.2–0.5 °C past the target.
- **At drop**, the app sends `HP 0` while still in manual mode, then switches to the preheat settings with the cooling fan on. It repeats "Drop now!" every 5 s until the beans are out: you press the button, or BT falls 10 °C below the drop temperature (about 12 s on the real machine). The batch record closes a minute after the drop, and `batchComplete` fires.
- **Alerts never change the heat.** A stall alert fires when RoR has been under 1 °C/min for a minute after the turning point. A long-roast alert fires at 16 minutes. A stuck-control alert fires after 8 s.
- **Shutdown** turns the heater off and runs air at 100% with the drum at 90% until BT is under 60 °C. Then everything goes off, and `off` fires only after the machine confirms it.
- **Saving state.** `toJSON()` and `start(saved)` let a restarted server resume mid-roast without firing any step twice. `main.js` doesn't save to disk yet; that comes with the UI in step 5.

## Simulator

`sim.js` speaks the real protocol and copies the machine's quirks:
- it randomly drops commands (`dropRate`)
- `HS` and `CS` are missing from replies until set
- `HP` reads back the PID's duty in auto mode
- `TS` caps the burner in manual mode

`close()` is a cable pull and `muted` is a hung adapter. In both cases the simulated machine keeps running on its last settings.

The thermal model (`physics.js`) has two fitted parameter sets, `empty` and `roast`, because one set couldn't fit both an empty drum and a loaded one. The drum metal temperature isn't measured, so at charge it's reset to `ET + drumOffset`, the same assumption the fit makes. The roast set is fit **closed loop**: each logged burner and air change is applied when the simulated BT reaches the temperature where it really happened, which is how the controller will drive it. Fit quality as of 2026-10-04:
- Roasts: about 6 °C RMSE. Simulated drop times are a median 0.3 minutes later than real, within ±1.8 minutes.
- Some roasts never reach their drop temp in the sim (mostly the Honduran MWP decaf). Bean differences aren't modeled.
- Preheat: about 14 °C RMSE, mostly from the leftover state of the previous batch at the start of each log. A cold start looks right: BT reaches 183 °C in about 4 minutes, while ET soaks up over about 15.

After a discharge, the drum state restarts at the empty-drum steady state. The simulated PID is a hand-tuned PI loop, and it recovers from a drop in about 5 minutes, like the real one.

When debugging the model, compare closed-loop runs to real logs, not open-loop replays. Open-loop replays looked fine while closed-loop simulated roasts stalled.

## Reliability rules

The old `roast/` project was never trusted on real beans. These rules are the fix:

- **Desired state, not fire-and-forget.** `machine.js` holds the desired value of every control (`TS, AH, HS, HP, FC, RC, CS`). Each poll compares it to the echoed state and resends anything that doesn't match. A dropped command is retried automatically. No caller ever "sends a command"; callers set desired state.
- **The order of a mode switch matters.** At charge, raise `TS` to the procedure's charge SV first, confirm the echo, then send `AH 0`, then `HP`. If `TS` is not raised, the old preheat SV caps the burner even in manual mode.
- **Steps arm after the turning point.** The turning point is the BT minimum after charge, followed by N rising samples. The drop is **never** gated on the turning point.
- **Debounce triggers.** Steps and drop require consecutive samples at or above the threshold (polls run about every 1.5 s), so one thermocouple spike can't fire them.
- **Drop = preheat.** The drop applies the `preheat.json` settings (AH 1, SV 185, air 30, drum 90) plus `CS 1`. The PID keeps the burner off because BT is above SV. Never send `RC 0` at drop; the drum must keep turning to discharge.
- **Every phase is restart-safe.** If the server crashes or the cable is pulled, then on reconnect the session re-applies the desired state for the current phase. The session state is persisted to disk so a restart mid-roast resumes it.
- **Test in the simulator first.** Every behavior gets a sim test before it touches hardware.

## Procedure variants

A procedure's `variants` (e.g. `espresso`, `pourover`) are a shallow override of top-level fields. If a variant provides `steps`, it replaces the whole list; it doesn't merge entry by entry. Analysis should compare drop and development only within a variant. Charge through first crack is shared, so roasts from every variant can be pooled for that part. In old filenames, a `_pour_over` suffix means the `pourover` variant.

## Build order

1. ✅ `protocol.js`, `port.js`, `machine.js` (the reconciler), and `sim.js` (fit to `logs/`).
2. ✅ `session.js` and `procedure.js`, tested end to end in the sim at high speed.
3. ✅ `alog.js` + `recorder.js`. Output passes Artisan's own type validation; still to do: open one in Artisan by hand.
4. ✅ `selftest.js` (passes in the sim). Still to do: run it on the real roaster, and fold what the report's `observations` show back into the protocol facts below.
5. The browser UI, then pop detection.
6. `analyze.js`.

## Self-test

`node kaleido/server/main.js --selftest` (drum empty, Artisan closed) takes about 30–40 minutes. It covers:
- the connection and readings
- every control echoing back, with the heater off
- the manual burner heating BT to 195 °C, which proves the SV ceiling lifts
- what a setpoint below BT does in manual mode (an observation, not pass/fail)
- the PID taking over in auto mode
- the cooling fan
- a cable pull, which it asks you to do
- a cool-down to 60 °C, then everything off

The burner checks only start once you press Enter to confirm the drum is empty. Ctrl-C turns the heater off and leaves the air and drum running to cool. `--no-heat` skips the burner checks and the cool-down. The report records per-check results, `sends` (commands written per control; more than one per change means the machine dropped some), and `observations`.

## Kaleido protocol facts

These were verified on hardware in the old `roast/` project and in Artisan's `~/artisan/src/artisanlib/kaleido.py` and `~/artisan/src/includes/Machines/Kaleido/Serial.aset`:

- **Serial format.** The serial link runs at 57600 8N1. To the machine: `{[TAG VALUE]}\n`, or `{[TAG]}\n` to query. From the machine: `{sid,VAR:val,...}\n`. Init is `PI` until a `sid` arrives, then `TU C`, then `SC AR`. Poll with `RD A0`. `SC AR` and `CL AR` (sent on exit) are what Artisan calls the start and end "safety guard"; what they actually do isn't documented anywhere.
- **Numbers are sent as integers**, including `TS`, matching Artisan.
- **Writes are spaced about 100 ms apart.** The M1 drops commands that arrive back to back. A command that's already queued gets updated in place and keeps its position; moving it to the back once starved the RD poll.
- **Variables.** `BT` bean temp, `ET` env temp, `AT` ambient, `TS` setpoint (SV), `HP` burner %, `FC` air %, `RC` drum %, `AH` auto-heat (1 = PID to `TS`, 0 = manual `HP`), `HS` master heater switch, `CS` cooling fan, `EV` event marker shown on the machine (1 = CHARGE, 3 = DRY, 4 = FCs, 5 = FCe, 6 = SCs, 7 = SCe, 8 = DROP).
- **`HS 1` is required to heat.** `AH 1` alone leaves the burner off.
- **`TS` caps the burner in manual mode too.** See the charge order above.
- **`HS` and `CS` don't appear in `RD A0` replies** until they've been set once.
- **macOS port.** Open `/dev/cu.usbserial-*`, not `tty.*`, because `tty.*` blocks on carrier-detect.
- **One program per port.** If Artisan is connected, opening the port fails with a lock error. Show that clearly; don't spin silently.
- **Preheat heat-soak.** From cold, BT reaches 183 °C in about 3.5 minutes and holds flat, but ET keeps climbing (about 158 → 180 °C) for another 12–15 minutes, while the PID's duty drifts down from about 37% to about 25%. That's the drum soaking. So stable BT alone isn't "ready": `preheat.json` also requires ET to have stopped rising.

## .alog format

An `.alog` is a Python-literal dict, readable with `ast.literal_eval`. `alog.js` reads and writes it. Our files match your Artisan logs because everything except the per-roast fields comes from `server/alogTemplate.json`, which includes the extra devices `{3}`/SV/`{1}` and `{0}`/AT/AH. The roast fields:

- `timex`, `temp1` (ET), and `temp2` (BT) hold the samples, every 1.5 s, starting from the end of the previous batch's record, so the preheat is included. `-1` means no reading.
- `extratemp1` holds burner, SV, and drum; `extratemp2` holds air, AT, and AH.
- `timeindex` holds sample indices for `[CHARGE, DRY, FCs, FCe, SCs, SCe, DROP, COOL]`, with 0 meaning unset. DRY is Artisan's rule: the first BT at or above `phases[1]` (152) after the TP.
- `specialevents`, `specialeventstype`, `specialeventsvalue`, and `specialeventsStrings` hold every air, drum, or manual burner change. Types are 0 = air, 1 = drum, 3 = burner. Each value is `pct/10 + 1`, and each string is `Q<pct>`. Burner changes in auto mode are skipped, because there HP is the PID's duty and changes every sample.
- `computed` holds the main times and temperatures, relative to charge (TP, DRY, FCs, SCs, DROP, phase times), plus weights. Artisan recomputes the rest when you save.

Artisan validates loaded files with pydantic against `ProfileData` in `~/artisan/src/artisanlib/atypes.py`. To check a file the same way, stub out `PyQt6.QtCore.QDateTime` and `plus.stock`, then run `TypeAdapter(ProfileData).validate_python(d)` from a virtualenv with pydantic.

**Signatures:** official Artisan builds check a `signature` field, which covers only the version, revision, and OS strings. Our files deliberately have no signature, version, or hash, so Artisan asks "Not a genuine Artisan profile. Load it anyway?" Don't copy a signature from a real log to silence that; it would fake an authenticity check. If the recorder patches an old Artisan log (weight out, notes), its original hash no longer matches and Artisan says "Modified Artisan profile." That's accurate too.

**Sidecar:** each `#N_….json` holds the bean slug, variant, procedure version and contents, weights, charge/TP/FC/SC/drop/beans-out, every step and override and alert, pops, and tasting notes. All times are seconds since charge.

**Naming:** `#N_<bean>_<variant>_YY-MM-DD_HHMM` uses the batch record's start time. N continues from the highest `#` in the folder. Files are written atomically: on charge, every 30 s, on every event, and a final time a minute after the drop.

## Analyzing a roast (Claude Code workflow)

When asked to analyze roasts or improve a procedure:

Resolve bean names through `beans.json` (old filenames use inconsistent spellings). Roast numbers aren't unique in old logs (#7 and #25 appear twice); identify by filename when ambiguous.

1. Run `node kaleido/analyze.js <roast#...>` to get a summary instead of reading raw `.alog` files. They're large. The summary covers the phase times, FC and drop temp, development time and %, the RoR curve and any crash or flick, which steps fired and when, overrides, weight loss, and tasting notes.
2. Compare the roast to that bean's earlier roasts and to the procedure's `reference`.
3. Propose concrete edits to `procedures/<bean>.json`, and explain the reasoning in terms of the curve and the tasting notes. Prefer one or two changes per iteration, so cause and effect stay readable.
4. After the user agrees, apply the edits and append a `history` entry (`date`, `afterRoast`, `change`, `why`).

## Drafting a procedure for a new bean

The user names the bean (usually from Sweet Maria's or Burman Coffee). Find its listing and note the origin, process, altitude/density, screen size, and the supplier's roast recommendations. Add it to `beans.json`. Copy the procedure of the most similar bean that has roast history (decaf → decaf, dense high-grown → dense high-grown). Adjust the procedure and explain each difference. Record the research and reasoning in the first `history` entry.

## Pop detection

The browser listens to the mic and detects transient pops above an adaptive noise floor. It sends `{t, intensity}` events to the server, which logs them in the sidecar and shows them as ticks on the chart. These are **hints only**: they may show "pops detected?" but never mark FC/SC or change the roast. No audio is stored.
