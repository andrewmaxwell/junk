# Packing explorer

A browser-only packing experiment, mostly 2D: how tightly do N copies of a shape
fit inside a container? The live view shows the current search; the smaller view
always keeps the best feasible packing found so far. No replay or server-side
solving is required.

One container is curved. "Sphere (surface)" packs pieces onto a sphere's surface
rather than into an outline: spherical caps for the circle -- the Tammes problem
-- and regular spherical polygons for the rest.

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

The search uses several CPU cores: one module worker per core, less one left for
the page, up to eight. Restarts are already independent -- no attempt hands the
next anything but the global best -- so the workers never talk to each other;
each runs the full restart budget from its own seed, and the page keeps the best
layout any of them finds. Worker `i` runs seed `seed + i`, and only worker 0 opens
from the aligned lattice (`latticeStart`), because that opening is the same
whatever the seed. One worker at a time streams its live layout to the
current-search view; the others report progress a few times a second, and the
view hands over when the watched one finishes. As soon as any worker reaches the
area lower bound, the rest are stopped. "s CPU" below the log sums compute time
over all workers.

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

### Packing on a sphere

The sphere container is normalised to unit area exactly like the flat ones, with
its *surface* area being the thing normalised: a sphere built at `scale` has
surface area `scale*scale` and radius `scale/(2*sqrt(pi))`. `scale`, the area
lower bound and the efficiency figure therefore keep the meaning they have
everywhere else, and a sphere result is directly comparable with a disc result.

Items are spherical shapes of fixed area -- a cap for the circle, a regular
spherical polygon otherwise -- so shrinking the sphere does not move them. A
position is a unit vector, independent of the radius; shrinking makes each piece
subtend more of the surface, and that is what creates the overlaps repair then
has to resolve. There is no boundary at all: the surface is closed, so a piece
can never escape and containment excess is identically zero.

A polygon is sized by inverting its spherical excess -- `sides` isosceles
triangles meeting at the centre -- by bisection on the circumradius angle, which
is monotonic. Overlap is a separating-axis test whose candidate planes are the
edges' own great circles: a spherical polygon is a convex cone from the centre
of the sphere, two convex cones are disjoint exactly when a plane through the
centre separates them, and `dot(v, n)` against a unit edge-plane normal is the
sine of the angular distance from that great circle, so the same number decides
separation and measures depth.

Two traps live in there, both guarded by tests:

- **Every edge is a candidate.** The planar solver skips half the edges of an
  even-sided polygon, since opposite edges there are parallel and their normals
  antiparallel (`axisCount`). On a sphere opposite edges lie on great circles,
  and two great circles always intersect, so their plane normals are genuinely
  different. Reusing that shortcut silently discarded real separating planes and
  reported contacts between pieces that were nowhere near each other.
- **The bounding-cap reject is load-bearing.** Face-normal SAT is complete for
  convex polygons but not for convex cones in three dimensions, which also need
  an axis per pair of edges. Dropping those is safe only because the
  configurations needing them are all near-antipodal, and a piece spans less than
  a quarter turn, so they are already beyond two circumradii and rejected before
  the scan. Measured over ~2M close pairs the scan then agrees exactly with
  ground truth in both directions; over the pairs that reject, it alone gets
  0.35% wrong.

Orientation is the part with real teeth. Transport on a sphere is
path-dependent, and no continuous tangent frame exists on the whole sphere, so
any convention that *recomputed* a frame from position would make pieces snap
around as they crossed its seam. Instead each item carries a unit tangent saying
which way it faces, and since every motion here is a rotation of the sphere, the
same rotation is applied to the facing -- parallel transport, for one extra line
per motion and no quaternions. Contact resolution then works in the tangent
plane at each piece's own centre, where the planar mass/inertia split applies
unchanged, and the resulting slide and spin are applied back as rotations.

That last step uses the shape's *flat* second moment, not its spherical one.
They agree for small pieces and drift apart as a piece grows relative to the
sphere, so it is an approximation -- in how fast a contact is corrected, though,
not in whether one is detected.

