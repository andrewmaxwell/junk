"""
Write the stand as one Bambu Studio project: two plates on an A1, PETG,
with print settings chosen for these parts.

    plate 1  sleeve + barrel + lock ring
    plate 2  carrier (unchanged since an earlier print; skip it if you have one)

The file layout follows chiang_mai_plate_frame/export_3mf.py, which documents
why each piece is there. The two easy-to-miss rules: the Application metadata
must start with "BambuStudio-", and each <part id> must equal its
<component objectid>, or Bambu Studio loads only the geometry and drops the
settings and filament assignments.

bambu_a1_template.json is the stock "Bambu Lab A1 0.4 nozzle / 0.20mm Standard"
project config and generic_petg_a1.json is Bambu's "Generic PETG @BBL A1". Both
are copied from the plate frame project, along with its overrides for the
Overture PETG in the AMS.
"""
import json
import math
import os
import re
import zipfile
from xml.sax.saxutils import escape

import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "bambu_a1_template.json")
FILAMENT_JSON = os.path.join(HERE, "generic_petg_a1.json")
FILAMENT_PRESET = "Generic PETG @BBL A1"
BAMBU_APP_VERSION = "02.09.01.70"  # the installed Bambu Studio

FILAMENTS = [("black", "#161616")]
# Options that hold one value per filament get resized to len(FILAMENTS).
# These same-length options don't: machine_* are per motion mode,
# wipe_tower_* per plate, the others printer-scoped.
KEEP_PREFIX = ("machine_",)
KEEP_EXACT = {"start_end_points", "wipe_tower_x", "wipe_tower_y", "extruder_ams_count"}
BED = 256.0
PLATE_PITCH = 307.2  # Bambu lays plates out on a grid this far apart

# On top of the stock 0.20mm Standard process.
PROCESS = {
    # PETG belongs on the textured PEI sheet; it can tear smooth PEI.
    "curr_bed_type": "Textured PEI Plate",
    # The hood collar, filter pocket and focusing thread are all fits. Make the
    # outer wall land on the modeled size, and keep PETG's wider first layer
    # from shrinking the holes that start on the bed.
    "precise_outer_wall": "1",
    "elefant_foot_compensation": "0.15",
    "wall_generator": "arachne",
    # Built for speed and little filament: the stand only carries a filter and
    # its own weight. Every wall is 2-3 mm, which two 0.42 mm loops plus
    # Arachne's gap fill make solid, so infill hardly comes into it.
    "layer_height": "0.24",
    "wall_loops": "2",
    # Gyroid never crosses itself, so the nozzle doesn't knock PETG's tacky
    # infill crossings.
    "sparse_infill_pattern": "gyroid",
    "sparse_infill_density": "10%",
    "top_shell_layers": "3",
    "bottom_shell_layers": "3",
    # No supports: the model is drawn to print without them (45 degree
    # undersides, breakaway ribs in the carrier slot). Thick
    # bridges make the short spans between those ribs sturdier.
    "enable_support": "0",
    "thick_bridges": "1",
    # Every part has a big flat footprint, and the carrier's underside is what
    # rests on the barrel's ring, so no brim edge on it.
    "brim_type": "no_brim",
    # Each plate uses one filament, so there is nothing to purge into a tower.
    "enable_prime_tower": "0",
}

# The Overture PETG in the AMS: its label asks for a 65-70 C bed, against
# Bambu's 80, and direct-drive PETG wants a little more retraction than the
# A1's PLA-tuned 0.8 mm. Cooling stays at the PETG profile's own values
# (40-90%, 90% on overhangs), which the bridges and 45 degree ledges need.
FILAMENT = {
    "textured_plate_temp": "70",
    "textured_plate_temp_initial_layer": "70",
    "filament_retraction_length": "1",
}

IDENTITY3 = "1 0 0 0 1 0 0 0 1 0 0 0"
IDENTITY4 = "1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"

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


