// Tunables and shared constants for the neighborhood map.
//
// Major-road classification (which highway tags act as hard barriers) now lives
// in download.py, which bakes a major/minor flag into each street at preprocess
// time. The app just reads that flag.

// A bright, evenly-spaced sweep around the hue circle, all legible on black.
// Greedy coloring reuses these for non-adjacent neighborhoods; it also avoids
// putting *perceptually similar* colors (e.g. teal next to green) on neighbors,
// so the listed order being a smooth gradient is fine. No dark colors here --
// the old brown and indigo were too muddy against the black background.
export const PALETTE = [
  [231, 76, 60], // red
  [235, 140, 30], // orange
  [245, 200, 20], // gold
  [176, 220, 60], // lime
  [46, 204, 113], // green
  [22, 190, 160], // teal
  [30, 200, 225], // cyan
  [58, 140, 245], // blue
  [140, 150, 255], // periwinkle
  [175, 110, 242], // violet
  [232, 70, 160], // magenta
  [245, 120, 140], // rose
];

export const ADJ_DIST = 120; // m: streets of different neighborhoods this close => adjacent
export const RESOLUTION = 200; // cross-arterial Louvain resolution: lower => fewer, bigger
//                                districts (~0.5 => ~190, 1.0 => ~250, 2.0 => ~350 metro-wide)
export const LOD_PX = 2; // render detail cutoff: skip features smaller than this many
//                            screen pixels (higher => faster + sparser when zoomed out)
