# Packing explorer

A browser-only 2D packing experiment. The live view shows the current search;
the smaller view always keeps the best feasible packing found so far. No replay
or server-side solving is required.

Serve the directory over HTTP (module workers cannot reliably run from file URLs):

```sh
cd /Users/andrew/junk/packing
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765>. The search starts as soon as the page loads and
restarts whenever a control changes. Pause/Resume controls the worker; Reset
restarts with a new random seed, as does Run again once a search has finished.
The actual seed is shown below the attempt log and can be passed to
`PackingSolver` to reproduce a run.

The controls are mirrored into the query string (`?container=&item=&n=&aspect=`),
so a refresh keeps the current problem and a URL can be shared or bookmarked.

## Search and contact handling

The outer loop shrinks the container, then attempts to repair overlaps at that
fixed size. Failed repairs are inconclusive; they reduce the next shrink step
and increase exploration. A feasible result updates the global best immediately.
Efficiency is based exclusively on that saved feasible result.

The aligned first start initially settles by translation only. This prevents
unnecessary torque from disrupting a grid that can already tile its container.
If sliding stalls, the solver retains the best result and retries the aligned
start with rotation enabled. That work remains inside the same attempt budget.
Scattered restarts use translation and rotation from the beginning. A result
matching the area lower bound terminates the search early. Both the ordinary
feasibility tolerance and the limits of floating-point arithmetic still apply.

Plateaux are escaped by **basin hopping**: displace/rotate nearby groups at
several scales, run bounded local settling, accept a reduction in normalized
overlap energy (or a feasible layout), otherwise restore every coordinate and
rotation. Independent restarts provide further exploration. This is an
approximate local-search heuristic, not a guarantee of reaching an exact local
or global minimum.

An annealed-repair baseline (Metropolis acceptance over randomly perturbed
pieces) was measured alongside it and removed: once a failed probe re-seeds
(below), basin hopping was better on every case, because its group moves are
what turn one arrangement into a differently-shaped one.

A failed probe means the incumbent arrangement could not absorb the compression.
Compressing it again only re-poses the same question, so by default the next
probe scatters a fresh layout instead (`reseedAfterFailures`). The incumbent is
still held, so an exploration that goes nowhere costs one probe and no ground.
When the restarts are done, one last fine-grained shrink runs from the global
best (`polishIterations`), which no restart would otherwise revisit.

Those two matter most together. On eleven unit squares in a square -- where the
4x4-grid-minus-one at side 4 is a very deep local optimum only 3.2% off the best
known 3.877084 -- the median result over forty seeds goes 3.20% with neither,
1.43% with re-seeding alone, 3.19% with polish alone, and 0.65% with both.
Re-seeding finds better-shaped arrangements; polish then squeezes them.

A plateau is detected from lack of meaningful energy reduction instead of
treating every infeasible iteration as stalled. Overlap energy is normalized by
item radius. Solver iterations have different costs, so compare configurations
using wall-time budgets as well as fixed-iteration regression checks.

The baseline/experimental contact options are available through solver config:
`rotationPolicy: 'free' | 'staged'` and
`relaxationOrder: 'forward' | 'alternating'`. Defaults are staged rotation and
forward sweeps. Alternating sweeps were mixed in initial trials and are retained
for explicit experiments, not enabled by default.

## Loose pieces

A finished packing usually contains a few *rattlers*: pieces with room to move
even though the layout as a whole cannot shrink any further. Eight circles in a
circle is the textbook case, seven wedged into a ring with the eighth rattling
in the middle. Those pieces are drawn in a third colour, and the caption under
the best packing counts them.

`freedom.js` decides this by displacing a piece by 2% of its radius in each of
sixteen directions, and turning it by 0.02 rad, and asking whether any of those
leaves it clear of its neighbours and inside the container. That is a concrete
test of visible wiggle room rather than the rigidity-theory question of whether
the packing is jammed. It under-reports rather than over-reports: free play
narrower than the direction sampling (a piece that can only slide along one
wall), motions combining a turn with a slide, and collective modes where two
pieces can only move together all read as wedged. A highlighted piece always has
somewhere to go.

## Tests and benchmarks

Node 22+; no npm dependencies are required.

```sh
npm test
node benchmark.mjs --quick
node benchmark.mjs
node benchmark-time.mjs --seeds 5 --ms 2000 --attempts 5 --output results.json
```

`npm test` covers analytic geometry examples, invalid numeric input, immediate
best reporting, the final-iteration perturbation bug, seeded determinism,
rejected-hop rollback, every supported shape/container pairing, sliding warm-up
and fallback, and the real worker's reset/pause/resume/completion protocol.
Worker protocol tests use Node worker threads with a small `self` adapter; the
app also needs browser testing for its DOM/Canvas integration.

`benchmark.mjs` is the existing fixed-work quality gate: it validates every seed's
result and checks the best result against a reference tolerance. `--quick` uses
a smaller search budget and looser quality thresholds.

`benchmark-time.mjs` measures first time within **1%, 0.1%, and 0.01% of the
reference linear scale**. It uses proven-optimum cases by default. The reference
is never supplied to the solver as a starting layout, objective, or constraint.
A numerical target match is not an optimality proof.

Each seed stops on the strictest target, the time limit, or attempt exhaustion,
whichever comes first. An atomic step can slightly overrun the time limit; hits
after the limit are not counted. The report includes hit counts, median time
among hits, best and median final gaps, and every seed's result and stopping
reason. A miss means "not reached within this budget," not impossibility.
Timing includes solver construction and validation, excludes worker startup,
snapshot transfer, drawing, and artificial animation delays. Results depend on
hardware/runtime and other machine load. Brief untimed warm-up and alternating
method order reduce compilation/order bias. This is an exploratory comparison,
not a statistically powered performance study.

Additional options:

```sh
# Include the three unproved square-in-circle reference constructions.
node benchmark-time.mjs --references --output results.json
# Spend longer on a particular nontrivial proven optimum.
node benchmark-time.mjs --only 'square in square n=10' --ms 10000 --attempts 20 --seeds 10
# Compare freely rotating contact relaxation to the sliding warm-up.
node benchmark-time.mjs --rotation free
# Experiment with sweep ordering.
node benchmark-time.mjs --order alternating
```

The saved `benchmark-results.json` records the run used for the accompanying
`BENCHMARK_RESULTS.md`. Rerun it to measure this machine/runtime afresh.

## Reference provenance and numerical limits

`benchmark-cases.js` contains reference values and links. Square grids attain the
area bound by construction. The nontrivial ten-square optimum was proved by
[Walter Stromquist (2003)](https://www.combinatorics.org/ojs/index.php/eljc/article/view/v10i1r8);
the old comment calling it conjectural was incorrect. Circle-in-circle values
come from [Packomania's table](https://www.packomania.com/cci/), including the
more precise ten-circle ratio. Square-in-circle examples are reference
constructions, not proved optima; see the discussion in
[Rigorous packing of unit squares into a circle](https://pmc.ncbi.nlm.nih.gov/articles/PMC6394747/).

The feasible tolerance is a worst penetration of `1e-4 × item circumradius`.
Tiny negative gaps can result from accepting this numerical contact tolerance;
they do not beat a theorem. Saved results are rechecked with `validateLayout`,
which rejects nonfinite data but shares the collision routines with the solver.
It is a consistency check, not an independent proof of geometry correctness.

The basin-hopping approach is informed by
[Grosso et al.](https://optimization-online.org/2008/06/1999/); this small
browser implementation uses its own bounded contact relaxation and group moves.
Further contact improvements worth comparing are clipped edge contact manifolds
and simultaneous position/orientation optimization. The current single support
midpoint can approximate edge contacts poorly. See
[Box2D's contact manifolds](https://box2d.org/documentation/md_collision.html)
for the geometry approach; changing it requires separate packing benchmarks,
since more physical contact handling is not automatically better optimization.

## Files

- `geometry.js`, `shapes.js`: convex shapes, collision and containment queries.
- `solver.js`: search, feasibility repair, and saved results; no DOM dependencies.
- `worker.js`: owns the solver, yields between ~8 ms compute batches, and sends
  display snapshots at up to ~30 Hz. Reset/pause cancel queued work.
- `main.js`: controls, URL state, and rendering; command IDs discard stale worker messages.
- `render.js`: draws snapshots without collision testing on the main thread.
- `validate.js`: saved-layout consistency checks.