def plate_origin(i, n_plates):
    """Bambu puts plates in a grid ceil(sqrt(n)) wide, later rows toward -y."""
    cols = math.ceil(math.sqrt(n_plates))
    return (i % cols) * PLATE_PITCH, -(i // cols) * PLATE_PITCH


def project_settings(n_plates):
    cfg = json.load(open(TEMPLATE))
    petg = json.load(open(FILAMENT_JSON))
    n = len(FILAMENTS)
    old_n = len(cfg["filament_colour"])
    for key, val in list(cfg.items()):
        if isinstance(val, list) and len(val) == old_n and not key.startswith(KEEP_PREFIX) and key not in KEEP_EXACT:
            cfg[key] = [val[0]] * n

    for key, val in petg.items():
        cfg[key] = val * n if isinstance(val, list) else val
    cfg["filament_ids"] = [petg["filament_id"]] * n
    cfg["filament_settings_id"] = [FILAMENT_PRESET] * n
    cfg["filament_type"] = ["PETG"] * n
    for key, val in FILAMENT.items():
        cfg[key] = [val] * n

    colours = [hexcode for _name, hexcode in FILAMENTS]
    cfg["filament_colour"] = colours
    cfg["filament_multi_colour"] = colours
    cfg["filament_colour_type"] = ["1"] * n
    cfg["filament_self_index"] = [str(i + 1) for i in range(n)]
    cfg["filament_map"] = ["1"] * n
    # One filament, so nothing is ever flushed, but the CLI slicer rejects the
    # file unless the matrix is n x n.
    cfg["flush_volumes_matrix"] = ["0"] * n * n
    cfg["flush_volumes_vector"] = ["107"] * (2 * n)

    cfg.update(PROCESS)
    for key in ("wipe_tower_x", "wipe_tower_y"):
        cfg[key] = [cfg[key][0]] * n_plates
    cfg["version"] = BAMBU_APP_VERSION
    cfg["different_settings_to_system"] = settings_diff(n)
    return json.dumps(cfg, indent=4)


def settings_diff(n):
    """The keys that differ from the system presets named in print_settings_id
    and filament_settings_id: [process, one per filament, printer]. The Bambu
    Studio app (not the CLI) rebuilds each preset from its system parent when
    it opens a project and keeps only the keys listed here, so without it the
    app shows stock 0.20mm Standard and stock Generic PETG."""
    stock = json.load(open(TEMPLATE))
    print_keys = sorted(k for k, v in PROCESS.items() if k != "curr_bed_type" and stock.get(k) != v)
    filament_keys = ";".join(sorted(FILAMENT))
    return [";".join(print_keys)] + [filament_keys] * n + [""]


def mesh_xml(mesh, oid):
    out = [f'  <object id="{oid}" type="model">', "   <mesh>", "    <vertices>"]
    out += ['     <vertex x="%.5f" y="%.5f" z="%.5f"/>' % tuple(p) for p in mesh.vertices]
    out += ["    </vertices>", "    <triangles>"]
    out += ['     <triangle v1="%d" v2="%d" v3="%d"/>' % tuple(t) for t in mesh.faces]
    out += ["    </triangles>", "   </mesh>", "  </object>"]
    return "\n".join(out)


def write(path, plates):
    """plates: [(plate name, [(object name, trimesh, filament name, (x, y) on the bed)])]"""
    n_plates = len(plates)
    filament_no = {name: i + 1 for i, (name, _hex) in enumerate(FILAMENTS)}
    objects = []  # (mesh id, container id, name, mesh, filament, plate, x, y)
    next_id = 1
    for p, (_plate_name, items) in enumerate(plates):
        for name, mesh, filament, (x, y) in items:
            lo, hi = mesh.bounds
            assert lo[2] > -1e-6 and abs(lo[2]) < 1e-6, f"{name} must sit on z = 0"
            assert x + lo[0] >= 0 and y + lo[1] >= 0 and x + hi[0] <= BED and y + hi[1] <= BED, f"{name} is off the bed"
            ox, oy = plate_origin(p, n_plates)
            objects.append((next_id, next_id + 1, name, mesh, filament_no[filament], p, ox + x, oy + y))
            next_id += 2

    model = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<model unit="millimeter" xml:lang="en-US"'
        ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"'
        ' xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">',
        f' <metadata name="Application">BambuStudio-{BAMBU_APP_VERSION}</metadata>',
        ' <metadata name="BambuStudio:3mfVersion">1</metadata>',
        " <resources>",
    ]
    for mid, cid, _name, mesh, *_ in objects:
        model.append(mesh_xml(mesh, mid))
        model += [f'  <object id="{cid}" type="model">', "   <components>",
                  f'    <component objectid="{mid}" transform="{IDENTITY3}"/>', "   </components>", "  </object>"]
    model += [" </resources>", " <build>"]
    for _mid, cid, _name, _mesh, _f, _p, x, y in objects:
        model.append(f'  <item objectid="{cid}" transform="1 0 0 0 1 0 0 0 1 {x:.4f} {y:.4f} 0" printable="1"/>')
    model += [" </build>", "</model>"]

    cfg = ['<?xml version="1.0" encoding="UTF-8"?>', "<config>"]
    for mid, cid, name, mesh, filament, *_ in objects:
        cfg += [
            f'  <object id="{cid}">',
            f'    <metadata key="name" value="{escape(name)}"/>',
            f'    <metadata key="extruder" value="{filament}"/>',
            f'    <metadata face_count="{len(mesh.faces)}"/>',
            f'    <part id="{mid}" subtype="normal_part">',
            f'      <metadata key="name" value="{escape(name)}"/>',
            f'      <metadata key="matrix" value="{IDENTITY4}"/>',
            f'      <metadata key="extruder" value="{filament}"/>',
            f'      <mesh_stat face_count="{len(mesh.faces)}" edges_fixed="0" degenerate_facets="0"'
            ' facets_removed="0" facets_reversed="0" backwards_edges="0"/>',
            "    </part>",
            "  </object>",
        ]
    for p, (plate_name, _items) in enumerate(plates):
        cfg += ["  <plate>", f'    <metadata key="plater_id" value="{p + 1}"/>',
                f'    <metadata key="plater_name" value="{escape(plate_name)}"/>',
                '    <metadata key="locked" value="false"/>']
        for _mid, cid, *_rest, plate, _x, _y in objects:
            if plate == p:
                cfg += ["    <model_instance>", f'      <metadata key="object_id" value="{cid}"/>',
                        '      <metadata key="instance_id" value="0"/>', "    </model_instance>"]
        cfg.append("  </plate>")
    cfg.append("</config>")

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("3D/3dmodel.model", "\n".join(model) + "\n")
        z.writestr("Metadata/model_settings.config", "\n".join(cfg) + "\n")
        z.writestr("Metadata/project_settings.config", project_settings(n_plates))
    verify(path, len(objects))


def verify(path, n_objects):
    """Read the file back and check the things Bambu Studio fails on silently."""
    with zipfile.ZipFile(path) as z:
        model = z.read("3D/3dmodel.model").decode()
        settings = z.read("Metadata/model_settings.config").decode()
        cfg = json.loads(z.read("Metadata/project_settings.config"))
    assert re.search(r'name="Application">BambuStudio-', model)
    assert cfg["printer_model"] == "Bambu Lab A1"
    assert re.findall(r'<component objectid="(\d+)"', model) == re.findall(r'<part id="(\d+)"', settings)
    assert len(cfg["flush_volumes_matrix"]) == len(FILAMENTS) ** 2
    assert all(t == "PETG" for t in cfg["filament_type"])
    # Without this the app drops every PROCESS and FILAMENT override.
    diff = cfg.get("different_settings_to_system", [])
    assert len(diff) == len(FILAMENTS) + 2 and diff[0] and all(diff[1:-1])
    scene = trimesh.load(path)
    assert len(scene.geometry) == n_objects and all(g.is_watertight for g in scene.geometry.values())
