"""
Download the OSM data the neighborhood map needs and preprocess it into a single
compact file the browser loads: map.json.

The raw OSM street network is ~170 MB of GeoJSON: full-precision lon/lat plus 20
properties per street, almost all unused. This script throws away everything the
app doesn't read and rewrites what's left in a tiny pre-baked format:

  - Project lon/lat -> local meters once, here, so the browser never projects.
  - Quantize coordinates to integer meters (~1 m; imperceptible at city scale)
    and simplify each street with Douglas-Peucker (1 m tolerance), dropping
    redundant shape points without moving any intersection.
  - Pool vertices: every distinct point is stored once in a flat `points` array;
    streets reference points by integer index. A street's first and
    last indices double as its intersection ("node") ids -- streets that share an
    endpoint index meet at the same intersection -- so connectivity is exact
    without storing OSM's giant node ids.
  - Keep a tiny per-street flag bitfield (major road? slow <=25 mph?) plus the
    set of traffic-signal nodes; drop names and everything else.

map.json format:
  { "span": [W, H],                      # world size in meters (min corner is 0,0)
    "points": [x0, y0, x1, y1, ...],     # flat integer-meter vertex pool
    "streets": [[flags, i0, i1, ...]],   # flags bit0=major, bit1=slow(<=25mph)
    "signals": [pi, ...] }               # point indices that have a traffic signal

Run this on your own machine (it needs to reach the Overpass API).

Install deps:
    pip install osmnx geopandas

Bounding box:
  Upper-left  (lat, lon): 38.85608, -90.41971
  Lower-right (lat, lon): 38.75884, -90.17218
"""

import json
import math

import osmnx as ox

# osmnx 2.x bbox format is (left, bottom, right, top) = (west, south, east, north)
BBOX = (-90.94383548640562, 38.43733497718, -89.92306015621752, 38.89566929829215)

# Be generous with the Overpass server -- this is a large area.
ox.settings.requests_timeout = 300
ox.settings.overpass_settings = "[out:json][timeout:300]"

# Source of truth for major/minor classification. A street is a "major road"
# (a hard neighborhood barrier) if any of its highway tags is in this set.
MAJOR = {
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "motorway_link",
    "trunk_link",
    "primary_link",
    "secondary_link",
    "tertiary_link",
    "busway",
}

SIMPLIFY_M = 1.0  # Douglas-Peucker tolerance, meters (interior shape points only)

# Highway types assumed to be <=25 mph when a street has no maxspeed tag (only
# ~18% of streets do). Everything else (tertiary and up) is assumed faster.
SLOW_TYPES = {"residential", "living_street", "unclassified", "service", "road"}
SLOW_MPH = 25


def is_major(hw):
    return any(h in MAJOR for h in hw) if isinstance(hw, list) else hw in MAJOR


def parse_mph(maxspeed):
    """Best-effort mph from an OSM maxspeed tag (str/list); None if unknown."""
    if maxspeed is None:
        return None
    vals = maxspeed if isinstance(maxspeed, list) else [maxspeed]
    speeds = []
    for v in vals:
        s = str(v).strip().lower()
        digits = "".join(ch for ch in s if ch.isdigit())
        if not digits:
            continue
        n = int(digits)
        if "km" in s or "kph" in s:  # rare in US data; convert to mph
            n = round(n / 1.609)
        speeds.append(n)
    return max(speeds) if speeds else None  # if any part is fast, treat as fast


def is_slow(maxspeed, highway):
    """True if the street's speed limit is <= 25 mph (tagged, else inferred)."""
    mph = parse_mph(maxspeed)
    if mph is not None:
        return mph <= SLOW_MPH
    types = highway if isinstance(highway, list) else [highway]
    return all(t in SLOW_TYPES for t in types)


def douglas_peucker(pts, eps):
    """Simplify a polyline of (x, y) meter points, always keeping the endpoints."""
    if eps <= 0 or len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        d2 = dx * dx + dy * dy
        dmax, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if d2 == 0:
                dist = math.hypot(px - ax, py - ay)
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / d2
                t = 0.0 if t < 0 else 1.0 if t > 1 else t
                dist = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if dist > dmax:
                dmax, idx = dist, i
        if dmax > eps:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [pts[i] for i in range(len(pts)) if keep[i]]


