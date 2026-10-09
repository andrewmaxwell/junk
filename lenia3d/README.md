Lenia 3D - 2026 - Three kinds of matter that gather into drifting bodies and wrap around each other: 3D Flow-Lenia on WebGPU

A world of matter that only ever moves around, never appears or disappears. Every step, each of about ten kernels looks at the neighborhood of every cell (a few soft rings, out to some radius) and turns what it sees into "growth": a bump that's high when the neighborhood is just right. Matter then flows uphill on the summed growth, and away from crowding. That's the whole rule. Starting from an even haze, it gathers into bodies that wriggle, merge, split, stripe, and drift.

There can be one, two, or three kinds of matter (`kinds of matter`). Each kernel looks at one kind and pushes another kind (or the same one) around, so one kind can wrap itself around another, push it along, or keep its distance. Crowding counts every kind, so they can't pile into the same place.

This is [Flow-Lenia](https://arxiv.org/abs/2212.07906) (Plantec et al. 2023), a mass-conserving version of [Lenia](https://arxiv.org/abs/1812.05433), in 3D. Plain 3D Lenia mostly makes balls: its creatures live in narrow niches of rule space, and the stable ones are spheres. Because Flow-Lenia can't lose or make matter, nothing dies out or floods the world, and most random rules make something worth watching.

- `sim.js` runs it on the GPU. The neighborhoods are convolutions done with 3D FFTs (`fft.js`), two kernels per inverse FFT. Moving the matter uses reintegration tracking: each cell's matter lands as a small box wherever its flow sends it, and each cell sums the parts of its neighbors' boxes that overlap it, so nothing is lost.
- `rule.js` makes random rules (the ranges are from the paper; with several kinds of matter, each kind gets kernels pushing it from itself and from each other kind), nudges them, and packs them into the link.
- `render.js` raymarches the result: a lit surface where matter is dense, with soft shadows, ambient occlusion, and a glow from thinner matter. With several kinds of matter, each has its own color (coral, blue, gold). With one, color shows which way it's flowing, so a body moving as one is one color and currents inside it show as bands. The world wraps around at its edges, so instead of a cube (which would slice anything crossing a face) it shows a ball of it, fading at the rim, where everything is in one piece.
- `seed.js` starts each world as a thin haze of smooth noise, each kind of matter in its own pattern.
- `search.js` and `gallery.js` try rules in the background (Search → searching) and keep the ones where matter gathered into something solid and is still moving after 3000 steps. Click a thumbnail to load it. Star the ones you like: they're saved in the browser, and later tries are often small variations on them.

Settings and the rule live in the URL hash, so a link brings back the same world (from a different random start).
