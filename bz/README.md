Oscillating Reaction - 2023 - Spiral waves of the Belousov-Zhabotinsky reaction. Drag to break a wave and watch its ends curl into spirals.

The Belousov-Zhabotinsky reaction is a chemical mixture that keeps switching between two states instead of settling down. Spread thinly in a dish, it carries waves that look like these.

- **Spirals** and **Target rings** run the Oregonator, the standard model of the real chemistry, in its two-variable Tyson-Fife form. The colors follow the ferroin indicator a real dish uses: red-orange where the catalyst is reduced, blue where it's oxidized. Each wave's leading edge is drawn lighter.
- In a real dish, spirals form when a wave breaks. Drag across one to break it (the stroke resets the chemistry to rest), and its two free ends curl up into a pair of spirals turning opposite ways. Tap to set off a new wave.
- Target rings start at pacemakers, specks where the mixture oscillates on its own. In a real dish they're dust or bubbles.
- `f` sets how much bromide (the inhibitor) each reaction cycle makes. Above about 2.4 the mixture rests until a neighbor sets it off (an excitable medium). Below that it oscillates by itself, so the gaps between waves start flashing too.
- **Nutshell** is Alasdair Turner's 2009 "BZ reaction in a nutshell": three species eat each other rock-paper-scissors style, averaged over each 3×3 neighborhood every generation. It's a toy, not chemistry, but it makes a dense tangle of similar spirals.

Everything runs on the GPU in WebGL2. The edges of the screen are walls, like the edge of a dish. The link records the preset, settings and random seed, so sharing it reproduces the starting pattern, but not anything drawn afterward.
