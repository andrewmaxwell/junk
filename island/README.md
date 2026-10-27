Island - 2026 - Millions of years in seconds: an island rises, rivers carve its valleys, and you can raise mountains and follow a raindrop to the sea.

The crust under the island rises, rivers cut down into it, and soil creeps downhill, following the standard landscape evolution equation

dh/dt = U − K (P·A)^m · S + D ∇²h

where U is uplift, P·A is the river's discharge (rain × the area draining through a point), S is the slope to the next point downstream and D is how fast soil creeps. River cutting is solved implicitly down the drainage tree (Braun & Willett 2013, the method behind FastScape), so it is stable with 2,000-year steps. Hollows fill into lakes that spill over their lowest rim (priority flood, Barnes 2014), and rivers end at the sea, which they can't cut below. `node island/test.js` checks that at steady state every river's slope matches the exact answer U / (K (P·A)^m).

Tap or click the land to follow a raindrop to the sea and see how much water flows past. Pick **Raise** or **Lower** to sculpt (drag to paint; on a phone, two fingers still zoom and pan), and watch the rivers find new routes. Lower the sea to expose the shelf, or raise it to drown the valleys. Space pauses. The URL keeps the island's seed and any changed settings.

Simplifications: eroded rock vanishes instead of being carried and deposited (lakes don't fill with sediment, and there are no deltas), the rock is the same everywhere, there are no waves eating at the coast, and rain is the runoff that reaches rivers, with no evaporation.
