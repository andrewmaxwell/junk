# Grouptimizer — steering notes

Personal tool (single user: Andrew) that generates discussion groups for a
church youth group from student data in a Google Sheet. Used **on a phone**.
No build step, no package.json — plain ES modules + a CDN copy of `xlsx`,
served as a static site. Open `index.html` directly.

## How it works (data flow)

1. `getData.js` fetches the published Google Sheet as `.xlsx`, reads the
   `People` and `Attendance` tabs, and produces `Person[]` (hidden rows, via the
   `Hide` column, are dropped). Pairing preferences live in a `Weights` column
   (`"Name: 1, Other: -1"`, positive = keep together, negative = keep apart) and
   are **mirrored** so `weights[a][b] === weights[b][a]`. Attendance dates are
   joined in from the `Attendance` tab by id. The `Email` column (non-hidden
   rows) drives the report's mailto recipients in `main.js`.
   - Real-data notes: `Contrib` is a 0–4 scale measuring how much someone
     **contributes to discussion** (not just talkativeness) — it's the most
     important balancing factor after pairing. The `Three Interests`, `Hates`,
     and `Facts` columns are **not used and should be ignored**. Watch for
     malformed `Weights` cells (e.g. a bare `101.0` with no name) — harmless but
     inert.
2. `main.js` is the entry point: renders the text report + attendance table on
   load, and wires the Grouptimize / Boys / Girls buttons.
3. `solver.js` builds groups via **simulated annealing** (`SimulatedAnnealer.js`).
4. `makeReport.js` / `makeAttendanceTable.js` build the read-only summaries.
   `statGraph.js` draws the live cost/temperature graph during solving.

Edit the data here (linked in the UI):
https://docs.google.com/spreadsheets/d/1GFt1QV-LEui12pWztIMXwblcoLy5xdkTQBSQrlg50GY/edit

## The solver (the interesting part)

- **State**: `Person[][]` — an array of groups. Built by `makeInitialState`
  (round-robin deal, sponsors first, **order shuffled** so each restart starts
  differently).
- **Moves** (`generateNeighbor` picks one at random per iteration):
  - `swapMove` (~70%): swap two **same-type** people (sponsor↔sponsor,
    student↔student) between two groups. Preserves sizes & sponsor counts.
  - `studentCycle` (~30%): rotate one student each among 3 groups (preserves
    sizes; helps escape local minima).
  - **Every move preserves each group's student count**, so sizes never drift
    from the initial round-robin deal, which is perfectly even (floor/ceil).
    "As equal as possible" is a **hard structural invariant**, not something the
    soft `W_SIZE` term has to win. (Sponsors only ever swap too, so each group
    also keeps its initially-dealt sponsor count.) There used to be a
    size-changing `studentMove`; it was removed because the soft weight let sizes
    drift uneven (a real 2/3/4 student split) whenever the other terms gained a
    hair — see 2026-07-02 in History.
