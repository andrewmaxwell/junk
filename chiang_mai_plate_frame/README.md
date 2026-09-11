# Chiang Mai Honda — Missouri License Plate Frame

Custom 3D-printable license plate frame for a friend (Lloyd / Chiang Mai Honda),
designed for multi-color printing on a **Bambu Lab A1 with AMS** (4 filament
slots: white, red, black, green — matches this design exactly).

## Status: ready to print

Filament in the AMS is **Overture PETG**; because it is third-party there is no
RFID, so at print time map the project's four filaments onto the slots by hand —
**1 = white, 2 = red, 3 = black, 4 = green**. Getting that order wrong is the one
mistake the file cannot catch for you.

`chiang_mai_honda_frame.3mf` opens in Bambu Studio with both halves laid out on
two plates and every color already assigned to an AMS slot. All six meshes are
watertight; the colors form an exact partition. It has also been put through the
BambuStudio CLI slicer, which slices both plates clean — no warnings, and the
weights, times and color-change counts below are that slicer's own numbers.

Opening it applies the project's print profile: **0.20mm Standard @BBL A1** with
four **Generic PETG** filaments, plus the tweaks in `export_3mf.PROCESS`. That is
normal for a project 3MF — change the presets afterwards if you want something
else.

## The deliverable

| | |
|---|---|
| Frame size | 328.8 × 170.4 mm (**12.94 × 6.71 in**), bottom rail 34 mm |
| Thickness | **4.2 mm** — 3.2 mm base (`FRAME_THK`) + 1.0 mm emboss (`EMBOSS_H`) |
| Pieces | 2 — cut exactly in half at x=164.4 mm, each on its own plate |
| Filament | **60.0 g PETG** total, purge and prime tower included (30.5 g + 29.5 g) |
| Print time | **2 h 50 m** total (1 h 28 m + 1 h 22 m) |
| Colour changes | **6 per plate** |
| AMS slots | **1 = white, 2 = red, 3 = black, 4 = green** |

## Setup

```sh
python3 -m venv .venv
.venv/bin/pip install shapely trimesh numpy matplotlib pillow \
                     mapbox-earcut manifold3d svgelements networkx lxml
.venv/bin/python build_frame.py     # -> frame_preview.png
.venv/bin/python measure_holes.py   # -> holes_verify.png   (re-derives the hole positions)
.venv/bin/python verify_overlay.py  # -> verify_overlay.png
.venv/bin/python split.py           # -> split_preview.png + stl/pieces/*.stl
.venv/bin/python export_3mf.py      # -> chiang_mai_honda_frame.3mf   <- the deliverable
```

The modules import each other, so `export_3mf.py` alone rebuilds the deliverable
from the SVGs — the other entry points are there for their previews and for the
checks they print. Each script asserts its own claims (see "Verification"), so a
run that finishes clean is a run that passed.

`mapbox-earcut` and `manifold3d` are both required: trimesh cannot triangulate
without an engine, and the boolean fallback in `mesh_util._extrude_one()` needs
manifold.

Fonts (used only for "cmhonda.com") resolve per-platform in
`plate_lib._find_font()`: Liberation Sans on Linux, Arial on macOS (metrically
identical), DejaVu as a last resort.

## Files

