"""
Write a single Bambu Studio .3mf: both frame halves, on two plates, with the
colours already assigned to AMS slots.

Getting Bambu Studio to accept this as a *project* (rather than silently
falling back to "load geometry data only") needs two things that are easy to
miss. Both were read straight out of the BambuStudio source:

1. `<metadata name="Application">` must start with the literal `"BambuStudio-"`.
   `_BBS_3MF_Importer::_handle_end_metadata()` (bbs_3mf.cpp) sets its
   `m_is_bbl_3mf` flag *only* on that prefix, and without the flag the plate
   assignments and per-part extruders are thrown away.

2. `Metadata/project_settings.config` must be present and describe a real BBL
   printer. Plater.cpp does:
       if (!is_bbl_vendor_config(cfg, bundle) && !check_project_config(cfg))
           show_info("The 3mf file has invalid config, load geometry data only")
   `is_bbl_vendor_config` wants `printer_model` to name a machine in the BBL
   vendor list; `check_project_config` wants `nozzle_diameter`, and if there is
   more than one extruder, an `extruder_type` of matching length.

`bambu_a1_project.json` is the stock "Bambu Lab A1 0.4 nozzle / 0.20mm Standard
/ Bambu PLA Basic" profile, carrying two filaments. It gets expanded here to
one filament per colour.

Format of the model itself: `3D/3dmodel.model` holds one <object> per colour
mesh plus one container <object> per piece whose <components> reference them.
`Metadata/model_settings.config` gives each container a <part> per component --
**part id must equal the component's objectid** -- and it is the part's
`extruder` value that assigns the colour.

Run:  python export_3mf.py   ->  chiang_mai_honda_frame.3mf
"""
import json
import math
import os
import re
import sys
import zipfile
from xml.sax.saxutils import escape

import trimesh

from split import pieces, colour_specs, COLOURS, check
from mesh_util import extrude_layers, BED_X, BED_Y

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "chiang_mai_honda_frame.3mf")
TEMPLATE = os.path.join(HERE, "bambu_a1_project.json")
FILAMENT_JSON = os.path.join(HERE, "generic_petg_a1.json")
FILAMENT_PRESET = "Generic PETG @BBL A1"

# AMS slot order, and the colour each slot shows in Bambu Studio.
FILAMENTS = [("white", "#FFFFFF"), ("red", "#E2231A"),
             ("black", "#1A1A1A"), ("green", "#1C7A3C")]
EXTRUDER = {name: i + 1 for i, (name, _hex) in enumerate(FILAMENTS)}

# Must start with "BambuStudio-" (see note 1 above). Matches the installed app.
BAMBU_APP_VERSION = "02.08.02.61"

PLATE_W, PLATE_D = BED_X, BED_Y  # A1 build plate
PLATE_PITCH = 307.2              # Bambu spaces plates this far apart in X
IDENTITY3 = "1 0 0 0 1 0 0 0 1 0 0 0"
IDENTITY4 = "1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"