- **Objective** (`makeCostFn`, lower = better). Every term is normalized to
  ~[0,1] so the `W_*` weights at the top of `solver.js` express relative
  priority. These weights are the main tuning knob — adjust to taste:
  - `W_PAIR` (3) — reward satisfied pairing weights (+ keeps friends together,
    − pushes conflicts apart), normalized by max achievable pair benefit.
  - `W_CONTRIB` (2) — penalize uneven *average* contribution across groups
    (no all-quiet / all-chatty group).
  - `W_SPREAD` (1) — reward each group having an internal *mix* of high and low
    contributors (rewards within-group contrib stdev ≈ population stdev). Aligned
    with `W_CONTRIB` but distinct: it prefers a `{0,4}` group over a `{2,2}` one.
  - `W_GENDER` (0.5, low) — penalize uneven female *ratio* across groups. No-op
    for the single-gender By-Gender runs.
  - **Group size** is not a cost term at all — it's a hard structural invariant
    (all moves preserve student counts; see Moves above), so it can't be traded
    away. Removed terms (2026-07-02): `W_SIZE` (vestigial once sizes were locked),
    `W_TALKER` (redundant with `W_CONTRIB`/`W_SPREAD`; threshold degenerated under
    ties), and `W_LONE` (Andrew: a lone boy/girl in a group isn't worth avoiding).
- **Priority guidance from Andrew (for tuning if output ever feels off):**
  pairing should rank *slightly* above contribution balance (it does: 3 vs 2).
  Andrew has otherwise
  approved the current weights, so don't churn them without being asked.
- **Multi-restart**: `main.js` runs the annealer `RESTARTS` (5) times from
  different shuffled starts and keeps the lowest-cost result (SA is stochastic).
- **Two run modes** (`main.js`), built on a generic *segment* runner — a job is
  a list of segments optimized in sequence, each with its own restarts, whose
  best states are concatenated for display:
  - **Grouptimize** (`data-mode="mixed"`): one segment over everyone present.
  - **By Gender** (`data-mode="gender"`): two segments (girls, boys), each
    filtered to one gender — **students AND sponsors**, so leaders are always
    the same gender as their group. The combined result shows all single-gender
    groups at once. A gender with no present students is skipped.
  - The number input means **number of groups in both modes** (no per-button
    meaning). In gendered mode `allocateGroups` splits that total between the
    genders so group *sizes* stay as even as possible: each present gender gets
    ≥1 group, none gets more groups than it has students, and extra groups go to
    the most crowded gender. The meta line shows the split (e.g. "3 girls', 1
    boys'").

### Performance design — DO NOT BREAK
`makeCostFn` caches `getGroupStats` results in a `WeakMap` **keyed by group
array identity**. The move functions reuse the exact array reference for every
group they didn't touch and only `.slice()` the 2–3 they change, so each
iteration recomputes just those groups (≈O(numGroups) total) instead of all of
them (was O(n²)). **Invariant the cache relies on: a group array's contents are
never mutated in place — you copy first.** Any new move MUST preserve this or
the cache returns stale stats.

`makeSolver` also **auto-calibrates `initialTemperature`** by sampling ~100
uphill moves and targeting ~80% acceptance at the start, so the annealer adapts
to whatever scale the objective ends up at. If you retune the `W_*` weights you
do NOT need to also retune the temperature.

`randWhere(max, accept)` returns a random index where `accept` is true, or `-1`
(including when `max <= 0`). Moves bail (return the grouping unchanged) on `-1`,
which is how empty/degenerate groups are handled safely.

## Conventions

- ES modules, JSDoc types (`@typedef Person` lives in `solver.js`), 2-space
  indent, no semicolons-omitted style (semicolons used). No framework.
- No test harness. To sanity-check the solver, write a throwaway `.mjs` that
  imports `makeSolver`, feeds synthetic `Person[]`, runs `iterate()` to done,
  and asserts: all people present exactly once, **sponsor counts per group
  unchanged**, **student sizes near-even** (spread ≤1), no lone-gender groups,
  cost decreased. (`node --check` for syntax.) You can inspect the real data by
  downloading the published `.xlsx` (URL in `getData.js`) and `unzip`-ing it —
  it's a zip of XML (`xl/sharedStrings.xml` + `xl/worksheets/sheet1.xml`).
- To smoke-test the whole page: `python3 -m http.server` then load it in
  headless Chrome with `--virtual-time-budget=12000 --dump-dom` and grep the
  output for the report text / `#output` / mailto recipients.
- `Person.score` is set as a side effect of `makeReport`'s leaderboard and then
  read by `makeAttendanceTable` for row ordering — fragile coupling; keep
  `makeReport` called before `makeAttendanceTable` in `main.js`.

## History

**2026-07-02 even-sizes fix** — Bug: a 3-group run produced a 2/3/4 **student**
split. Root cause: even sizing was only a *soft* `W_SIZE` term, and on this data
the best 2/3/4 (cost −0.2101) edged out the best 3/3/3 (−0.2065) by a hair, so
the tradeable weight lost. Also, the 4 present sponsors deal 2/1/1, so an even
*student* split (5/4/4 total) and an even *total* split (4/4/5 → 2/3/4 students)
pull opposite ways. Fix: removed the size-changing `studentMove` so **all** moves
preserve student counts; since `makeInitialState` deals evenly (floor/ceil), even
sizes are now a hard invariant. `swapMove`/`studentCycle` rebalanced to 0.7/0.3.
Verified: 3 groups → always 3/3/3 and hits the brute-force optimum; 4/5 groups →
spread ≤1; sponsor counts and all-present-once preserved. `W_SIZE` left at 2 but
now vestigial.

**2026-07-02 objective cleanup** — Analyzed convergence: at this scale SA + 5
restarts already finds the global optimum every run (best cost sd = 0 on real
data and a 36-person synthetic set), so the search isn't the bottleneck — the
objective *definition* is. Per Andrew, pruned three terms: `W_SIZE` (vestigial
after the even-sizes fix), `W_TALKER` (redundant with contrib/spread, degenerate
under ties), and `W_LONE` (lone boy/girl not worth avoiding). Also dropped the
now-unused `maxContrib` from `GroupStats`. Objective is now just `W_PAIR` (3),
`W_CONTRIB` (2), `W_SPREAD` (1), `W_GENDER` (0.5). Re-verified: still even sizes,
converges consistently, all invariants hold. (Not done, noted for later: the
pair term's normalization is loosely scaled — conflicts can dominate when there
are no positive weights — left as-is intentionally.)

**2026-06-11 pass 1** — WeakMap delta-cost caching (~20× fewer ops/iter),
normalized objective + named `W_*` weights, auto-calibrated temperature,
`randWhere` returns -1 + accept-semantics. Bug fixes: malformed `<td>`, invalid
`ctx.font`, `{'': NaN}` from empty Weights, stray `console.log`s. Mobile CSS +
group cards + fetch error state.

**2026-06-11 pass 2** — Pulled & analyzed the real sheet. Richer moves (student
move + 3-cycle alongside swap; sponsors swap-only). New scoring terms: `W_TALKER`
(a strong contributor per group), `W_LONE` (no lone minority gender), `W_SIZE`
(even sizes now that moves can change them); `W_GENDER` downweighted to 0.5.
Multi-restart (×5, keep best). Email recipients from the sheet's `Email` column
(non-hidden rows). Attendance cells get 1px separation.

**2026-06-11 pass 3** (current) — Added `W_SPREAD` (within-group contrib mix).
Groups now render in a dedicated `#groups` container at the **top** of the page
(report + attendance stay visible below under a "Summary" heading) and the group
stat line shows "avg contribution" + "spread". The last grouping is **persisted
in localStorage**, keyed to `inputSignature` (a JSON of each person's
name/absent/sponsor/gender/contrib/weights); on load it's restored at the top
with a timestamp, or discarded if the sheet changed. The **email body now
includes the small-group assignments** (`groupsAsText`) ahead of the report;
`updateEmail(state)` is called on restore and after each run. Verified end-to-end
via Chrome DevTools Protocol (grouptimize → render/save → reload restores;
stale-signature → discarded).

**2026-06-11 pass 4** (current) — Replaced the separate Boys/Girls buttons with a
single **By Gender** button that produces one combined grouping of single-gender
groups (same-gender leaders), via the new segment runner (see "Two run modes").
The number input means *number of groups* in both modes; `allocateGroups` splits
the total between genders for even sizes. `W_TALKER` lowered 1 → 0.5 (per
Andrew: a talker per group tends to happen naturally). Verified via CDP that
every resulting group is single-gender and both genders appear together.

## Remaining opportunities (not yet done)

- **Tune `W_*` weights to taste** — current defaults are reasoned but unvalidated
  against your sense of a "good" grouping; nudge them after real use.
- **Email length**: `mailto:` bodies can get truncated by some mail apps once
  long (groups + full report). If it ever clips, trim the report in the email.
- **Early-stop on convergence** to trim runtime (plenty fast now, low priority).
