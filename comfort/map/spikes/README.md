Comfort Spikes - 2026 - The Comfort Map's year as a path-traced field of columns, tall where it was nice.

The same data as the flat [Comfort Map](../), drawn in 3D: each column stands on a block of 3 km HRRR cells (4×4 by default) and is as tall as the share of waking hours that scored Good or better there. Pick a month, walking or sitting, and drag to look around.

The lighting is path traced in [pathtracer.js](pathtracer.js), a progressive tracer written for this one scene. Flat-topped columns that fill their cells make the map a heightfield, so a ray walks the grid cell by cell and hits the boxes exactly, with no triangles. Each frame adds one sample per pixel: a sun disk 3° across (soft shadows), a blue sky dome (blue shade), and up to three diffuse bounces. Moving the camera starts it over; it stops at 2048 samples. **save PNG** saves the image with its labels at the render's resolution.

- **Fit to period** (on by default) stretches heights between the period's 5th and 99.5th percentiles, because over a whole year 96% of land is between 45% and 78% Good and a fixed 0–100 scale is a plateau. Turn it off and set the floor and top for heights that compare between months.
- The light comes from the north so the tall West Coast's shadows fall toward the viewer, not across the country.
- Labels quote the 3 km cell under the city, not the block's average.

The tracer is shared with [World Columns](../../../worldColumns/).