# ------------------------------------------------------- process overrides
# On top of the stock "0.20mm Standard @BBL A1" process. Everything here is
# either a consequence of the material (PETG, not the PLA the preset assumes)
# or of what this particular part is: a wide flat plate whose only detail is
# 1 mm of embossed artwork in four colours.
PROCESS = {
    # -- material ---------------------------------------------------------
    # PETG wants the textured PEI sheet; it bonds to smooth PEI hard enough to
    # tear the coating off. The stock preset says "High Temp Plate".
    "curr_bed_type": "Textured PEI Plate",
    # PETG squashes wider on the first layer than PLA. The seam is a butt joint
    # and the locating tabs run at 0.15 mm clearance per face, so a first-layer
    # lip is exactly what stops the halves closing flush. 0.075 -> 0.15.
    "elefant_foot_compensation": "0.15",

    # -- colour changes ---------------------------------------------------
    # Nothing here, deliberately. Three plausible knobs were sliced and
    # measured (BambuStudio CLI, --slice 0) and all three earn nothing:
    #   flush_into_infill      -- no change. Every colour swap now happens in
    #                             the top 1 mm, which is solid; there is no
    #                             infill on those layers to purge into.
    #   prime_tower_width      -- no change at 35 / 25 / 18 mm. The tower sizes
    #                             its depth to the purge volume it must hold.
    #   wipe_tower_no_sparse_layers
    #                          -- won't slice: a compacted tower needs the
    #                             toolhead to clear the model, and this one
    #                             covers most of the bed.
    # flush_multiplier is left at 0.5. Dropping it to 0.35 saves 0.43 g, which
    # is not worth risking red bleeding into the white.

    # -- the show surface -------------------------------------------------
    # The part prints emboss-up, so the visible face is the TOP surface and the
    # flat back sits on the bed. Everything below is about that face.
    #
    # Route travels around features instead of over them. Same reason as the
    # retraction bump: it keeps the nozzle from dragging across the artwork.
    "reduce_crossing_wall": "1",
    # Grid infill crosses itself, and the nozzle knocks the crossings on the way
    # past -- a well-known PETG problem, since PETG stays tacky and lifts rather
    # than being shaved flat. Gyroid never intersects itself. Only 8 of the 21
    # layers are sparse, so the cost is small.
    "sparse_infill_pattern": "gyroid",
    # auto_brim currently decides *not* to add one, and a 34,000 mm^2 footprint
    # in PETG has no adhesion problem. But "currently" is the issue: a brim is
    # laid around the whole outline, and on these pieces that includes the seam
    # face, which has to close to a 0.000 mm butt joint. Never let the slicer
    # make that call on its own.
    "brim_type": "no_brim",

    # -- detail -----------------------------------------------------------
    # The logo's speed lines are 0.8 mm wide and the script has thinner strokes
    # still. The classic generator only lays whole 0.42 mm lines and drops or
    # gap-fills what is left; Arachne varies the width to fit the feature.
    "wall_generator": "arachne",
    # Makes the outer wall land on the modelled dimension instead of half a
    # line width inside it -- which is the difference between the tabs seating
    # and the tabs rattling.
    "precise_outer_wall": "1",
}

# ------------------------------------------------- filament overrides
# Applied on top of generic_petg_a1.json, which stays a faithful extraction of
# Bambu's own "Generic PETG @BBL A1". The spool in the AMS is Overture PETG, and
# its label specifies a 65-70 C bed against Bambu's 80. 80 C prints fine, but the
# README's warning about PETG gripping the textured plate applies double at 80,
# and the seam has to close flush -- a fatter first layer is exactly what stops
# it. 70 C is the top of Overture's range: still ample adhesion for a part with
# this much bed contact. Nozzle (255) is mid-range for Overture's 230-260, and
# every other filament key already agrees with the label, so nothing else moves.
FILAMENT = {
    "textured_plate_temp": "70",
    "textured_plate_temp_initial_layer": "70",
    # Bambu's A1 default retraction is 0.8 mm, tuned for PLA. PETG on a direct
    # drive wants 1.0-1.2; 1.0 is the conservative end (past ~2 mm PETG starts
    # clogging A1 hotends). This part is the case retraction exists for: the top
    # five layers are ~40 separate artwork islands -- letters, counters, four
    # 0.8 mm speed lines -- so almost every travel on the show surface crosses
    # open air. Strings there land on the only face anyone looks at.
    "filament_retraction_length": "1",
}

# ---------------------------------------------------- v2 finish (opt-in)
# `python export_3mf.py --v2` writes chiang_mai_honda_frame_v2.3mf with these on
# top of everything above. Kept OUT of the default build on purpose: v1 is what
# the first pair of halves was printed with, and two halves that get glued into
# one frame have to come off identical settings or the seam shows a finish
# change straight down the middle.
#
# Set FLOW_RATIO from Bambu Studio's *flow rate* calibration (Calibration menu).
# The auto-cali the printer runs before a print is flow DYNAMICS (pressure
# advance / K) -- a different thing, and it does not touch this number.
FLOW_RATIO = None                  # e.g. "0.98"; None keeps the profile's 0.95

