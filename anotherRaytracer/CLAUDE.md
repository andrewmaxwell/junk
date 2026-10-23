# anotherRaytracer

- Andrew prefers simple code whose behavior emerges from accurate basics. Light tracing for caustics was added and removed (65746d4): two estimators had to agree on which paths each counted, and one-sided walls broke that. Prefer display-side or single-estimator changes.
- The trace shader binds 8 storage buffers, WebGPU's default per-stage limit, and phones may not offer more. Pack new data into spare channels (the selected object's id rides in `albedoSums.w`) or an existing buffer (the teapot shares the sky's `tables`) rather than adding a buffer.
- `Params` in shaders/common.js and `writeParams` in renderer.js must match, including the buffer size (a multiple of 16 bytes).
- The trace shader's pieces in shaders/ are joined into one WGSL module, so they share every name, and the order of declarations doesn't matter.
- `filter`, `common`, `smooth` and `flat` are reserved words in WGSL. WGSL `max` takes two arguments.
- Teapots and diamonds go last in the objects buffer and get their own loop in `intersect`: a third shape in the main loop made scenes without teapots 3-10% slower (bokeh 108 -> 97), even with the traversal call removed. Diamonds are tested against all 73 facet planes, with no hierarchy, only for rays that hit their bounding ball.
- Teapot normals are the patches' own, interpolated across flat triangles; `into` and `nl` use the flat triangle's. Every patch winds the same way, so the normal is cross(dP/dt, dP/ds) to point out.
- Lasers are traced forward on the CPU (lasers.js) in `objectsChanged`, not by the shader: their spots and glints are lights in `gpuObjects` with `id` -1 (not editable), and their beams are packed after the teapots and diamonds in the objects buffer, in Shape-sized records whose fields line up with Shape's (power in colorMaterial). No path from the camera finds a beam, so nothing counts its light twice.
- Glass smudges (`detail`) blur a diamond's sparkles into a speckled haze, so the diamond scene defaults to `detail: 0`. With it on, adaptive sampling also stopped tiles before rare light paths showed up, leaving a blocky mosaic.
- Shader compile errors and uncaptured GPU errors show in the stats line, so a blank or frozen image with no message there is a logic bug, not a GPU error.
- Scene edits live in the URL as differences from `scene.objects` by index (see `editsParam` in editor.js), so reordering or removing objects in a scene's definition changes what old links show. Add new objects at the end.
- lil-gui stops key events from its own controls, so shortcuts don't work right after clicking a panel button.

## Measuring

- Headless Chrome via Playwright (`channel: 'chrome'`, `--enable-unsafe-webgpu`) runs WebGPU on the real GPU. Use a fresh browser per measurement; reusing one sometimes never finishes.
- Speed: the stats' spp/s includes shader compile time, so compare the change in spp between two readings a few seconds apart, with `noise=0` so adaptive sampling doesn't stop tiles. The GPU slows as it warms, so alternate versions (A, B, A, B) rather than running one then the other.
- Correctness: render to a fixed `spp` with `noise=0`, no denoise, glow, vignette, grain or aberration, and compare mean brightness with the previous version. A faster change that shifts the mean is a bug unless it's meant to change the look.
- Materials: a white furnace test (delete a scene's objects with URL edits, surround the camera with a radius-1000 white light, add white balls or teapots, and render with `tone=clip`, `exposure=-1`, no denoise, glow, vignette, grain, aberration or detail) should show each as bright as the background. Brighter means a material creates energy. Things next to each other dim each other's facing sides if either loses energy, so judge by their centers.

## Measured (M4, 800x500, spp/s)

- Ending fog at the farthest surface instead of filling all of space: rgb 28 -> 125, shafts 39 -> 58. Shafts lost a warm haze from sunlit fog outside its open front.
- Russian roulette by throughput instead of surface color: cornell 44 -> 107, same converged brightness.
- Surface detail cost 1.5-3x (mirrors 144 vs 435 without it). One pcg3d hash per lattice point, and smudges only on the first bounces and only when the random choice could use them: 308 vs 430. Andrew wants the detail to look good, so it stays.
- GGX with energy compensation and Fresnel coats converges as fast as the old Phong lobes. Without compensation, white metal at roughness 0.3 reflected 88%, and at 0.7, 50%.
- Rectangle lights cost scenes without them about 5%. A branch in lightGuess cost 12% even with no panel lights; storing panels' same-area ball radius in the radius field made it one formula. MIS and bounces-only agree (Cornell's ceiling light: 120.99 vs 120.99).
- The denoiser every frame cost about 12%; running it every frame below 64 spp and every 150 ms after costs 1-4%.
- Summing lightGuess once per shading point, not separately in pickLight, lightPickProb and bounceLightWeight: bokeh (30 lights) 90 -> 107, neon 51 -> 53.
- The teapot builds in about 90 ms at load (145 before binning the split search). The teapots scene runs at 85-125.
- Varnish loses light at grazing angles, on balls and teapots alike (about 8% at the very edge). Bending teapots' shading normals so reflections stay above the triangle (Cycles' fix) changed nothing, so it was dropped.
- Framing phones held upright as a square instead of 5:4 cropped things that matter (rgb's floating ball and shadows, bokeh's and neon's balls); only shafts gained.
