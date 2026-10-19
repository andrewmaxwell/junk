Stretchy Maps - 2026 - The world by country and the US by county, stretched so each area is proportional to a statistic

# Stretchy Maps

Contiguous cartograms of the world by country and the US by county: every
region is resized so its area is proportional to a chosen metric, like median
income or child mortality, while still touching the same neighbors. Alaska and
Hawaii sit in insets off the lower left. Pick a map and a metric; the map stretches
into shape as it's computed.

## How it works

`cartogram.js` implements the flow-based cartogram of Gastner, Seguy & More
(2018). The map's density (target area over current area, with the sea at the
average) is rasterized onto a grid. Let the density slide linearly from that
to perfectly even as t goes from 0 to 1. Mass is conserved if `ρv = -∇Φ` with
`∇²Φ = ρ̄ - ρ0`, which doesn't depend on t, so one Poisson solve (by cosine
transform) gives the whole flow, `v = -∇Φ / ρ(t)`. Every border point rides it
from t = 0 to 1, so crowded regions spread out and sparse ones shrink, and
borders never cross. One run gets most of the way, and it repeats on its own
output (with less initial blur each time) until under 0.5% of the area is in
the wrong place. It runs in a worker.

`geometry.js` turns TopoJSON into shared points, so neighboring regions share
border points and stay stitched together. Long edges are split so they can
bend, and the rings that cross the antimeridian (Chukotka, Fiji) are unwrapped.

Regions with no data, or smaller than the "skip" threshold, keep their true
size relative to everything else.

## Data

`data/*.json` are built by `node cartogram/buildData.js`:

- Countries: Our World in Data grapher CSVs, latest year per country since 2000
- US counties: County Health Rankings & Roadmaps 2025

Geometry comes from `world-atlas` and `us-atlas` on jsdelivr at runtime.