V2_PROCESS = {
    # The white frame face is the largest thing anyone looks at, and on v1 it
    # came out with visible monotonic line texture. Ironing flattens it.
    # Measured cost: +40 min per plate. 88% of that is layer 16, the top of the
    # white base -- which is a single-colour layer, so there is no chance of
    # dragging red or black across it. The other 12% is the artwork tops.
    # NB the config value is the enum key "top", not the UI label "top
    # surfaces": BambuStudio silently falls back to "no ironing" on a bad enum,
    # which is exactly what it did the first time this was tried.
    "ironing_type": "top",
}

V2_FILAMENT = {
    # Bambu's PETG profile runs 40-90% part cooling, inherited from a profile
    # that cares about overhangs. This part has none -- it is a flat plate --
    # and PETG fuses line-to-line much better with less air on it. Softer
    # cooling is most of the difference between a matte, visibly-lined surface
    # and a glossy one.
    "fan_min_speed": "20",
    "fan_max_speed": "50",
}

# Per-filament options get one entry per filament. These same-length options do
# not: machine_* are per motion-mode (normal/stealth), wipe_tower_* are
# per-plate, and the other two are printer-scoped.
KEEP_PREFIX = ("machine_",)
KEEP_EXACT = {"start_end_points", "wipe_tower_x", "wipe_tower_y",
              "extruder_ams_count"}

# ---------------------------------------------------------------- flush volumes
# `flush_volumes_matrix` is n*n entries; the template ships 2 filaments, so it
# has to be rebuilt for four. Bambu Studio regenerates it silently in the GUI
# but the CLI slicer refuses the file outright ("Flush volumes matrix do not
# match to the correct size!"), so the numbers are computed here.
#
# Port of FlushVolCalculator::calc_flush_vol_rgb (BambuStudio,
# src/libslic3r/FlushVolCalc.cpp): hue/saturation distance and luminance
# distance are combined as two sides of a 120-degree triangle, so going *to* a
# lighter colour costs far more than going to a darker one.
G_MAX_FLUSH_VOLUME = 900
MIN_FLUSH_VOLUME = 107      # nozzle-to-cutter volume: pi*(1.75/2)^2 * 44.5


def _luminance(r, g, b):
    return r * 0.3 + g * 0.59 + b * 0.11