| File | Purpose |
|---|---|
| `bambu_a1_project.json` | Stock "Bambu Lab A1 0.4 nozzle / 0.20mm Standard" profile, used as the template for `Metadata/project_settings.config`. Without a valid project config Bambu Studio refuses the whole config — see "What Bambu Studio requires". |
| `generic_petg_a1.json` | The 124 filament-scoped keys of `Generic PETG @BBL A1`, flattened out of the installed Bambu system profile (which is a chain of `inherits`). Overlaid on the template so the project ships PETG rather than the PLA the preset assumes. |
| `svg_import.py` | Loads SVG artwork as shapely geometry grouped by color. Handles painter's order (the logo's "HONDA" is white paths drawn *over* the red bar, not holes in it) and even-odd hole nesting. |
| `build_frame.py` | The frame: outline, plate opening, mounting holes + bosses, and the content row. **All key dimensions are constants at the top.** |
| `split.py` | Cuts the frame in half and adds the locating tabs on the seam. Also writes STL fallbacks. |
| `export_3mf.py` | Writes the Bambu Studio `.3mf` — colors assigned to AMS slots, pieces on separate plates. |
| `mesh_util.py` | Turns 2D regions into watertight solids (`clean_for_mesh`, `extrude`). Deliberately has no dependency on the frame geometry. |
| `measure_holes.py` | Measures the plate's 4 pre-punched holes off the sample image by sub-pixel Hough circle fit; renders `holes_verify.png`. |
| `verify_overlay.py` | Overlays the design on the real plate to confirm no required plate content is covered. |
| `plate_lib.py` | Text→polygon (only "cmhonda.com" still uses a font), rounded rects, and the multi-color preview renderer. |
| `*.svg` | Source artwork — `chiang-mai-honda-logo-smooth.svg`, `chiang-mai-honda-script.svg`. |
| `chiang_mai_honda_logo_source.png` | Lloyd's original logo. Superseded by the SVG and unused by any code, but it is the only copy — kept as the reference to re-trace from. |
| `missouri_plate_sample.png` | MO DMV sample plate; the input to `measure_holes.py` and `verify_overlay.py`. |
| `*_preview.png`, `holes_verify.png`, `verify_overlay.png` | Regenerated renders — open these first. `emboss_preview.png` is a cross-section showing the relief. |

## Layout

Everything sits on one row in the bottom rail, level with the bottom screw
holes, with a 3 mm keepout around every hole (enough to leave a 15 mm circle
clear for a bolt head or washer):

| element | size | position |
|---|---|---|
| logo | 62.3 × 32.2 mm | x 6.0 – 68.3, y 0.9 – 33.1 |
| "Chiang Mai Honda" script (red) | 167.5 × 40.3 mm | x 80.6 – 248.2, top on the rail edge |
| "cmhonda.com" (green) | 74.7 × 8.1 mm (8.0 mm cap) | x 248.1 – 322.8, y 2.5 – 10.6 |

Closest artwork to any hole edge: **3.02 mm**.

**Nothing here is hand-sized.** Each element is grown by binary search until it
hits a real constraint — the rail edges, the 2D keepout around a hole, or the
frame outline. Two things fall out of measuring *true 2D distance* rather than a
vertical band:

- The script's widest point sits at 45% of its height, off the holes'
  centreline, which buys ~5 mm of extra width over the naive estimate.
- "cmhonda.com" sits *below* the right hole rather than beside it, so the
  keepout no longer caps its width at all — it grew from a 5.15 mm cap to 8.0 mm.

The logo fills the rail to within 0.9 mm top and bottom. It cannot fill it
completely: at its 1.93:1 aspect a full 34 mm-tall logo would be 65.7 mm wide
and run into the screw hole itself, so the hole caps it at 32.2 mm.

The script is sized by **width**, so its 4.16:1 aspect makes it 40.3 mm tall
against a 34 mm rail — the point being that the "g" descender hangs **6.3 mm
below the frame's bottom edge**.

## Embossing

Artwork is raised, not inlaid. The frame is a solid white plate 0–3.2 mm and the
colours sit on top of it, 3.2–4.2 mm. `emboss_preview.png` is a cross-section
through the content row showing the relief.

Two consequences worth knowing:

- **Less purge.** The bottom 3.2 mm is pure white, so the AMS only changes
  filament in the top 1 mm of layers — a fraction of the tool changes an inlaid
  design would need.
- **The dangling descender needs its own base.** The part of the "g" past the
  frame edge has nothing under it; as a raised layer it would print in mid-air.
  It gets a base of its own so it is solid from the bed up — white 0–3.2 mm with
  the red emboss 3.2–4.2 mm on top of it, same as everywhere else — and the
  white base gives up that sliver so the two never overlap. That base is printed
  **white**, not red — see below.

The back face stays flat at z=0 against the plate, and the part prints emboss-up.

The logo's **speed lines** come out 0.31 mm thick at this scale, below what a
0.4 mm nozzle can lay down as separate red, so `_thicken_slivers()` fattens the
4 affected slivers to 0.8 mm. Everything else in the logo is ≥0.97 mm.

## Purge: why the descender's base is white

