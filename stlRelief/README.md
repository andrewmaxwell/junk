St. Louis Relief - 2026 - 3D-printed true-scale model of St. Louis from USGS lidar

Tiles of St. Louis for a Bambu Lab A1 (0.4 mm nozzle), built straight from the USGS 3DEP lidar point cloud
(`USGS_LPC_MO_StLouis_2017_LAS_2018`, about 2.3 points/m²). Everything is at true scale, ground and buildings
alike: 1:16,384 for the wall (1 mm is about 16 m). Missouri's survey stops at the state line mid-river, so
Illinois' 2019 survey (`IL_HicksDome_FluorsparDist_3_2019`, misnamed; it covers East St. Louis) fills in
east of it. The Gateway Arch is too thin to print standing up, so it prints flat as a separate piece and plugs
into two sockets in the tile.

## The wall

`wall.py out/wall` builds the whole wall: 4 × 2 tiles of 245 mm, 98 × 49 cm in all, from west of Clayton to
East St. Louis, and from north of the Delmar Loop to south of Tower Grove Park. Tiles are named
A–D west to east and 1–2 north to south (`print/wall/layout.png`, not committed, is a map). Heights are
computed once for the whole wall, so neighboring edges match. Each tile has two small dovetail tabs on its east
and south edges and matching slots (0.2 mm clearance) on its west and north edges, outer edges included so the
wall can grow. The tabs are 0.8 mm plates along the bottom that slide into pockets under the neighbor, so from
the front a seam is a straight line; they sit away from the river, where the roof over a pocket would be thin.
Their positions are saved in `tabs.json`. D2 has the Arch sockets.

`project3mf.py <template.3mf> <tile.stl> <out.3mf> [name]` makes a one-tile project with the template's
settings. Each tile takes 5–8 hours and 120–145 g; the whole wall is about 53 hours and 1.06 kg.

## Build a test tile

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
- `relief.py` bins the highest return and the lowest ground return into cells of half a print pixel, builds a
  ground model, removes noise, poles, street clutter and rooftop clutter, takes out the lidar Arch, and cuts
  the Arch sockets. `tile.py` and `wall.py` use it.
- `terrace.py` turns the heights into a mesh one print layer at a time: each layer's outline is traced from
  the cells and straightened, so walls are vertical with sharp corners. Features under about 0.5 mm are
  dropped (`MIN_MM`): the nozzle can't print them, and Bambu Studio flags the tiny islands at the tops of tree
  canopies as floating regions. Islands under 0.5 mm² (`MIN_AREA`) go too, with everything above them: the
  Stan Musial bridge's towers are 0.3 mm thick at this scale and left a pillar Bambu couldn't slice.
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
