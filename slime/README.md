WebGPU Slime Mold - 2026 - Lots of parameters to play with.

Runs on the GPU with WebGPU compute shaders: 1M agents at full device resolution, spawned in a disc in the middle. Three species each lay their own trail channel and have their own color and behavior. `follow1`–`follow3` set how much a species follows (+) or avoids (-) each species' trail, including its own, so species can chase, flee, or ignore each other.

Drag on the canvas to paint food, which attracts every species and stays until erased; right-drag or shift-drag erases it.

Performance: the trail is stored as f16 where supported, deposits are packed per-species counts in one u32 per cell, the blur goes through workgroup shared memory, and agents are periodically sorted by screen tile so their trail reads are cache-friendly. About 2.6 ms per step for 1M agents on a 3024×1656 grid (Apple Silicon).

Pick a look from the **preset** menu or hit **randomize**. The URL hash always holds the current settings (only the ones that differ from the defaults), so the address bar, or **copy link**, gives a shareable link.

- `main.js` – wiring and the frame loop
- `simulation.js` – buffers, agent/diffuse passes, reset
- `sorter.js` – periodically sorts agents by screen tile, for cache-friendly memory reads (~4x faster)
- `renderer.js` – blends the species colors and tone maps them to the screen
- `params.js` – tunable parameters, defaults and ranges
- `gui.js` – the dat.gui controls
- `presets.js` – named presets and randomize
- `share.js` – syncs params with the URL hash
- `uniforms.js` – packs params into the uniform buffer (mirrors `shaders/params.wgsl`)
- `gpu.js` – WebGPU setup and small helpers
- `input.js` – pointer tracking
- `shaders/` – WGSL
