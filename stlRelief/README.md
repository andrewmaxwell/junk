St. Louis Relief - 2026 - 3D-printed true-scale model of St. Louis from USGS lidar

Tiles of St. Louis for a Bambu Lab A1 (0.4 mm nozzle), built straight from the USGS 3DEP lidar point cloud
(`USGS_LPC_MO_StLouis_2017_LAS_2018`, about 2.3 points/m²). Everything is at true scale, ground and buildings
alike: 1:15,000, so 1 mm is 15 m. The Gateway Arch is too thin to print standing up, so it prints flat as a
separate piece and plugs into two sockets in the tile.

## Build a tile

```bash
python3 -m venv venv && venv/bin/pip install -r requirements.txt
venv/bin/python tile.py -90.1892 38.6265 15 134.8 116.8 out/f3
```

Arguments are the center (lon, lat), meters per mm, and the tile's width and height in mm. It writes
`tile.stl` and `arch.stl`. Lidar tiles are cached in `cache/`.

Settings via environment variables: `PX` (print pixel, 0.15 mm), `EXAG` / `BEXAG` (ground / building height
exaggeration, 1), `GROUND_M` (anything lower above the ground is flattened to street, 2.5 m), `CLUTTER` and
`BUMP_M` (rooftop bumps and pits narrower than 7 cells and under 4 m are leveled), `DTM_SIGMA` (ground
smoothing, 1).

## How it works

- `ept.py` reads the lidar from the public USGS bucket.
- `tile.py` bins the highest return and the lowest ground return into cells of half a print pixel, builds a
  ground model, removes noise, poles, street clutter and rooftop clutter, takes out the lidar Arch, and cuts
  the Arch sockets.
- `terrace.py` turns the heights into a mesh one print layer at a time: each layer's outline is traced from
  the cells and straightened, so walls are vertical with sharp corners. Features under 0.3 mm are dropped,
  since Bambu Studio flags them as floating regions.
- `archflat.py` makes the Arch as a flat band from the National Park Service's catenary.

## Print files

`print/*.3mf` (not committed) are Bambu Studio projects with tuned settings: 0.12 mm layers, Arachne walls,
precise outer wall at 120 mm/s, gyroid 10%, SUNLU PLA+ 2.0 at 215 °C (220 °C first layer), fan up to 100%.
Tick Flow Dynamics Calibration when printing.

- `swapmesh3mf.py <project.3mf> tile.stl <new.stl>` puts a rebuilt mesh into a project and keeps its
  settings.
- `slice3mf.sh <project.3mf>` slices a project on the command line and prints Bambu's warnings, time and
  weight.
- Bambu Studio keeps only the setting changes named in `different_settings_to_system`, so edit settings in
  the app, or list any key you change by script there too.