def _rgb2hsv(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d == 0:
        h = 0.0
    elif mx == r:
        h = 60.0 * (((g - b) / d) % 6)
    elif mx == g:
        h = 60.0 * ((b - r) / d + 2)
    else:
        h = 60.0 * ((r - g) / d + 4)
    return h, (0.0 if mx == 0 else d / mx), mx


def _delta_hs(h1, s1, v1, h2, s2, v2):
    a, b = math.radians(h1), math.radians(h2)
    dx = math.cos(a) * s1 * v1 - math.cos(b) * s2 * v2
    dy = math.sin(a) * s1 * v1 - math.sin(b) * s2 * v2
    return min(1.2, math.hypot(dx, dy))


def flush_volume(src_hex, dst_hex):
    """mm^3 to purge changing from src_hex to dst_hex."""
    s = [int(src_hex[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
    d = [int(dst_hex[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
    sh, ss, sv = _rgb2hsv(*s)
    dh, ds, dv = _rgb2hsv(*d)
    hs_dist = _delta_hs(sh, ss, sv, dh, ds, dv)

    from_l, to_l = _luminance(*s), _luminance(*d)
    if to_l >= from_l:
        lumi = (to_l - from_l) ** 0.7 * 560.0
    else:
        lumi = (from_l - to_l) * 80.0
        hs_dist = min(0.67 * dv + 0.33 * sv, hs_dist)
    hs = 230.0 * hs_dist

    # third edge of a triangle with a 120 degree included angle
    vol = math.sqrt(hs * hs + lumi * lumi - 2 * hs * lumi * math.cos(math.radians(120)))
    vol = max(vol, 60.0) + MIN_FLUSH_VOLUME
    return min(int(vol), G_MAX_FLUSH_VOLUME)


def flush_matrix():
    out = []
    for _sn, sh in FILAMENTS:
        for _dn, dh in FILAMENTS:
            out.append("0" if sh == dh else str(flush_volume(sh, dh)))
    return out


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
</Types>
"""

RELS = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
"""


def project_settings(n_plates):
    """Stock A1 profile + Generic PETG, expanded to our four filaments."""
    cfg = json.load(open(TEMPLATE))
    petg = json.load(open(FILAMENT_JSON))
    old_n = len(cfg["filament_colour"])
    n = len(FILAMENTS)

    # The template carries two filaments. Grow every per-filament option to n.
    for key, val in list(cfg.items()):
        if not isinstance(val, list) or len(val) != old_n:
            continue
        if key.startswith(KEEP_PREFIX) or key in KEEP_EXACT:
            continue
        cfg[key] = [val[0]] * n

    # Swap PLA out for Generic PETG. Every key here is filament-scoped, and
    # holds one group of values per filament (usually one, a few hold more), so
    # repeating the profile's own list n times is right in either case.
    for key, val in petg.items():
        cfg[key] = val * n if isinstance(val, list) else val
    cfg["filament_ids"] = [petg["filament_id"]] * n
    cfg["filament_settings_id"] = [FILAMENT_PRESET] * n
    cfg["filament_type"] = ["PETG"] * n
    for key, val in FILAMENT.items():        # our overrides, see above
        cfg[key] = [val] * n

    colours = [hexcode for _n, hexcode in FILAMENTS]
    cfg["filament_colour"] = colours
    cfg["filament_multi_colour"] = colours
    cfg["filament_colour_type"] = ["1"] * n          # solid, not gradient
    cfg["filament_self_index"] = [str(i + 1) for i in range(n)]
    cfg["filament_map"] = ["1"] * n                  # A1: one extruder

    cfg["flush_volumes_matrix"] = flush_matrix()
    cfg["flush_volumes_vector"] = [str(MIN_FLUSH_VOLUME)] * (2 * n)

    cfg.update(PROCESS)

    # one wipe-tower position per plate
    for key in ("wipe_tower_x", "wipe_tower_y"):
        if key in cfg:
            cfg[key] = [cfg[key][0]] * n_plates
    cfg["version"] = BAMBU_APP_VERSION
    return json.dumps(cfg, indent=4)


def mesh_xml(mesh, oid):
    out = [f'  <object id="{oid}" type="model">', '   <mesh>', '    <vertices>']
    out += ['     <vertex x="%.5f" y="%.5f" z="%.5f"/>' % (p[0], p[1], p[2])
            for p in mesh.vertices]
    out += ['    </vertices>', '    <triangles>']
    out += ['     <triangle v1="%d" v2="%d" v3="%d"/>' % (t[0], t[1], t[2])
            for t in mesh.faces]
    out += ['    </triangles>', '   </mesh>', '  </object>']
    return "\n".join(out)


def build():
    P = pieces()
    order = ["left", "right"]

    meshes = {}
    next_id = 1
    for name in order:
        piece = P[name]
        entries = []
        minx, miny, maxx, maxy = piece["_outline"].bounds
        cx, cy = (minx + maxx) / 2, (miny + maxy) / 2     # centre on its plate
        for c in COLOURS:
            specs = colour_specs(piece["layers"], c)
            if not specs:
                continue
            m = extrude_layers(specs)
            if m is None:
                continue
            m.apply_translation([-cx, -cy, 0.0])
            entries.append((c, m, next_id))
            next_id += 1
        meshes[name] = entries

    container_id = {name: next_id + i for i, name in enumerate(order)}

    # ---------------- 3dmodel.model ----------------
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<model unit="millimeter" xml:lang="en-US"'
             ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"'
             ' xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">',
             f' <metadata name="Application">BambuStudio-{BAMBU_APP_VERSION}</metadata>',
             ' <metadata name="BambuStudio:3mfVersion">1</metadata>',
             ' <resources>']
    for name in order:
        for _c, m, oid in meshes[name]:
            parts.append(mesh_xml(m, oid))
    for name in order:
        parts.append(f'  <object id="{container_id[name]}" type="model">')
        parts.append('   <components>')
        for _c, _m, oid in meshes[name]:
            parts.append(f'    <component objectid="{oid}" transform="{IDENTITY3}"/>')
        parts.append('   </components>')
        parts.append('  </object>')
    parts.append(' </resources>')
    parts.append(' <build>')
    for i, name in enumerate(order):
        x = PLATE_W / 2 + i * PLATE_PITCH
        parts.append(f'  <item objectid="{container_id[name]}"'
                     f' transform="1 0 0 0 1 0 0 0 1 {x:.4f} {PLATE_D/2:.4f} 0"'
                     ' printable="1"/>')
    parts.append(' </build>')
    parts.append('</model>')
    model_xml = "\n".join(parts) + "\n"

    # ---------------- model_settings.config ----------------
    cfg = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>']
    for name in order:
        oid = container_id[name]
        cfg.append(f'  <object id="{oid}">')
        cfg.append(f'    <metadata key="name" value="cmhonda-frame-{escape(name)}"/>')
        cfg.append('    <metadata key="extruder" value="1"/>')
        cfg.append(f'    <metadata face_count="{sum(len(m.faces) for _c, m, _ in meshes[name])}"/>')
        for c, m, mid in meshes[name]:
            cfg.append(f'    <part id="{mid}" subtype="normal_part">')
            cfg.append(f'      <metadata key="name" value="{escape(c)}"/>')
            cfg.append(f'      <metadata key="matrix" value="{IDENTITY4}"/>')
            cfg.append(f'      <metadata key="extruder" value="{EXTRUDER[c]}"/>')
            cfg.append(f'      <mesh_stat face_count="{len(m.faces)}" edges_fixed="0"'
                       ' degenerate_facets="0" facets_removed="0"'
                       ' facets_reversed="0" backwards_edges="0"/>')
            cfg.append('    </part>')
        cfg.append('  </object>')
    for i, name in enumerate(order):
        cfg.append('  <plate>')
        cfg.append(f'    <metadata key="plater_id" value="{i+1}"/>')
        cfg.append(f'    <metadata key="plater_name" value="{escape(name)} half"/>')
        cfg.append('    <metadata key="locked" value="false"/>')
        cfg.append('    <metadata key="filament_map_mode" value="Auto For Flush"/>')
        cfg.append('    <model_instance>')
        cfg.append(f'      <metadata key="object_id" value="{container_id[name]}"/>')
        cfg.append('      <metadata key="instance_id" value="0"/>')
        cfg.append('    </model_instance>')
        cfg.append('  </plate>')
    cfg.append('</config>')
    settings_xml = "\n".join(cfg) + "\n"

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("3D/3dmodel.model", model_xml)
        z.writestr("Metadata/model_settings.config", settings_xml)
        z.writestr("Metadata/project_settings.config", project_settings(len(order)))

    print(f"wrote {os.path.relpath(OUT, HERE)} ({os.path.getsize(OUT)/1024:.0f} KB)")
    print(f"  Application = BambuStudio-{BAMBU_APP_VERSION}  (must start "
          f'"BambuStudio-" or the config is ignored)\n')
    for i, name in enumerate(order):
        allm = trimesh.util.concatenate([m for _c, m, _ in meshes[name]])
        lo, hi = allm.bounds
        w, d = hi[0]-lo[0], hi[1]-lo[1]
        print(f"plate {i+1}: {name:5s}  {w:6.1f} x {d:6.1f} x {hi[2]-lo[2]:.2f} mm  "
              f"{'fits' if w <= PLATE_W and d <= PLATE_D else '*** TOO BIG ***'}")
        for c, m, _mid in meshes[name]:
            print(f"           {c:6s} -> AMS slot {EXTRUDER[c]}  "
                  f"{len(m.faces):6d} faces  watertight={m.is_watertight}")
    return OUT


def verify(path=OUT):
    """Re-open the written file and check every claim made about it.

    Deliberately reads the file back rather than trusting the variables that
    wrote it: the failure this guards against ("invalid config, load geometry
    data only") is silent, and shows up only as colours quietly reverting to
    slot 1.
    """
    print("checks:")
    with zipfile.ZipFile(path) as z:
        model = z.read("3D/3dmodel.model").decode()
        settings = z.read("Metadata/model_settings.config").decode()
        cfg = json.loads(z.read("Metadata/project_settings.config"))

    app = re.search(r'<metadata name="Application">([^<]*)</metadata>', model).group(1)
    check(app.startswith("BambuStudio-"), 'Application starts with "BambuStudio-"', app)

    # Plater.cpp: is_bbl_vendor_config() || check_project_config()
    check(cfg.get("printer_model") == "Bambu Lab A1",
           "printer_model names a BBL machine", str(cfg.get("printer_model")))
    nozzles = cfg.get("nozzle_diameter") or []
    check(len(nozzles) >= 1, "nozzle_diameter present", str(nozzles))
    check(len(nozzles) == 1 or len(cfg.get("extruder_type", [])) == len(nozzles),
           "extruder_type matches the extruder count")

    n = len(FILAMENTS)
    check(len(cfg["filament_colour"]) == n, f"{n} filaments declared",
           ", ".join(f"{c}={h}" for (c, _), h in zip(FILAMENTS, cfg["filament_colour"])))
    check(len(cfg["flush_volumes_matrix"]) == n * n,
           "flush_volumes_matrix is n^2", f"{len(cfg['flush_volumes_matrix'])} entries")
    check(all(t == "PETG" for t in cfg["filament_type"]), "all four filaments are PETG")

    # part id == component objectid is what makes Bambu apply the right extruder
    comps = re.findall(r'<component objectid="(\d+)"', model)
    parts = re.findall(r'<part id="(\d+)"', settings)
    check(comps == parts, "every <part id> matches its <component objectid>",
           f"{len(comps)} parts")
    used = sorted({int(e) for e in re.findall(r'key="extruder" value="(\d+)"', settings)})
    check(used and max(used) <= n, "extruders within the AMS slot count", str(used))

    scene = trimesh.load(path)            # round-trip through a 3MF reader
    check(len(scene.geometry) == len(comps), "file round-trips with every mesh",
           f"{len(scene.geometry)} meshes")
    bad = [k for k, g in scene.geometry.items() if not g.is_watertight]
    check(not bad, "all meshes watertight after round-trip", str(bad))

    for i, item in enumerate(re.findall(r'<item [^>]*transform="([^"]*)"', model)):
        x, y = (float(v) for v in item.split()[9:11])
        check(abs(x - (PLATE_W / 2 + i * PLATE_PITCH)) < 1e-3 and abs(y - PLATE_D / 2) < 1e-3,
              f"plate {i+1} object sits at its plate centre", f"({x:.1f}, {y:.1f})")

    # group the meshes back into pieces the way the file itself does: by which
    # container <object> lists them as components
    containers = re.findall(
        r'<object id="(\d+)" type="model">\s*<components>(.*?)</components>', model, re.S)
    for (oid, body), name in zip(containers, ("left", "right")):
        ids = re.findall(r'objectid="(\d+)"', body)
        b = trimesh.util.concatenate([scene.geometry[i] for i in ids]).bounds
        w, d = b[1][0] - b[0][0], b[1][1] - b[0][1]
        check(w <= PLATE_W and d <= PLATE_D,
              f"{name} (object {oid}) fits the build plate", f"{w:.1f} x {d:.1f} mm")


if __name__ == "__main__":
    if "--v2" in sys.argv:
        PROCESS.update(V2_PROCESS)
        FILAMENT.update(V2_FILAMENT)
        if FLOW_RATIO:
            FILAMENT["filament_flow_ratio"] = FLOW_RATIO
        OUT = OUT.replace(".3mf", "_v2.3mf")
        print(f"v2 finish: ironing on, fan {V2_FILAMENT['fan_min_speed']}-"
              f"{V2_FILAMENT['fan_max_speed']}%, flow "
              f"{FLOW_RATIO or 'unchanged (calibrate it!)'}\n")
    build()
    verify()
