Island - 2026 - Millions of years in seconds: an island rises, rivers carve its valleys, and rainforest, desert and ice spread with the climate.

The crust under the island rises, rivers cut down into it, and soil creeps downhill, following the standard landscape evolution equation

dh/dt = U − K Q^m · S + D ∇²h

where U is uplift, Q is the river's discharge (all the rain falling upstream of a point), S is the slope to the next point downstream and D is how fast soil creeps. River cutting is solved implicitly down the drainage tree (Braun & Willett 2013, the method behind FastScape), so it is stable with 2,000-year steps. Hollows fill into lakes that spill over their lowest rim (priority flood, Barnes 2014), and rivers end at the sea, which they can't cut below.

What the rivers cut away travels downstream and settles in still water: lakes fill in from where rivers enter, and at the coast it spreads down a gentle slope from each river mouth into a shelf. Rain comes in on the wind. Air climbing the island's broad slopes drops more rain, and it dries out as it crosses, so the windward side is wet and the lee is dry. It cools 6.5 °C per kilometer of height. Plants and soil send part of the rain back to the air, following Budyko's curve, so only the rest reaches rivers: in hot, dry places that's almost none on average, though bare ground still sheds up to 30% of its rain in storms. Plant cover follows how the rain compares with what warm air could take up, and roots hold soil, so bare ground erodes about 7 times faster than forest. Biomes come from the same two numbers (Whittaker's biomes, with UNEP's aridity bands): rainforest, forest, conifer forest, savanna, grassland, dry scrub, desert, tundra, and ice and snow. The **Rain** setting is the average over the land; tap a spot to see what grows there and how much rain falls. Turn down the rain to watch the lee become desert badlands, or the temperature to bring tundra down to the coast and snow onto the peaks.

`node island/test.js` checks that at steady state every river's slope matches the exact answer U / (K Q^m), that sediment is conserved to a part in 10¹³, that the windward side is wetter, that Budyko's evaporation hits its known points, and that erosion peaks in semi-arid climates, as Langbein and Schumm found in real river basins (near 300 mm of rain a year), because there's runoff to move soil but too little for plants to hold it.

Tap or click the land to follow a raindrop to the sea and see how much water flows past. Pick **Raise** or **Lower** to sculpt (drag to paint; on a phone, two fingers still zoom and pan), and watch the rivers find new routes. Lower the sea to expose the shelf, or raise it to drown the valleys. The camera drifts around the island until you take it. Space pauses. The URL keeps the island's seed and any changed settings.

Rivers are drawn several times wider than real rivers (12 m + 70 m × √(flow in m³/s)) so creeks still show from across the island.

Simplifications: sediment only settles in lakes and the sea, so rivers never build floodplains or fans on land; the rock is the same everywhere; there are no waves eating at the coast; and plants are always in balance with the climate, since they settle in far less than one 2,000-year step. The rain model is a simple sweep along the wind, not a weather simulation, and evaporation is a rough fit to temperature.
