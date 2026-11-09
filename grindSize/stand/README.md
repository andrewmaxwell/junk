# Grind size camera stand

A printed tower that holds the R6 II + RF 100mm F2.8L Macro pointing straight
down at a 77mm UV filter covered in coffee grounds, lit from below. Built by
`build_stand.py` (run `.venv/bin/python grindSize/stand/build_stand.py` from the
repo root); every dimension is a named constant at the top of that file.

![section](preview.png)

## How it works

- The camera stands lens-down. The hood's flat front edge (90 mm) rests on a
  ledge, and a 25 mm collar keeps it centered and upright.
- The filter sits front side up in the **carrier**, its male thread down through
  the hole and its shoulder on the ledge, so the filter's rim walls in the
  grounds. The carrier slides in through the front slot and rests on three M3
  screw tips.
- The three screws level the glass and set focus. Leave the lens at minimum
  focus (1.4x) with the SA control ring at 0, and never touch the focus ring.
  The scale then stays the same from session to session. Once set, the screws
  stay put.
- The **diffuser** slides into the lower slot, 35 mm under the glass, far
  enough down that its print texture blurs away completely. Light comes in
  through the three windows at the bottom: aim the strobe at a white card under
  the tower, or set the tower over a softbox.

## Parts

| File | Filament | Notes |
|---|---|---|
| `hood_fit_test.stl` | any | Print first (17 mm tall). The hood should drop in with a little play and sit flat on the ledge. Adjust `CLEAR` or `HOOD_OD` if not. |
| `tower.stl` | black PETG | Print upright as exported. No supports needed: the ledges and screw bosses have 45° undersides. The tops of the two front slots and the windows are long bridges and may sag a little, which doesn't matter because nothing locates against them. |
| `carrier.stl` | black PETG | Print flat. Its underside rests on the screws. |
| `diffuser.stl` | white PETG | Optional. 1.2 mm thick. Paper or opal acrylic cut to the same shape works too. |

Hardware: 3 × M3 heat-set inserts (4.1 mm hole, up to 5.8 mm long), 3 × M3×16
screws, and optionally 3 × M3 nylock nuts to lock the screws once set.

## Setup

1. Press the inserts into the tops of the three bosses. Thread the screws up
   through them from below so about 3 mm of tip shows.
2. Pull the diffuser out. That opens the holes in the diffuser ledge, so a hex
   key reaches the screws from below. Set the tower on two books so your hand
   fits underneath.
3. Put a stage micrometer or a sprinkle of grounds on the filter, slide the
   carrier in, and stand the camera on top. In magnified live view, turn the
   screws together until the center is sharp, then individually until all four
   corners are sharp. One full turn moves the glass 0.5 mm; depth of field is
   only about 0.15 mm.
4. Optionally run a nylock nut up each screw against the boss to lock it. Put the
   diffuser back.
5. Photograph the stage micrometer to get the µm-per-pixel scale.

## Guesses to check

`FILTER_THREAD_H` (3 mm) and `GLASS_ABOVE_SHOULDER` (1.5 mm) are guesses about
the Kenko filter. The screws cover about ±3 mm, so being a little off is fine.
`HOOD_TO_FOCUS` (30 mm) is the measured distance.
