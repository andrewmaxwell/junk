Island - 2026 - Millions of years in seconds: an island rises, rivers carve its valleys, and the wind leaves one side lush and the other dry.

The crust under the island rises, rivers cut down into it, and soil creeps downhill, following the standard landscape evolution equation

dh/dt = U − K Q^m · S + D ∇²h

where U is uplift, Q is the river's discharge (all the rain falling upstream of a point), S is the slope to the next point downstream and D is how fast soil creeps. River cutting is solved implicitly down the drainage tree (Braun & Willett 2013, the method behind FastScape), so it is stable with 2,000-year steps. Hollows fill into lakes that spill over their lowest rim (priority flood, Barnes 2014), and rivers end at the sea, which they can't cut below.

What the rivers cut away travels downstream and settles in still water: lakes fill in from where rivers enter, and at the coast it spreads down a gentle slope from each river mouth into a shelf. Rain comes in on the wind. Air climbing the island's broad slopes drops more rain, and it dries out as it crosses, so the windward side is wet and green and the lee is dry grass, with fewer, smaller rivers. The **Rain** setting is the average over the land; tap a spot to see what falls there. `node island/test.js` checks that at steady state every river's slope matches the exact answer U / (K Q^m), that sediment is conserved to a part in 10¹³, and that the windward side is wetter.

Tap or click the land to follow a raindrop to the sea and see how much water flows past. Pick **Raise** or **Lower** to sculpt (drag to paint; on a phone, two fingers still zoom and pan), and watch the rivers find new routes. Lower the sea to expose the shelf, or raise it to drown the valleys. The camera drifts around the island until you take it. Space pauses. The URL keeps the island's seed and any changed settings.

Simplifications: sediment only settles in lakes and the sea, so rivers never build floodplains or fans on land; the rock is the same everywhere; there are no waves eating at the coast; and rain is the runoff that reaches rivers, with no evaporation. The rain model is a simple sweep along the wind, not a weather simulation.
