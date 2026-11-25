# snowflake notes

- Scripts (run from the repo root, they drive the installed Chrome with Playwright): `.tune.mjs` grows cases and makes a montage (use it for comparing parameters, with a side view at camera pitch ~0.12), `.live.mjs` samples fps like a visitor, `.perf.mjs` times steps vs. frames, `.check.mjs` clicks through timeline, replay and random weather. Paths in scripts are `[T °C, supersaturation over ice %]`.
- `a` holds the step each cell joined (+1), not 0/1. Anything that counts neighbors must test `!= 0`.
- The renderer only averages while things change; it caps its frame count while growing so the finished crystal still gets 64 averaged frames. Before that fix the final picture had no antialiasing at all and ferns looked speckled.
- Fern tuning (Nov 2026): top threshold b01 at plateness 1 went 3 → 4, thinning the fern star from about 25 to 17-19 cells thick with its branches intact. b01 ≥ 5 (even with rho up to 0.6) makes thin crystals fill in to plain hexagonal plates; mu 0.01 or kappa 0.05 didn't help.
- A "Star, then plates" path was dropped: after the weather turns to plates, vapor already stored around the crystal keeps the tips branching, so it came out identical to the fern star.
