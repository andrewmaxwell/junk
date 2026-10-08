Lenia 3D - 2026 - Smooth 3D cellular automata on WebGPU: blobby creatures that grow, breathe, and split

[Lenia](https://arxiv.org/abs/1812.05433) is a continuous version of the Game of Life. Each cell holds a value from 0 to 1 instead of on/off. Every step, each cell takes a weighted average of its neighborhood, using a smooth shell-shaped kernel (one bump per ring in `rings`, out to `radius` cells). A bell curve centered on `μ` with width `σ` turns that average into growth (positive) or decay (negative), and the cell moves a fraction `time step` of the way. Small time steps make things evolve smoothly instead of flipping whole cells.

- `sim.js` runs the rule on the GPU. The neighborhood average is a convolution done with 3D FFTs, so big kernels cost nothing extra.
- `render.js` raymarches the result: a lit surface where the state crosses `surface`, with soft shadows, ambient occlusion, and a faint glow from thinner material. Orange is growing, teal is steady, violet is dying back.
- `seed.js` starts things off with a few soft balls of smooth noise. White noise would never wash out of the surfaces, because the rule only adds smooth amounts to each cell.
- `search.js` runs rules without drawing them and measures how full the world is and how its center of mass moves. That's how the presets were found, and it's the start of a search UI.

The world wraps around at the edges, so a creature crossing one shows up cut in half on two sides.

Settings live in the URL hash, so a link brings back the same rule.