def preprocess(streets, signal_nodes, out_path):
    """streets: list of (highway, maxspeed, u, v, [(lon,lat),...]).
    signal_nodes: set of OSM node ids that carry a traffic signal."""
    # --- Projection bounds (equirectangular about the data's min corner) ---
    min_lon = min_lat = math.inf
    max_lon = max_lat = -math.inf
    for _, _, _, _, coords in streets:
        for lon, lat in coords:
            min_lon, max_lon = min(min_lon, lon), max(max_lon, lon)
            min_lat, max_lat = min(min_lat, lat), max(max_lat, lat)
    m_per_lon = 111320 * math.cos(math.radians((min_lat + max_lat) / 2))

    def to_m(lon, lat):
        return ((lon - min_lon) * m_per_lon, (lat - min_lat) * 111320)

    points = []
    node_pool = {}  # osm node id -> point index (endpoints; keeps connectivity exact)
    coord_pool = {}  # (xi, yi) -> point index (interior + water shape points)

    def node_pid(node_id, x, y):
        i = node_pool.get(node_id)
        if i is None:
            i = len(points) // 2
            node_pool[node_id] = i
            points.append(round(x))
            points.append(round(y))
        return i

    def coord_pid(x, y):
        k = (round(x), round(y))
        i = coord_pool.get(k)
        if i is None:
            i = len(points) // 2
            coord_pool[k] = i
            points.append(k[0])
            points.append(k[1])
        return i

    streets_out = []
    for highway, maxspeed, u, v, coords in streets:
        m = [to_m(lon, lat) for lon, lat in coords]
        if len(m) > 2:
            m = douglas_peucker(m, SIMPLIFY_M)
        ids = [node_pid(u, *m[0])]
        for x, y in m[1:-1]:
            j = coord_pid(x, y)
            if j != ids[-1]:
                ids.append(j)
        last = node_pid(v, *m[-1])
        if last != ids[-1] or len(ids) == 1:
            ids.append(last)
        if len(ids) < 2:  # collapsed to a point -> carries no connectivity
            continue
        flags = (1 if is_major(highway) else 0) | (2 if is_slow(maxspeed, highway) else 0)
        streets_out.append([flags] + ids)

    # Traffic-signal nodes, mapped to their pooled point index (only those that
    # actually appear as a street endpoint, which signal nodes always do).
    signals = sorted(node_pool[n] for n in signal_nodes if n in node_pool)

    span = [max(points[0::2]), max(points[1::2])]
    out = {"span": span, "points": points, "streets": streets_out, "signals": signals}
    with open(out_path, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    return len(points) // 2, len(streets_out), len(signals)


def main():
    print("Downloading street network...")
    # "drive" = the vehicle street grid, which is what actually frames neighborhoods.
    G = ox.graph.graph_from_bbox(
        BBOX, network_type="drive", retain_all=True, simplify=True
    )
    print(f"  {len(G.nodes)} intersections/dead-ends, {len(G.edges)} street segments")
    signal_nodes = {
        n for n, d in G.nodes(data=True) if d.get("highway") == "traffic_signals"
    }
    print(f"  {len(signal_nodes)} traffic-signal nodes")
    _, edges = ox.convert.graph_to_gdfs(G)
    edges = edges.reset_index()  # u, v become columns
    has_ms = "maxspeed" in edges.columns
    streets = [
        (
            row.highway,
            getattr(row, "maxspeed", None) if has_ms else None,
            row.u,
            row.v,
            list(row.geometry.coords),
        )
        for row in edges.itertuples()
    ]

    print("Preprocessing -> map.json...")
    n_pts, n_streets, n_sig = preprocess(streets, signal_nodes, "map.json")
    print(f"  {n_pts:,} pooled vertices, {n_streets:,} streets, {n_sig:,} signals")
    print("Done. The app loads only map.json.")


if __name__ == "__main__":
    main()