The surface is drawn as a cylindrical equal-area map -- longitude across, sine
of latitude down -- rather than as a 3D ball, so every cap is visible at once
and nothing hides behind a horizon. Equal-area matters here beyond cartographic
good manners: it means the fraction of the rectangle covered by caps *is* the
efficiency the stats report. Any aspect ratio stays equal-area, since scaling x
and y differently multiplies every area by the same constant, so the 2:1
rectangle is chosen for looks; it puts the least shape distortion around 37
degrees. Caps near a pole smear sideways into a band that reaches the top edge,
and caps near the date line wrap around to the far edge. Both are honest
consequences of flattening a sphere rather than rendering artefacts.

Everything outside the geometry is shared with the flat solver untouched: the
scale search, the restart and polish schedule, the temperature, the attempt log.
What differs is a great-circle slide instead of a straight-line push, a
Fibonacci spiral instead of an aligned lattice as the first seed, a cluster
rotation about a random axis instead of a group translate-and-turn, and no wall
pass. Overlap depth is reported as arc length so it shares the planar tolerance.

Caps have no orientation, so the rotation machinery is simply unused for them.

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
node benchmark-time.mjs --seeds 5 --ms 2000 --attempts 5 --output benchmark-results.json
```

`npm test` covers analytic geometry examples, invalid numeric input, immediate
best reporting, the final-iteration perturbation bug, seeded determinism,
rejected-hop rollback, every supported shape/container pairing, sliding warm-up
and fallback, and the real worker's reset/pause/resume/completion protocol.

The sphere gets stronger checks than most of the flat cases, because both of its
shape families have proven optima.

For caps this is the Tammes problem: at n = 4, 6 and 12 the test asserts the run
lands within 1% of the exact answer and cannot beat it, that centres stay on the
surface, and that no two caps overlap. Runs at n = 4, 6, 8, 12, 13 and 24 all
reach the known optimum to within 0.04%, recovering the tetrahedron, octahedron,
square antiprism, icosahedron and snub cube arrangements.

For polygons it is the Platonic solids, which projected onto a sphere are exact
tilings -- 4, 8 and 20 triangles, 6 squares, 12 pentagons. Each covers the sphere
completely, so its optimum is the area lower bound the solver already knows it
can never beat, and the test asserts it is reached. That is a stiffer check than
a tolerance band: a tiling only closes up if every piece is also *turned* to face
its neighbours, so it exercises sizing, the separating-axis test and the
rotational half of contact resolution at once. All five are found exactly.

Two further sphere tests guard invariants rather than results: that a
parallel-transported facing stays a unit tangent after thousands of rotations,
and that near-antipodal pieces never register as overlapping -- the second
because the bounding-cap reject that makes it true reads like a pure
optimisation and is not.

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

No results are checked in: timings depend on hardware and go stale with every
solver change, so rerun it to measure the current code on this machine.

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
which rejects nonfinite data (and, on a sphere, positions off the surface or
facings that are not unit tangents) but shares the collision routines with the solver.
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
- `sphere.js`: the curved-space geometry -- caps, great-circle separation,
  seeding, perturbation and freedom on a sphere's surface.
- `freedom.js`: loose-piece (rattler) detection for the highlighted colouring.
- `solver.js`: search, feasibility repair, and saved results; no DOM dependencies.
- `worker.js`: owns one solver, yields between ~8 ms compute batches, and sends
  display snapshots at up to ~30 Hz when watched, ~4 Hz otherwise. Reset/pause
  cancel queued work.
- `pool.js`: runs one worker per core, seeds them apart, merges their reports,
  and hands the live view between them; command IDs discard stale messages.
- `main.js`: controls, URL state, and rendering.
- `render.js`: draws snapshots without collision testing on the main thread.
- `validate.js`: saved-layout consistency checks, flat and spherical.
- `benchmark.mjs`, `benchmark-time.mjs`, `benchmark-cases.js`: quality gate,
  time-to-target measurement, and their shared reference cases.
- `solver.test.mjs`, `worker.test.mjs`: `npm test`.
