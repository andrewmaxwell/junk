WebGPU Slime Mold - 2026 - Lots of parameters to play with.

Runs on the GPU with WebGPU compute shaders, spawned in a disc in the middle. At startup it times a few steps and picks the grid resolution (up to full device resolution) and agent count (0.2 per cell, so about 1M on a laptop screen) to suit the GPU; the chosen size is logged to the console. Three species each lay their own trail channel and have their own color and behavior. `follow1`–`follow3` set how much a species follows (+) or avoids (-) each species' trail, including its own, so species can chase, flee, or ignore each other.

Drag (or touch) the canvas to paint with the brush **tool**: **food** (gold) attracts every species and is slowly eaten (**appetite**); **walls** (gray) block agents, who also steer away from them. The **eraser** tool, right-drag, or shift-drag erases. **reset** restarts the colony but keeps the drawing, with eaten food restored, so you can draw a maze and replay it; **clear drawing** wipes it. Resizing the window also clears it.

Performance: the trail is stored as f16 where supported, deposits are packed per-species counts in one u32 per cell, the blur goes through workgroup shared memory, and agents are periodically sorted by screen tile so their trail reads are cache-friendly. About 2.6 ms per step for 1M agents on a 3024×1656 grid (Apple Silicon). The number of steps per frame adapts to the GPU and the display's refresh rate (`pacer.js`), so the frame rate stays smooth and fast machines evolve quicker.

Rendering draws the trails plus a faint dot per agent to an HDR texture, then tone maps and dithers it to the screen.

Pick a look from the **preset** menu or hit **randomize**. The URL hash always holds the current settings (only the ones that differ from the defaults), so the address bar is always a shareable link.

- `main.js` – wiring and the frame loop
- `simulation.js` – buffers, agent/diffuse passes, reset
- `sorter.js` – periodically sorts agents by screen tile, for cache-friendly memory reads (~4x faster)
- `renderer.js` – scene and tone-mapping render passes (`shaders/render.wgsl`, `shaders/post.wgsl`)
- `pacer.js` – adaptive steps per frame
- `params.js` – tunable parameters, defaults and ranges
- `gui.js` – the lil-gui controls
- `presets.js` – named presets and randomize
- `share.js` – syncs params with the URL hash
- `uniforms.js` – packs params into the uniform buffer (mirrors `shaders/params.wgsl`)
- `gpu.js` – WebGPU setup and small helpers
- `input.js` – pointer tracking
- `shaders/` – WGSL
