Stretchy Maps - 2026 - The world by country and the US by county, stretched so each area is proportional to a statistic

# Stretchy Maps

Contiguous cartograms of the world by country and the US by county: every
region is resized so its area is proportional to a chosen metric, like median
income or child mortality, while still touching the same neighbors. Alaska and
Hawaii sit in insets off the lower left. Pick a map and a metric; the map
stretches into shape as it's computed, and switching metrics glides from one
shape to the next. Since area reads as an amount, the metric is multiplied by
population by default (median income × population is roughly total income);
untick "× population" to size by the rate itself. Color can show a second metric, so you can size countries by
population and color them by income.

## How it works

`cartogram.js` implements the flow-based cartogram of Gastner, Seguy & More
(2018). The map's density (target area over current area, with the sea at the
average) is rasterized onto a grid. Let the density slide linearly from that
to perfectly even as t goes from 0 to 1. Mass is conserved if `ρv = -∇Φ` with
`∇²Φ = ρ̄ - ρ0`, which doesn't depend on t, so one Poisson solve (by cosine
transform) gives the whole flow, `v = -∇Φ / ρ(t)`. Every border point rides it
from t = 0 to 1, so crowded regions spread out and sparse ones shrink. The
flow itself never folds, but borders are straight segments between moving
points, so where it's extreme (the Great Plains in US population) a few
segments can cross. One run gets most of the way, and it repeats on its own
output (with less initial blur each time) until under 0.5% of the area is in
the wrong place. It runs in a worker.

`geometry.js` turns TopoJSON into shared points, so neighboring regions share
border points and stay stitched together. Long edges are split so they can
bend, and the rings that cross the antimeridian (Chukotka, Fiji) are unwrapped.

Positive values keep their exact ratios; a true zero gets a sliver, since a
region can't vanish. Regions with no data keep their projected size relative
to everything else (Albers USA draws Alaska at about a third of its true
scale). Regions smaller than a grid cell, like Singapore or Manhattan, still
get their full share, since their target is spread over the fine samples
they cover. Shapes that share an ID,
like Australia and its Ashmore and Cartier Islands, count as one region, and
rings the simplified atlas collapsed to lines (Falls Church, VA) are dropped.

## Data

`data/*.json` are built by `node cartogram/buildData.js`:

- Countries: Our World in Data grapher CSVs, latest year per country since 2000
- US counties: County Health Rankings & Roadmaps 2025

Geometry comes from `world-atlas` and `us-atlas` on jsdelivr at runtime.
