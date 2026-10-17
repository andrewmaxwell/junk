Particle Life - 2023 - Eight colors of particles, each attracted to or repelled by the others by a random rule. They clump into cells, rings, and chasers.

Every pair of colors gets a random attraction between -1 and 1 and a threshold. Closer than the threshold, particles always push apart (`repulsion`); past it, out to `radius`, they pull together or push apart by the pair's attraction, strongest halfway and fading to zero at the edge. The rules aren't symmetric, so red can chase blue while blue runs from red, and that's where the moving creatures come from.

The world wraps around at its edges, so nothing piles up against a wall and creatures can keep swimming.

The `attractions` grid shows the rules: each row is a color, each column is the color it reacts to, green pulls and red pushes. Click a square to make it pull more, right-click or shift-click to make it push more. Hit `new rules` for a new random world; particle count and colors restart it, and the rest change it live. `trails` fades old frames out slowly instead of clearing them.

The URL hash holds the rules and any settings that differ from the defaults, so the address bar is always a link back to the current world (from a new random start).

Neighbors come from `../particle-fluid/Grid.js`, which sorts the particle arrays by grid cell every step.
