Another Raytracer - 2026 - A WebGPU path tracer with fog, rainbow glass, teapots, and depth of field.

A progressive path tracer in a WebGPU compute shader: balls, flat panels, Utah teapots and brilliant cut diamonds, in paint, varnished paint, metal, glass and light.

Drag to orbit, shift-drag or right-drag to pan, scroll to zoom; on a phone, pinch to zoom and drag two fingers to pan. Click or tap anything to select it and focus on it. The URL keeps the scene, the view, any edits and any changed settings, so the address bar is a shareable link. Keys: space pauses, **r** resets the view, **d** toggles the denoiser, **t** cycles tone curves, **h** toggles HDR, **n** shows refining tiles, Esc deselects.

Scenes:

- **cornell**: a Cornell-box hallway lit by a ceiling panel, with mirror, glass, amber glass, gold and glossy balls
- **veach**: the multiple importance sampling test scene from Eric Veach's thesis
- **shafts** (the default): a foggy room lit through window blinds
- **caustics**: glass balls focusing light into their shadows
- **teapots**: a glass teapot the color of tea, glazed china and gold, lit like a product photo: a softbox, a dim fill, and strip lights behind that outline the glass
- **lasers**: green, red and blue lasers in a dark, hazy room, bent and split by a glass ball, landing on matte white walls that light the room
- **diamond**: a big round brilliant in a jeweler's light tent: a ring of softboxes that light whole facets, and 40 small lights for sparkle and fire
- **mirrors**: two facing mirrors reflecting glowing orbs into the distance
- **bokeh**: balls on a walnut table, with fairy lights blurred into discs
- **sunset**: a low sun, a physically based sky, and hazy air glowing around the sun
- **neon**: a dark gallery lit by colored tubes, after Dan Flavin
- **rgb**: red, green and blue lights casting cyan, magenta and yellow shadows

**Editing**: the Objects folder changes whatever is selected (outlined in gold): its material, color, gloss, roughness, brightness, size, a teapot's or diamond's turn, and glass's frost and index of refraction. Drag a selected ball or teapot to move it. **add a ball** and **add a teapot** drop one on the floor in view, clear of what's there; Backspace deletes; **undo all edits** restores the scene. Walls and floors can be lights too: make Cornell's ceiling one for the classic soft-shadowed box.

How it renders:

- **Light**: each bounce aims a shadow ray at one light, picked by how bright it looks from there, within the cone a ball covers or the solid angle a panel covers (Ureña's spherical rectangles), and also bounces at random. Multiple importance sampling weighs the two. Paths end at random once they carry little light.
- **Materials**: rough reflections are GGX microfacets, sampled by visible normals, with the light lost between facets added back (Turquin). Reflections follow Fresnel: varnish reflects 4% head on and nearly all at grazing angles, metal whitens toward grazing, and glass uses the exact formula. Colored glass absorbs with distance. Frosted glass reflects and refracts off GGX facets, picked the same way; light a facet sends the wrong way is flipped across rather than lost, so in a white furnace it matches the background too. In a white furnace, white balls and teapots of each material match the background within 1% at their centers; varnish loses up to 8% at grazing edges.
- **Dispersion**: the first refraction picks one wavelength, which bends by its own amount, so glass casts rainbow-edged caustics. Denser glass spreads colors more: a diamond's index (2.42) gives it about three times ordinary glass's fire.
- **Fog** fills the scene out to its surfaces. It can scatter forward like haze, and blue more than red like air. Equiangular sampling finds the glow around lights.
- **Teapots** are Martin Newell's 1975 Bézier patches, cut into 9,120 triangles at load, in a bounding volume hierarchy split by the surface area heuristic, and shaded with the patches' own normals. Like the original, they have no thickness, so glass teapots are solid glass.
- **Diamonds** are round brilliants in Tolkowsky's ideal proportions: 57 facets and a 16-sided girdle. The stone is convex, so it's the space inside all 73 facets' planes, and a ray hits it where it has crossed into the last of them. Diamond bends light by 2.42, so most light entering the crown reflects inside and comes back out, and each wavelength takes a different way.
- **Lasers** are too narrow for a path from the camera to ever land in, so they're followed forward from the laser instead, whenever the objects change: glass splits them by Fresnel's equations, bending each color by its own amount, and metal reflects them. Where one lands on paint it leaves a spot, a small panel light as bright as the light the paint scatters, and where it crosses glass, a faint glint. The shader finds each beam exactly where a camera ray passes through it, so beams in haze are smooth, not noisy. Drag the ball and the beams follow.
- **Sky**: Nishita's model of sunlight scattered by air, haze and ozone, computed once per scene into a table.
- **Surface detail**: noise bumps paint and smudges glass and mirrors, so nothing is perfectly even.
- **Sampling**: the first choices of each sample follow a scrambled Sobol sequence. Each 8×8 tile gets at least 32 samples, then stops once its noise, as displayed, is below the **noise target**.
- **Denoising**: an edge-avoiding wavelet filter guided by variance (SVGF without the temporal part). Each pixel's noise is known from its samples, so as it fades the filter stops averaging. At 64 samples the denoised image is closer to a 4096-sample render than the raw image at 512.
- **Display**: AgX filmic tone mapping by default (or easing into white, or clipping), HDR where the browser shows it (Safari), a lens glow that gets the light lights are clamped by, cos⁴ vignetting, color fringes toward the corners (chromatic aberration), film grain, and depth of field focused where you click. Phones held upright show more of the scene vertically.

The **Advanced** folder has fog's direction and color, dispersion, surface detail, display settings, and sampling knobs for comparing methods (MIS, lights only, bounces only; the veach scene shows the difference) and trading speed for accuracy.

Files:

- `main.js` starts things and runs the frame loop; `renderer.js` has the WebGPU pipelines and buffers
- `settings.js` the settings and URL; `panel.js` the lil-gui panel; `controls.js` mouse, touch and keys; `camera.js` the orbit camera; `editor.js` editing objects; `world.js` the scene as edited
- `scenes.js` the scenes; `shapes.js` balls, panels, teapots and diamonds for the GPU and for picking; `teapot.js` the teapot's triangles and hierarchy; `diamond.js` the diamond's facets; `lasers.js` lasers' beams and spots; `sky.js` the sky; `ggx.js` rough reflections' lost light; `vec.js` vector math
- `shaders/` the WGSL: `trace.js` joins the path tracer's pieces (`random`, `geometry`, `lights`, `fog`, `materials`, `detail`); `tiles.js` adaptive sampling; `denoise.js`; `glow.js`; `display.js`; `common.js` and `tone.js`, which every shader shares
