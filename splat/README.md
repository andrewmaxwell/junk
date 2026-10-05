House Splat - 2026 - A Gaussian splat of a house, built from drone photos

`drone2splat.py` turns drone video or a folder of photos into a Gaussian splat. It picks sharp frames, solves camera poses with COLMAP, trains with Brush, and exports `<name>.sog` plus `<name>.json` (the drone's viewpoints). The docstring at the top of the script covers setup and usage.

`index.html` is the viewer. It loads `house` by default; `?scene=<name>` loads another export.

There's no `image.png` on purpose, so this stays off the homepage.
