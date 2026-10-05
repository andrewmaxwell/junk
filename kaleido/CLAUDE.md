# kaleido

Controller for a Kaleido M1 LITE roaster. Read `README.md` first for what it does. This file covers how it's built and the hard-won facts about the machine.

This project is **not** a plain static page like the rest of the repo. It needs a local Node server (the `serialport`, `ws`, and `express` packages from the root `package.json`) because the server owns the serial port. The browser UI is a plain ES module page served by that server. Browser libraries still come from CDNs.

## Layout

Files marked * aren't built yet.

```
server/
  main.js        node kaleido/server/main.js [--sim [--speed 10]]: the app at http://localhost:3100/
                 --monitor (read-only on real hardware), --sim --autopilot (terminal demo),
                 --selftest [--no-heat] [--no-cable]
  app.js         HTTP + WebSocket server for the UI; saves the session to logs/.session.json
                 and resumes it after a restart (if < 30 min old)
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
  stop.js        emergency stop (heater off) for when the app is gone: emergencyStop()
  guardian.js    separate process: heater off if the app dies or hangs
  supervisor.js  what `main.js` becomes on the real roaster: runs the app as a child, restarts
                 it after a crash, and (once the tests pass) when its code changes
  selftest.js    empty-drum hardware checks (main.js --selftest); reports go to selftests/
test/            node --test kaleido/test/*.test.js
index.html, main.js   browser UI: readouts, charts, side panel of actions, alarm banner
ui/charts.js          three stacked uPlot charts (temps, RoR, burner/air) sharing time + cursor
ui/sound.js           speech + chimes (needs the Start click to unlock audio)
ui/pops.js            mic pop detector (AudioWorklet); hints only
preheat.json          preheat settings + stability rule, shared by every bean
procedures/<bean>.json
beans.json            canonical bean slugs → name, supplier, old filename aliases
logs/                 .alog + .json sidecar per roast
logs-sim/             what --sim runs write (gitignored)
selftests/            self-test reports from the real roaster
analyze.js *          prints a compact summary of one or more roasts for Claude
```

## Session behavior

- **Ready** means the machine has confirmed every setting, BT has stayed within 1.5 °C of SV for 3 minutes, and ET isn't *rising* faster than 0.5 °C/min over those 3 minutes *or* the last 1.5 (ET overshoots, dips, then climbs once BT reaches SV, and one fit across that reads as flat; that called a cold drum ready after 7 minutes on 2026-10-04). Replayed on the real cold-start logs, ready comes at 12–16 minutes with ET 177–183 °C, before every real charge. Falling ET is fine: between batches you charged with ET still falling 0.5–1.5 °C/min from the last roast.
- **Charge** is only ever auto-detected; there's no button (the user's choice). It needs a bean chosen first. Without one, the app says "choose the next beans" and doesn't start a roast. A charge-like BT drop raises an urgent alert instead, and choosing the beans while the fall is fresh (within about 25 s) still starts the roast, backdated. Detection: 2 readings 5 °C or more below the BT average from 10–30 seconds earlier. A real charge drops BT about 70 °C, so there's plenty of margin. The roast clock is backdated to the last reading before the fall.
- **Turning point** is the first reading 2 °C above the lowest BT so far. Steps arm only after it.
- **Triggers** (steps and drop) need 3 consecutive readings at or above their temperature. At ~5 °C/min near the drop, that lands about 0.2–0.5 °C past the target.
- **At drop**, the app sends `HP 0` while still in manual mode, then switches to the preheat settings with the cooling fan on. It repeats "Drop now!" every 5 s until the beans are out: you press the button, or BT falls 10 °C below the drop temperature (about 12 s on the real machine). The batch record closes a minute after the drop, and `batchComplete` fires.
- **Alerts never change the heat.** A stall alert fires when RoR has been under 1 °C/min for a minute after the turning point. A long-roast alert fires at 16 minutes. A stuck-control alert fires after 8 s.
- **Shutdown** turns the heater off and runs air at 100% with the drum at 90% until BT is under 60 °C. Then everything goes off, and `off` fires only after the machine confirms it.
- **Saving state.** `toJSON()` and `start(saved)` let a restarted server resume mid-roast without firing any step twice. `app.js` saves it to `logs/.session.json`. A session saved in READY resumes as PREHEAT, because the heater was off while the app was down and a cooled drum must not be called ready.

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
5. ✅ The browser UI and pop detection (tested in Chrome against the sim; the mic detector is untested against real cracks).
6. `analyze.js`.

