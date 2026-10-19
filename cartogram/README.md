Stretchy Maps - 2026 - World and US county maps stretched so each area is proportional to a statistic

# Stretchy Maps

Contiguous cartograms: every country (or county) is resized so its area is
proportional to a chosen metric, like median income or child mortality, while
still touching the same neighbors. Pick a map and a metric; the map stretches
into shape as it's computed.

## How it works

`cartogram.js` implements the diffusion cartogram of Gastner & Newman (2004).
The map's density (target area over current area, with the sea at the
average) is rasterized onto a grid, then left to diffuse until it's even.
Every border point rides the flow `v = -∇ρ/ρ`, computed each step from the
density's cosine transform, so crowded regions spread out and sparse ones
shrink. The flow is smooth, so borders never cross. One run gets most of the
way, and it repeats on its own output (with less initial blur each time) until
under 0.5% of the area is in the wrong place. It runs in a worker.

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