`OVERHANG_BASE_WHITE` in `build_frame.py` is worth more than every slicer setting
in this project put together.

The descender of the "g" hangs 6.3 mm below the frame, so **23.5 mm²** of the
part — 0.3% of its area — has no white underneath it. Printing that sliver in red
for its full depth looks better from underneath, but it puts red on all 21 layers
instead of just the top 5, and once two colours coexist on a layer the AMS has to
swap on that layer. Sliced both ways with the BambuStudio CLI:

| left plate | descender base red | descender base white |
|---|---|---|
| colour changes | 22 | **6** |
| red filament | 5.94 g | **1.93 g** |
| plate total | 34.67 g | **30.71 g** |
| time | 1 h 54 m | **1 h 26 m** |

(That A/B was sliced before the PETG tuning above, so the absolute numbers are
the older profile's — the 4 g / 27 min gap between the two columns is the point,
and it is unaffected.)

23.5 mm² of red was costing 4 g of filament and 27 minutes. The trade is that the
descender's 3.2 mm sidewall is white where it hangs past the frame; head-on, the
face you actually see is solid red.

Right plate was already at 6 changes and is unaffected.

Three other purge knobs were tried and dropped — all measured, none earned a
place; the reasoning is recorded in `export_3mf.PROCESS`.

## Print settings

Beyond the stock A1 preset, `export_3mf.PROCESS` sets four things, and
`generic_petg_a1.json` replaces the filament side wholesale.

| Setting | Value | Why |
|---|---|---|
| filament | `Generic PETG @BBL A1` ×4 | 255 °C nozzle, 8 mm³/s volumetric cap, 0.95 flow. Extracted from the installed Bambu system profile — 124 filament-scoped keys, not just the temperatures. |
| bed | 80 → **70 °C** | The spools are **Overture PETG**, whose label specifies a 65–70 °C bed against Bambu's 80. Overridden in `export_3mf.FILAMENT` rather than in `generic_petg_a1.json`, which stays a faithful copy of Bambu's profile. 80 °C prints fine, but PETG already grips the textured plate hard, and the seam has to close flush — a first-layer lip is exactly what stops it. 70 °C is the top of Overture's range and still ample for a part with this much bed contact. Nozzle at 255 °C sits mid-range in Overture's 230–260. |
| `curr_bed_type` | Textured PEI Plate | PETG bonds to *smooth* PEI hard enough to pull the coating off. The stock preset says High Temp Plate. |
| `elefant_foot_compensation` | 0.075 → **0.15** | PETG spreads wider on layer 1. The seam is a butt joint and the tabs run at 0.15 mm clearance per face, so a first-layer lip is precisely what stops the halves closing flush. |
| `wall_generator` | classic → **arachne** | The logo's speed lines are 0.8 mm and the script's strokes are thinner. Classic lays whole 0.42 mm lines and gap-fills the remainder; Arachne varies wall width to fit. Costs 1.5 min and 0.05 g. |
| `precise_outer_wall` | 0 → **1** | Puts the outer wall on the modelled dimension rather than half a line width inside it — the difference between the locating tabs seating and rattling. |
| `filament_retraction_length` | 0.8 → **1.0 mm** | The A1's 0.8 mm default is tuned for PLA; PETG on a direct drive wants 1.0–1.2 (past ~2 mm it starts clogging A1 hotends, so 1.0 is the conservative end). This part is the case retraction exists for — the top five layers are ~40 separate artwork islands, so nearly every travel on the show surface crosses open air. The slice goes from 12 full retractions to 969. |
| `reduce_crossing_wall` | 0 → **1** | Routes travels around features instead of over them. Same target as the retraction bump: keep the nozzle from dragging across the artwork. |
| `sparse_infill_pattern` | grid → **gyroid** | Grid crosses itself and the nozzle knocks the crossings on the way past — a known PETG problem, since it stays tacky and lifts rather than shaving flat. Gyroid never self-intersects. Only 8 of 21 layers are sparse, so it costs almost nothing (and uses slightly *less* filament). |
| `brim_type` | auto → **no_brim** | `auto_brim` currently declines to add one, and a 34,000 mm² footprint in PETG has no adhesion problem — but "currently" is the risk. A brim follows the whole outline, which on these pieces includes the seam face that has to close to a 0.000 mm butt joint. Not the slicer's call to make. |

