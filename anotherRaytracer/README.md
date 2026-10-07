Another Raytracer - 2026 - A WebGPU path tracer with fog, rainbow glass, and depth of field.

A progressive path tracer in a WebGPU compute shader: spheres and flat plates, with diffuse, glossy, mirror, brushed metal, glass and light materials. Drag to orbit, shift-drag or right-drag to pan, scroll to zoom, and click to focus. The panel switches scenes and changes everything else; settings that differ from the defaults are kept in the URL, so the address bar is a shareable link. **save image** downloads a PNG.

Scenes:

- **cornell**: a Cornell-box hallway with a mirror ball, a glass ball, and glossy balls
- **veach**: the multiple importance sampling test scene from Eric Veach's thesis
- **shafts**: a foggy room lit through window blinds, with a glass ball and a brushed copper ball in the beams
- **caustics**: clear and colored glass balls on a pale floor, focusing light into their shadows
- **mirrors**: two facing mirrors reflecting glowing orbs and balls into the distance
- **bokeh**: balls on a polished black table, with fairy lights behind blurred into discs by depth of field
- **sunset**: balls on a plain with long shadows, a low sun, and hazy air that glows around it

How it renders:

- Each bounce aims a shadow ray at one light, picked by how bright it looks from there, and also bounces at random. Multiple importance sampling weighs the two so each covers where the other is noisy.
- **fog** scatters light, so beams of light show up in it. **fog scatters forward** makes it scatter mostly onward, like real haze, so it glows brightest looking toward a light. **fog blue** makes it scatter blue more than red, like air, for a blue sky and an orange sun. On rays the camera sees directly, equiangular sampling also checks the fog closest to a light, where its glow is brightest, so halos around lights clear up quickly.
- **light tracing (caustics)**: light focused by glass or reflected by a mirror ball onto a diffuse surface is very hard to find from the camera: a path would have to bounce off the surface at random and happen to get through the glass to a light. So paths also start from each light, aimed at the glass and mirror balls, and where they land on a diffuse surface, their light goes to the pixel the camera sees that spot in. Caustics come out smooth in seconds instead of speckled after thousands of samples, and camera paths leave that light out so it isn't counted twice. Lights that look big from a ball, like the sky, are left to camera paths, which handle their soft caustics fine.
- Glossy coats reflect more toward grazing angles, like real gloss, so balls get bright rims. Mirrors can be rough, for brushed metal. Colored glass absorbs light as it goes through, so thick parts are deeper colored than thin edges.
- **glass dispersion**: the first time a path refracts, it follows one random wavelength, which bends by its own amount, so glass casts rainbow-edged caustics.
- **depth of field** traces rays from random points on a lens, focused at the distance you click.
- The first few random choices of each sample come from a scrambled Sobol sequence, which spreads samples more evenly than plain random numbers, so noise fades faster.
- Adaptive sampling: every 8×8 tile gets at least 32 samples, then stops once its estimated noise is below the **noise target**. **show refining tiles** highlights the ones still going.
- HDR screens show lights brighter than white (in Safari; Chrome on macOS clips them). On SDR screens, bright areas ease into white instead of clipping, keeping their color, so a bright orange light still looks orange.
- Out-of-focus lights spread into discs that stay as bright as they should.

- `main.js` – WebGPU setup, the frame loop, camera, controls, and the lil-gui panel
- `shaders.js` – the path tracer, adaptive sampling, and display shaders (WGSL)
- `scenes.js` – the scenes, and packing them for the GPU
