House Splat - 2026 - A Gaussian splat of a house, built from drone photos

`drone2splat.py` turns drone video or a folder of photos into a Gaussian splat. It picks sharp frames, solves camera poses with COLMAP, trains with Brush, and exports `<name>.sog` plus `<name>.json` (the drone's viewpoints). The docstring at the top of the script covers setup and usage.

`drone2splat.py` also writes `<name>-preview.sog`, a few-MB version the viewer shows first while the full splat downloads.

`index.html` is the viewer. It loads `house` by default; `?scene=<name>` loads another export (`camping` is the other one). It starts with a slow spin; drag orbits, double-click or double-tap flies in, and the Share button copies a link to the current view.

Share `<name>.html` rather than the viewer URL: it carries the link-preview tags and `<name>-og.jpg` (a 1200×630 screenshot) for messaging apps, then redirects to the viewer. A new scene needs its own copy of `camping.html` and an `-og.jpg`.

There's no `image.png` on purpose, so this stays off the homepage.