Together the last four cost **4 minutes** across both plates and 0.3 g *less* filament.

### Calibrate these on the actual spool

Overture is third-party, so there is no RFID and the printer will not calibrate
itself. Two things are worth doing once, in Bambu Studio, before the real print:

- **Flow dynamics (K factor).** Reported values for Overture PETG land around
  0.02–0.065 — too wide a spread to guess. This is what sharpens the edges of
  the embossed letters.
- **Flow ratio.** The profile ships Bambu's generic **0.95**; Overture users
  report 0.95–0.98. It is left at 0.95 deliberately — on 0.8 mm speed lines,
  slight under-extrusion is far more forgiving than over-extrusion, so 0.95 is
  the safe end to start from and raise only if the top surface looks starved.

`flush_volumes_matrix` is also computed here rather than left to the slicer. It
needs n² entries and the template ships two filaments, so the file carried four
values where sixteen were wanted. Bambu Studio patches that up silently on load,
but its own CLI refuses the file outright ("Flush volumes matrix do not match to
the correct size!"). `export_3mf.flush_volume()` is a port of
`FlushVolCalculator::calc_flush_vol_rgb`, which is where the asymmetry comes
from — changing *to* white costs 573–631 mm³, changing to black only 170–201.

**PETG on the textured plate sticks hard.** Let the bed cool fully before
popping the parts off, and if it fights you, that is the plate doing its job —
not a reason to raise the bed temperature.

## Splitting for the A1 bed

The frame is 328.8 mm wide against a 256 mm bed, and no 12-inch plate frame
fits an A1 whole — the plate alone is 304.8 mm. Height (170.4 mm) is fine, so
one vertical cut suffices.

**`SPLIT_X = OUTER_W/2 = 164.4 mm`** — exactly half, running through the
"Chiang Mai Honda" script.

| piece | size | colors |
|---|---|---|
| `left` | 168.4 × 176.7 mm | white, red, black |
| `right` | 164.4 × 170.4 mm | white, red, green |

The left half is bigger on both axes — wider by the locating tabs it carries,
taller because the script's descender hangs off the bottom edge. The halves
cannot share one plate, so the 3MF puts them on plate 1 and 2.

### The joint

The halves are superglued, so the joint's job is **registration, not
retention**: hold them in exact alignment, with bond area, while the CA sets.
Two constraints decide the geometry.

**It has to print without support.** The part lies flat, so only features
running through the full thickness print cleanly. A half-lap would be ideal —
it hides the joint behind a dead-straight seam — but it leaves one half with an
unsupported cantilever over the pocket, which would droop. So the locating
features run the full 3.2 mm and are visible as a small jog in the seam.

**It has to assemble by pushing the halves together in-plane.** That means the
profile cannot undercut, which rules out a true snap-fit — nothing can click.
A dovetail *would* lock, but only by sliding along the seam, and both rails
would have to engage over the frame's whole height.

So: **tapered locating tabs**, 4 mm deep with a 6° taper that acts as a lead-in
and self-centres as the halves close, then seats on the tab's base width.
Corners are filleted 0.4 mm so they seat cleanly, and each tab gets 0.15 mm of
clearance per face for glue. The rest of the seam is a zero-gap butt joint, so
the visible line stays tight.

Placement is automatic: `tab_positions()` finds, for each run of frame material
at the seam, the longest stretch that no artwork crosses — judged over the tab's
whole footprint, not just along the seam line, since artwork that clears the
line can still dip into the band the tab reaches into. That yields:

| tab | y | length |
|---|---|---|
| bottom rail | 1.5 – 5.9 | 4.4 mm (the enlarged script crowds this one) |
| top rail | 155.9 – 166.9 | 10.9 mm |

150 mm apart, which is what makes them register rotation and not just position.

**Assembly:** dry-fit first — the tabs should close with light thumb pressure.
Lay both halves face-down on something flat so the faces are coplanar, run thin
CA along the seam, push together and hold. The tabs do the aligning; do not
rely on eyeballing the outer edges.

## Mounting holes: measured

Measured off `missouri_plate_sample.png` by `measure_holes.py`:

| | measured | US standard | used |
|---|---|---|---|
| horizontal spacing | 176.82 mm (6.961 in) | 7.000 in | **7.000 in** |
| vertical spacing | 119.57 mm (4.707 in) | 4.750 in | **4.750 in** |
| hole diameter | 7.93 mm | 5/16 in (7.94 mm) | frame uses 9.0 mm for clearance |

Within ~1 mm of the standard pattern, and 1 px of the source image is 0.63 mm,
so the residual is measurement noise — the code uses the exact standard. The
holes are centred on the plate. (An earlier hand-measurement converted pixels
using the full 500×246 image; the plate is really 485×243 px within it, a ~3%
scale error. `measure_holes.py` finds the plate's own edges first.)

That measurement exposed a design conflict: the frame's rim was too thin to
reach any hole — the top rim fell 13.8 mm short — so bolts would have passed
through the plate without ever capturing the frame. Fixed by:

- `OVERLAP_BOTTOM` = 28 mm. The plate's "SAMPLE" characters stop 37.9 mm up from
  its bottom edge, so this covers only the decorative wave border, clearing all
  lettering by ~9.9 mm, and leaves a 7.6 mm wall above the bottom holes.
- Two local **bosses** at the top holes rather than a wider top rim, because
  "MISSOURI / SHOW-ME STATE" runs 14.7–24.1 mm down from the plate's top edge —
  exactly where a hole-capturing rim would have to go. The holes sit at 64.1 and
  240.9 mm from the left edge, which clears all lettering, so local pads work
  where a full-width rail would not.

`MOUNT_MODE` selects `"all4"` (default), `"top2"`, or `"bottom2"`. `"all4"`
works whichever pair Lloyd's bracket uses.

### Why the 9 mm holes look too big (they aren't)

Printed, they measure **Ø9.05 mm** — read straight off the sliced toolpath, not
the model. Next to a 6 mm M6 shank that is 50% of air all round, which is why it
reads as oversized on the plate. The dimension that matters is the *head*, and a
license plate screw's head is a **12.7 mm (1/2") washer face** on a 10 mm hex:

| head | Ø | bearing per side | annulus |
|---|---|---|---|
| ISO 4762 socket cap (the smallest M6 head that exists) | 10.0 | 0.48 mm | 15 mm² |
| ISO 7045 pan | 12.0 | 1.48 mm | 49 mm² |
| **hex washer head — the actual plate screw** | **12.7** | **1.83 mm** | **63 mm²** |
| DIN 6921 hex flange | 13.6 | 2.28 mm | 82 mm² |

Nothing standard in M6 passes through: the smallest head of any type is 10.0 mm,
a full millimetre wider than the hole. At 63 mm² of PETG in bearing, the washer
would need ~3 kN to crush its way in; a plate screw torqued by hand sees well
under 1 kN.

The 9 mm is deliberate — it buys 1.5 mm of radial float for an M6, which is what
absorbs any error between the frame's hole pattern and the car's bracket. Going
to 8 mm would add ~0.5 mm of bearing the joint does not need and give up a third
of the alignment slack it does.

Two things to hand Lloyd along with the frame:

- **Use the hex-washer-head plate screws, not socket cap screws.** A cap head is
  10 mm and would sit on a 0.48 mm ledge. Any normal plate screw is fine.
- **Skip any kit with a 16 mm decorative washer** — the top holes sit on Ø15 mm
  bosses, so a 16 mm washer overhangs by 0.5 mm per side. Up to 15 mm seats
  flat; the bottom holes are in the rail and take anything up to 24 mm.

Minor, flagged: the left boss overlaps the month-sticker guide box by ~6 mm.
This is inherent to the plate — its own hole already encroaches ~1.8 mm into
that box — and real stickers are smaller than the guide box.

## What Bambu Studio requires of a .3mf

Getting past *"The 3mf file has invalid config, load geometry data only"* takes
two things, both read out of the BambuStudio source rather than guessed. When
that message appears, the plate assignments and per-part extruders are silently
discarded — you get bare geometry on one plate.

**1. The `Application` metadata must start with the literal `"BambuStudio-"`.**
In `bbs_3mf.cpp`, `_BBS_3MF_Importer::_handle_end_metadata()` sets its
`m_is_bbl_3mf` flag *only* on that prefix:

```cpp
} else if (m_curr_metadata_name == BBL_APPLICATION_TAG) {
    if (boost::starts_with(m_curr_characters, "BambuStudio-")) {
        m_is_bbl_3mf = true;
        m_bambuslicer_generator_version = Semver::parse(m_curr_characters.substr(12));
    }
}
```

Anything else — a tool name, a URL — and the file is treated as third-party.
`BAMBU_APP_VERSION` in `export_3mf.py` carries the version string.

**2. `Metadata/project_settings.config` must describe a real BBL printer.**
`Plater.cpp` warns unless one of two checks passes:

```cpp
if (!is_bbl_vendor_config(config_loaded, preset_bundle) && !check_project_config(config_loaded)) {
    load_config = false;
    show_info(q, _L("The 3mf file has invalid config, load geometry data only"), _L("Load 3mf"));
}
```

`is_bbl_vendor_config` needs `printer_model` to name a machine in the BBL vendor
list (`"Bambu Lab A1"`); `check_project_config` needs `nozzle_diameter`, plus an
`extruder_type` of matching length when there is more than one extruder.

**Filament arrays.** Expanding the template from 2 filaments to 4 cannot just
lengthen every same-length list. Of the 166 two-element keys, 145 are
per-filament but 21 are not: `machine_*` are per motion-mode (normal/stealth),
`wipe_tower_*` are per-plate, and `start_end_points` / `extruder_ams_count` are
printer-scoped. Stretching those would corrupt the machine limits. Bambu Studio
does resize genuine per-filament options itself (`Preset::filament_options()`),
but the config should be consistent going in.

## Verification

Every run asserts its own claims and prints the evidence either way, so the
output of a build *is* the verification (`split.check()`, shared by both
scripts, raises on a failure rather than printing a warning nobody reads).

`build_frame.py`:

- artwork clears every hole keepout — currently **3.02 mm** against a 3.00 mm
  requirement

`split.py verify()`:

- both pieces within the 256 × 256 mm bed
- **no locating tab crosses artwork** (the seam itself does, by 7.4 mm of its
  length, where it runs through the script — that is intended, and is why the
  tabs are placed by `tab_positions()` rather than by hand)
- halves do not overlap, and the butt seam closes to a 0.000 mm gap
- the halves reassemble into the whole frame, the only missing material being
  the 4.52 mm² of glue clearance milled around the two tabs
- **0.000 mm² dropped** while meshing (`mesh_util.dropped_area()`). Since the
  artwork is embossed rather than inlaid, the white base is no longer booleaned
  against fine detail, so the sliver problem that used to drop ~0.1 mm² is gone
- all 6 meshes watertight

`export_3mf.py verify()` re-opens the file it just wrote — reading it back
rather than trusting the variables that wrote it, because the failure it guards
against is silent:

- `Application` starts with `"BambuStudio-"`, and `project_settings.config`
  passes both of Bambu's config checks (`printer_model`, `nozzle_diameter`,
  `extruder_type`)
- four PETG filaments declared, and `flush_volumes_matrix` is n² = 16 entries
- `<part id>` == `<component objectid>` for every part (this mapping is what
  makes Bambu apply the right extruder), extruders 1–4 as above
- the file round-trips through a 3MF reader with all 6 meshes still watertight
- both pieces within 256 × 256 mm, placed at plate centres (128, 128) and
  (435.2, 128) — Bambu's 307.2 mm plate pitch

Beyond that, the deliverable has been round-tripped through the BambuStudio CLI
(`BambuStudio --slice 0`): both plates slice with `return_code 0`, an empty
warning message, and exactly the numbers quoted above — 6 colour changes per
plate, 30.53 g + 29.47 g, 1 h 28 m 03 s + 1 h 22 m 12 s.

Five mesh traps worth knowing about, all handled:

- trimesh's earcut triangulator does not reliably close a polygon with many
  holes (the logo's red bar has 15), so `_extrude_one()` falls back to a
  manifold boolean.
- SVG curves flattened in SVG units produce ~0.009 mm chords, which blew the
  mesh up to 230k degenerate facets until `fit_layers()` started simplifying
  at 0.02 mm.
- Cutting the descender's full-depth base exactly on the frame edge left the
  tail *tangent* to it, pinching to a knife point where four faces met — a
  non-manifold edge no boolean can clean up. `OVERHANG_BITE` takes the cut
  0.4 mm inside the frame so the crossing is transversal. That bite must apply
  to the **outer boundary only**: shrinking the whole outline also pulls back
  from the plate opening, and since the script's top now sits exactly on that
  edge, it wrongly flagged a sliver there and pinched the white base.
- Stacked spans sharing a plane give the boolean coplanar faces and leave a
  T-junction (correct volume, 2 bad edges). `Z_WELD` extends the lower solid
  0.01 mm into the upper one, which removes the coplanar pair.
- Speed-line thickening has to happen **inside** the logo's fit loop. The speed
  lines are on the logo's right edge, nearest the screw hole, so fattening them
  after fitting ate into the keepout the fit had just satisfied.

## If you print a v2

`python export_3mf.py --v2` writes `chiang_mai_honda_frame_v2.3mf`. It is a
separate file on purpose: v1 is what the first pair of halves was printed with,
and two halves glued into one frame have to come off identical settings or the
seam shows a finish change straight down the middle. Never mix a v1 half with a
v2 half.

| | v1 | v2 |
|---|---|---|
| ironing | off | **on** (`ironing_type: top`) |
| part cooling fan | 40–90% | **20–50%** |
| print time, both plates | 2 h 50 m | **4 h 08 m** |
| filament | 60.0 g | 60.5 g |

**Ironing.** The white frame face is the largest surface anyone looks at, and v1
came off with visible monotonic line texture. Measured cost is +40 min per
plate, and **88% of it is layer 16** — the top of the white base, which is a
single-colour layer, so there is no chance of dragging red or black across it.
The remaining 12% is the artwork tops.

> The config value is the enum key `"top"`, **not** the UI label `"top surfaces"`.
> BambuStudio silently falls back to `no ironing` on an unrecognised enum rather
> than erroring — it accepted the file, reported success, and produced zero
> ironing extrusions. Check `; ironing_type = top` in the sliced G-code, not the
> value you put in the config.

**Fan.** Bambu's PETG profile runs 40–90%, inherited from a profile that cares
about overhangs. This part has none — it is a flat plate — and PETG fuses
line-to-line much better with less air on it. That is most of the difference
between a matte, visibly-lined surface and a glossy one.

**Flow ratio — measure this, don't guess.** `FLOW_RATIO` in `export_3mf.py` is
`None`, so the profile's conservative **0.95** stands. On the v1 print the
top-surface lines read as separated rather than fused, which is what slight
under-extrusion looks like, and Overture PETG is usually happy at 0.97–0.98. Run
**Calibration → Flow Rate** in Bambu Studio and put the answer in `FLOW_RATIO`.

> The auto-calibration the printer runs before every print is flow **dynamics**
> (pressure advance / K factor). It is a different measurement and it does not
> touch flow rate. Doing one is not doing the other.

**Do not sand it.** PETG is tough and rubbery, so it gums abrasive paper and
smears instead of powdering. And the artwork stands 1 mm proud, so paper only
reaches the high spots — the letter tops would flatten before the white base got
any smoother, and white dust packs into the red and black texture where it
cannot be got out. Chemical smoothing is out too: acetone does nothing to PETG,
and the solvents that do work on it would attack four colours unevenly and bleed
the boundaries.

## Next steps

1. **Open `chiang_mai_honda_frame.3mf` in Bambu Studio** and confirm two plates,
   four project filaments, and the color assignments. If anything is off, the
   STLs in `stl/pieces/` are a manual fallback — import them together and assign
   filaments by hand.
2. **Dry the PETG first** if the spools have been open — PETG picks up moisture
   and it shows on the fine logo detail more than anywhere else. Overture's label
   says 60 °C for 5 h.
3. **Test print the `left` piece first.** It is the smaller one and carries the
   whole logo, so it answers the real open risk: whether the thickened speed
   lines and the tiny "HONDA AUTOMOBILE" wordmark come out legible.
4. Dry-fit the joint and check the bolt holes against Lloyd's actual
   plate and bracket before printing the second half.
5. Print the right half, glue up, mount.
