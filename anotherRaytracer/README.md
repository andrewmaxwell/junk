Another Raytracer - 2026 - A WebGPU path tracer with fog, rainbow glass, and depth of field.

A progressive path tracer in a WebGPU compute shader: spheres and flat plates, with diffuse, glossy, mirror, brushed metal, glass and light materials. Drag to orbit, shift-drag or right-drag to pan, scroll to zoom. On a phone, pinch to zoom and drag two fingers to pan. Click or tap anything to select it and focus on it; click it again (or press Esc) to let it go. The panel switches scenes and changes the rest, and **reset settings** puts them back. Switching scenes starts from that scene's settings; the view, any edits, and any settings that differ from the defaults are kept in the URL, so the address bar is a shareable link. **save image** downloads a PNG.

Scenes:

- **cornell**: a Cornell-box hallway with a mirror ball, a glass ball, and glossy balls
- **veach**: the multiple importance sampling test scene from Eric Veach's thesis
- **shafts** (the default): a foggy room lit through window blinds, with a glass ball and a brushed copper ball in the beams
- **caustics**: clear and colored glass balls on a pale floor, focusing light into their shadows
- **mirrors**: two facing mirrors reflecting glowing orbs and balls into the distance
- **bokeh**: balls on a polished walnut table, with fairy lights behind blurred into discs by depth of field
- **sunset**: balls on a plain with long shadows, a low sun, a physically based sky, and hazy air that glows around the sun
- **rgb**: a red, a green and a blue light in light fog, casting cyan, magenta and yellow shadows that overlap into red, green, blue and black, of a floating ball, two posts, and glass and mirror balls

Editing: the **Objects** folder edits whatever you've selected (it's outlined in gold). Turn it into paint (with a gloss coat), metal, glass or a light, and change its color, roughness, brightness or size. Drag a selected ball to slide it around. **add a ball** drops a random one near the middle of the view, **delete** (or Backspace) removes the selection, and **undo all edits** puts the scene back. Walls, floors and other plates can be lights too, glowing panels that shine from their front, like a window or a softbox; turn Cornell's ceiling into one for the classic soft-shadowed box. Walls and floors don't drag, so dragging them still orbits.

How it renders:

- Each bounce aims a shadow ray at one light, picked by how bright it looks from there, and also bounces at random. Rays aim evenly within the cone a ball light covers, or within the solid angle a panel light covers (Ureña et al.'s spherical rectangles), so even a whole wall of light up close is sampled where it matters. Multiple importance sampling weighs the two so each covers where the other is noisy. Paths end at random once they carry little light (Russian roulette).
- **fog** fills the scene out to its surfaces and scatters light, so beams show up in it. A ray that hits nothing has left the fog. **fog scatters forward** makes it scatter mostly onward, like real haze, so it glows brightest looking toward a light. **fog blue** makes it scatter blue more than red, like air, for a blue sky and an orange sun. On rays the camera sees directly, equiangular sampling also checks the fog closest to a light, where its glow is brightest, so halos around lights clear up quickly.
- Rough reflections are microfacet reflections (GGX, sampled by visible normals): the surface is made of tiny tilted mirrors, so highlights have sharp peaks and long soft tails, and stretch out at grazing angles. Light that bounces between the tiny mirrors before leaving is added back (Turquin's energy compensation, from a table in `ggx.js`), so rough white metal is as bright as smooth.
- Reflections follow Fresnel's equations. Paint's gloss coat is clear varnish, covering the **gloss** fraction of it: it reflects 4% head on and nearly everything at grazing angles, so glossy balls get bright rims. Light the varnish reflects back down scatters off the paint again, which deepens colors, the wet look. Metal reflects its color head on and turns white toward grazing angles. Glass uses the exact formula, so its rims inside and out are right. Colored glass absorbs light as it goes through, so thick parts are deeper colored than thin edges.
- A white furnace test (white balls inside an evenly white light, which should vanish) reads within 1% of the background for paint, glossy paint, glass, and metal from mirror to roughness 0.7.
- **glass dispersion**: the first time a path refracts, it follows one random wavelength, which bends by its own amount, so glass casts rainbow-edged caustics.
- **depth of field** traces rays from random points on a lens, focused at the distance you click. The lens stays the same size wherever it's focused, so focusing on the sky blurs nearby things the way a real lens would.
- **surface detail**: nothing real is perfectly even, so gradient noise varies surfaces a little. Paint has bumps in several sizes, so it looks smooth from a distance and textured up close. Glass and mirrors have smudged patches, a thin film that scatters up to a third of the light a few degrees off course, so through a smudge things look hazy and bright things have a soft glow. Its size follows the scene's.
- **lens glow**: like a real lens, a small fraction of the light spreads into a soft halo, which shows around lights and glints. Lights are clamped to the screen's brightest, but the glow gets the light that clamp removes, so a light thousands of times brighter than white glows like one.
- The first few random choices of each sample come from a scrambled Sobol sequence, which spreads samples more evenly than plain random numbers, so noise fades faster.
- **denoise** (d): an edge-avoiding wavelet filter guided by variance (SVGF, without the temporal part). It averages each pixel with neighbors that saw the same surface (by color, normal and distance, seen through mirrors) and whose brightness differs by no more than the noise could explain. Each pixel's noise is known exactly from its samples' spread, so as it fades, the filter stops averaging, and the image becomes the plain average of the samples. At 64 samples, the denoised image is closer to a 4096-sample render than the raw image at 512. It only changes what's shown, and the stats say when it's on.
- Adaptive sampling: every 8×8 tile gets at least 32 samples, then stops once its estimated noise is below the **noise target** (in Advanced). Noise is measured in each color channel as displayed, so speckles that differ only in color, or that show in areas brighter than white, still count. **show refining tiles** highlights the ones still going.
- HDR screens show lights brighter than white (in Safari; Chrome on macOS clips them). On SDR screens, the **SDR tone curve** (**t** cycles it) is filmic by default: AgX, as in Blender, with a punchy look, which rolls off shadows and highlights like film. **ease into white** keeps bright colors' hue until they're far brighter than white, so a bright orange light still looks orange; **clip** just clips. Colors far brighter than white wash out toward white, so lights and their reflections in glass and mirrors have white-hot cores.
- **vignette** darkens the corners, as light reaching them through a real lens falls off as cos⁴ of its angle.
- Sky domes are lights colored by a physically based sky (Nishita's): sunlight scattered by air, which scatters blue most, and by haze, which glows around the sun. Ozone keeps the sky blue overhead at sunset. It's computed once per scene into a table the shader looks up by direction.
- Out-of-focus lights spread into discs that stay as bright as they should.
- Screens narrower than 5:4, like a phone held upright, show more of the scene vertically instead of cropping its sides.

The top of the panel has the scene, view, depth of field, fog and exposure. **Advanced** has the rest: under **Light**, how fog scatters, glass dispersion and surface detail; under **Display**, the denoiser, lens glow, vignette, tone curve and HDR; and under **Sampling**, the knobs for comparing methods and trading speed for accuracy: the method (MIS, only aiming at lights, or only random bounces, which the veach scene contrasts), the indirect clamp, pixel scale, noise target, max samples, and refining tiles.

- `main.js` – WebGPU setup, the frame loop, camera, controls, editing, and the lil-gui panel
- `shaders.js` – the path tracer, adaptive sampling, denoiser and display shaders (WGSL)
- `scenes.js` – the scenes, and packing them for the GPU
- `sky.js` – the physically based sky
- `ggx.js` – how much light one bounce off rough microfacets loses, for the shader to add back
