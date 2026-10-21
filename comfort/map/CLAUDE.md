# Comfort Map notes

- The page only reads `data/`. Change what it gets in `build/export.js` and rerun it (about 10 s) from the checkpoint in `build/cache/runs/<start>_<end>/`. Only rescore (`score.js`, about 5 hours) when the model, the inputs or the stats being counted change.
- The checkpoint has no hour-of-day dimension. A "when in the day is it nice" view would need `STAT_FIELDS`/the stats layout extended and a full rescore. The HRRR spool is deleted as it's scored, so that also means refetching, about 1.6 hours.
- Measured and dropped:
  - 3 km profile tiles would be about 47 MB gzipped. The 9 km blocks are 5.2 MB.
  - Half-percent shares plus a mean-score channel made each month's PNG 1.1 MB. Whole percents with no mean make it 0.54 MB, and that precision is noise anyway.
  - A stretch-to-data colour scale made colours mean different things in each month, so the scale is fixed at 0–100%.
- Plain mouse-wheel scrolling deliberately scrolls the page, not the map. Zoom is ⌘/Ctrl+wheel, a trackpad pinch (which arrives as ctrl+wheel), a touch pinch or the buttons.
- `build/check.js` is the independent check against Open-Meteo's archive. Rerun it after any change to `comfort.js` or the HRRR conversion, and update the table in the README.