## UI

- **Served by the app server, not the repo's dev server.** It needs the WebSocket. Don't add an `image.png`: the homepage would list the page, and on GitHub Pages it can't work without the server.
- **Charts:** three plots, not a dual-axis chart. Colors follow the dataviz palette's fixed order: BT slot 1 (blue), ET 2 (orange), burner 3 (aqua), air 4 (yellow), with dark-mode steps. The reference roast's BT (from the procedure's `reference.roast`, served by `/api/roast/:n` from `logs/`, even in the sim) is a muted dashed line. While roasting, x is seconds since charge; otherwise it's the last 20 minutes. Only the *next* step and the drop get horizontal guides, because all of them collide.
- **Side panel:** rebuilt only when its inputs change (see `renderSide`'s key). Things still change mid-typing (a step fires, an alert arrives), so a rebuild keeps form values and focus by element id. Give per-batch inputs per-batch ids (`weightOut-<n>`). Numbers that change every reading update in place by id (`preheatInfo`, `devInfo`, `dropEta`).
- **Two clicks for anything irreversible:** STOP, second crack, drop now, done for today, and everything off each need a second click within 3 s (`confirmed()` in `main.js`).
- **STOP** turns into a disabled "Heater off" once the phase isn't heating and the machine reports `HS 0`. An unreported HS counts as possibly on, so with no session the server sets `HS 0` at startup to make it known.
- **Not live:** if the app server or the roaster drops out, the readouts fade. A lost server also shows a banner, and actions show a toast instead of silently doing nothing.
- **No charge button** (the user's choice): charging is auto-detected. In `--sim`, "Pour beans in" and "Open the door" stand in for the person.
- **The drop alarm** (a full-width banner, speech, and a chime every 5 s) lasts until the beans are out, and the batch record stays open until then too.
- **Crack listening** high-passes the mic at 1.5 kHz and reports transients 12× or more above an adaptive floor. Three pops within 8 s shows a hint banner. Pops are logged in the sidecar, but they never act.

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

## Measured on this roaster (self-test, 2026-10-04)

- An empty drum at 60% manual burner went from 41 to 195 °C in 8 minutes; the sim takes about 9.
- The PID held 185 at 20–35% duty.
- After a cable pull, it was reconnected and back in sync in 25 s.
- Cooling from 195 to 60 °C with air at 100% took 18 minutes. The self-test's cool-down can be skipped with Enter, and the app's shutdown has a "Turn everything off now" button.
- Long waits show a live status line (`status()` in `selftest.js`, drawn by `main.js`). Its time-left estimates come from `timeTo()` in `procedure.js`: linear while heating, exponential toward 25 °C while cooling. They run a bit optimistic.

## Safety: the roaster has no panel

The M1 LITE can only be controlled over USB, so if our process dies with the burner on, nothing turns it off. Every path out turns the heater off first:
- the UI's STOP button (`session.emergencyStop()`: drop, then shutdown)
- Ctrl-C, after a confirmation when a session is running
- uncaught exceptions (`heaterOffAndExit` in `main.js`)
- `server/stop.js` for when the app is gone

**The roaster keeps heating with no computer.** The self-test's watchdog check (2026-10-04) went silent for 45 s at 60% manual burner: BT went 195 → 205 °C and HP still read 60 afterward. So there's one more layer, `guardian.js`. It's a detached process that `main.js` starts in app mode (not `--sim`). It watches the app's pid and `logs/.heartbeat`, which the app touches every 2 s.
- If the app dies (crash or kill -9), the guardian grabs the freed port and runs `emergencyStop()` from `stop.js`, then says so with macOS `say`.
- If the app hangs (heartbeat older than 15 s), the guardian kills it first, then does the same.
- On a clean exit, the app deletes the heartbeat, but only after the heater is confirmed off. If that confirmation fails, the guardian tries again.
- The heartbeat file holds the app's pid. After a restart, the old app's guardian sees a different pid, so it knows a new app took over and exits without touching the port or the file. The app stops its heartbeat timer before deleting the file on the way out, or one last beat would write it back and make its own guardian think it crashed.
- Its log is `logs/.guardian.log`.
- Verified on the real roaster with kill -9: the heater was off within about 2 s.

**Restarts (`supervisor.js`).** On the real roaster, `main.js` is a small supervisor, and the app runs as its child (`--child`). `--no-supervisor` turns this off.
- **After a crash** (or the guardian killing a hung app), it waits for the guardian to finish (the heartbeat file disappears), then restarts at once. The saved session resumes, mid-roast included. A crash means the heater has been off since, so speed matters. More than 3 crashes in 10 minutes means a bug, so it stops and says so out loud.
- **When `server/*.js`, `preheat.json`, or `beans.json` changes,** it runs the tests. If they pass, it asks the app to restart, and the app waits until no batch is at stake (`safeToRestart`): no session, PREHEAT with no batch record open, SHUTDOWN, or OFF. Never ROASTING. Never READY either, because READY resumes as PREHEAT, and beans poured in during PREHEAT aren't detected. If the tests fail, the old code keeps running.
- **A quit** (exit 0, SIGTERM, or Ctrl-C within the last 10 s) isn't restarted.
- Browser files (`index.html`, `main.js`, `ui/`) need only a page reload, not a restart.

`main.js` also runs `caffeinate -is` while the app is up. Still not covered: the laptop losing power, or the lid closing. Leave the lid open.

## Kaleido protocol facts

These were verified on hardware in the old `roast/` project and in Artisan's `~/artisan/src/artisanlib/kaleido.py` and `~/artisan/src/includes/Machines/Kaleido/Serial.aset`:

- **Serial format.** The serial link runs at 57600 8N1. To the machine: `{[TAG VALUE]}\n`, or `{[TAG]}\n` to query. From the machine: `{sid,VAR:val,...}\n`. Init is `PI` until a `sid` arrives, then `TU C`, then `SC AR`. Poll with `RD A0`. `SC AR` and `CL AR` (sent on exit) are what Artisan calls the start and end "safety guard"; what they actually do isn't documented anywhere.
- **Numbers are sent as integers**, including `TS`, matching Artisan.
- **TS maxes out at 240.** Asked for 250, the M1 LITE silently sets and echoes 240 (self-test, 2026-10-04). `machine.js` clamps to `MAX_TS`, and procedures reject `charge.sv` over 240.
- **Dropped commands are rare, at least with 100 ms spacing.** In both real self-tests (2026-10-04), every control change was echoed on the first send. The heavy dropping the old `roast/` project saw may have come from sending back to back. The reconciler stays anyway.
- **A power cycle resets the controls** to `TS 0, AH 1, FC 0, RC 0`, with HS and CS unset. (Unplugging the roaster did that after the first self-test; the `SC AR`/`CL AR` handshake doesn't.)
- **Writes are spaced about 100 ms apart.** The M1 drops commands that arrive back to back. A command that's already queued gets updated in place and keeps its position; moving it to the back once starved the RD poll.
- **Variables.** `BT` bean temp, `ET` env temp, `AT` ambient, `TS` setpoint (SV), `HP` burner %, `FC` air %, `RC` drum %, `AH` auto-heat (1 = PID to `TS`, 0 = manual `HP`), `HS` master heater switch, `CS` cooling fan, `EV` event marker shown on the machine (1 = CHARGE, 3 = DRY, 4 = FCs, 5 = FCe, 6 = SCs, 7 = SCe, 8 = DROP).
- **`HS 1` is required to heat.** `AH 1` alone leaves the burner off.
- **`TS` caps the burner in manual mode too.** See the charge order above. Confirmed by the self-test: with SV 15 °C below BT and HP 60 in manual mode, BT fell 15 °C in 90 s. **HP still reads 60 while capped**, so HP alone can't tell you the burner is off.
- **`HS` and `CS` don't appear in `RD A0` replies** until they've been set, and they go missing again on **every new connection** (a reconnect after the self-test's silence read `HS` as missing). The reconciler treats a missing value as a mismatch and resends it, and `sim.js` does the same per connection.
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
