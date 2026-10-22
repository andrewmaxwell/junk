# anotherRaytracer

- Andrew prefers simple code whose behavior emerges from accurate basics. Light tracing for caustics was added and removed (65746d4): two estimators had to agree on which paths each counted, and one-sided walls broke that. Prefer display-side or single-estimator changes.
- The trace shader binds 8 storage buffers, WebGPU's default per-stage limit, and phones may not offer more. Pack new per-pixel data into spare channels (the selected-object id rides in `albedoSums.w`) rather than adding a buffer.
- `Params` in shaders.js and the `paramsF32`/`paramsU32` slots in main.js must match, including the buffer size (a multiple of 16 bytes).
- `filter` and `common` are reserved words in WGSL. WGSL `max` takes two arguments.
- Shader compile errors and uncaptured GPU errors show in the stats line, so a blank or frozen image with no message there is a logic bug, not a GPU error.
- Scene edits live in the URL as differences from `scene.objects` by index (see `editsParam`), so reordering or removing objects in a scene's definition changes what old links show.

## Measuring

- Materials: a white furnace test (delete a scene's objects with URL edits, surround the camera with a radius-1000 white light, add white balls, and render with `tone=clip`, no denoise, glow, vignette or detail) should show every ball as bright as the background. Anything brighter means a material creates energy. Balls next to each other dim each other's facing sides if either loses energy, so judge by their centers.
- The stats' spp/s includes shader compile time. Compare speed by the change in spp between two readings a few seconds apart, with `noise=0` so adaptive sampling doesn't stop tiles. Headless Chrome via Playwright (`channel: 'chrome'`, `--enable-unsafe-webgpu`) runs WebGPU on the real GPU.
- Check correctness by rendering to a fixed `spp` with `noise=0` and comparing mean brightness against the previous version; a faster change that shifts the mean is a bug unless it's meant to change the look.

## Measured (M4, 800x500, spp/s)

- Fog used to fill all of space, so rays escaping an open scene scattered on through endless fog. Ending fog at the farthest surface: rgb 28 -> 125, shafts 39 -> 58. Shafts lost a warm haze that came from sunlit fog outside its open front.
- Russian roulette by throughput instead of surface color: cornell 44 -> 107, same converged brightness.
- Surface detail used to cost 1.5-3x (mirrors 144 vs 435 without it). A single pcg3d hash per lattice point, plus computing smudges only for the first bounces and only when the random choice could use them, brought mirrors to 308 vs 430. The bumps' noise is the rest; Andrew wants the detail to look good, so it stays.
- GGX with energy compensation and Fresnel coats: same convergence time as the old Phong lobes (cornell 15.5 vs 16.5 s, shafts 29.6 vs 28.6 s to done at 800x500). Without compensation, white metal at roughness 0.3 reflected 88% and at 0.7, 50%.
- Rectangle lights cost scenes without them about 5% (bokeh 100 -> 95). A branch in lightGuess, which runs for every light several times a bounce, cost 12% even with no plate lights; storing plates' same-area ball radius in the unused radius field made it one formula. Sampling methods agree: Cornell with its ceiling as a light, MIS vs random bounces only, mean 120.99 vs 120.99; a thin post as a light (area-sampling fallback), 9.98 vs 10.02 with the indirect clamp off (the clamp caps bounce-only hits on lights over 20x white).
- The denoiser every frame cost about 12%. Running it every frame below 64 spp and every 150 ms after brought that to 1-4%.
