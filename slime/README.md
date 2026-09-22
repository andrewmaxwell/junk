WebGPU Slime Mold - 2026 - Lots of parameters to play with.

Runs on the GPU with WebGPU compute shaders: 1M agents at full device resolution, spawned in a disc in the middle. Three species each lay their own trail channel and have their own color and behavior; `others` sets how much a species follows (+) or avoids (-) the other species' trails. Drag on the canvas to paint; with the default brush value the paint repels agents (values above `maxStrength` push them away).

- `main.js` – wiring and the frame loop
- `simulation.js` – buffers, agent/diffuse passes, reset
- `sorter.js` – periodically sorts agents by screen tile, for cache-friendly memory reads (~4x faster)
- `renderer.js` – draws the trail through a color gradient
- `params.js` – tunable parameters and the GUI
- `uniforms.js` – packs params into the uniform buffer (mirrors `shaders/params.wgsl`)
- `gpu.js` – WebGPU setup and small helpers
- `input.js` – pointer tracking
- `shaders/` – WGSL
