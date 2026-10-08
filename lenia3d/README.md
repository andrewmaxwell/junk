Lenia 3D - 2026 - Smooth 3D cellular automata on WebGPU: Bert Chan's 3D creatures, and a search that breeds new ones from them

[Lenia](https://arxiv.org/abs/1812.05433) is a continuous version of the Game of Life. Each cell holds a value from 0 to 1 instead of on/off. Every step, each cell takes a weighted average of its neighborhood, using a smooth shell-shaped kernel (one bump per ring in `rings`, out to `radius` cells). A bell curve centered on `μ` with width `σ` turns that average into growth (positive) or decay (negative), and the cell moves a fraction `time step` of the way. Small time steps make things evolve smoothly instead of flipping whole cells.

- `sim.js` runs the rule on the GPU. The neighborhood average is a convolution done with 3D FFTs, so big kernels cost nothing extra. The kernel and growth shapes are the polynomial bumps from Chan's 3D creatures.
- `species.js` holds 22 of the 3D creatures from [Bert Chan's Lenia](https://github.com/Chakazul/Lenia) (MIT license): each one's rule and starting shape. Two of them glide (Triguttome labens and Diguttome tardus), some pulse, rotate, or breathe, and most sit still once they've formed. `pattern.js` decodes his run-length format and drops a shape into the world.
- `render.js` raymarches the result: a lit surface where the state crosses `surface`, with soft shadows, ambient occlusion, and a faint glow from thinner material. Orange is growing, teal is steady, violet is dying back.
- `search.js` and `gallery.js` look for new creatures the way Chan found his. Searching for random rules from random noise turns up almost nothing but churning foam or still lumps, because creatures live in narrow niches of rule space and only form from the right starting shapes. So each try takes a creature that already lives (one of Chan's, a starred one, or an earlier find), nudges its rule a little, and runs it in a small world from that creature's own shape, giving it a chance to adapt. It's thrown out if it dies, spreads, or breaks into pieces, and kept only if it then does something: glides (its center moves; the number is cells per 1000 steps) or pulses (its mass swings). Finds become starting points for later tries, so the search wanders off step by step. Click a thumbnail to load it, star it to keep it and breed from it more.

A rule with no creature to start from (an unknown name in the link) gets a few soft balls of smooth noise instead, from `seed.js`.

Rules are written for a 64³ world. The `detail` setting runs the same thing at a higher resolution, scaling up the kernel and the starting shape to match.

The world wraps around at the edges, so a creature crossing one shows up cut in half on two sides.

Settings live in the URL hash, so a link brings back the same rule, started from the named Chan creature's shape (a searched creature's own shape is too big for a link).
