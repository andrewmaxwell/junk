# reactionDiffusion

- Diffusion is Pearson's in cell units: Da = 2e-5 / (2.5/256)² ≈ 0.2097, Db half that, dt = 1, isotropic 9-point Laplacian ((4·adjacent + diagonals − 20·center)/6). Karl Sims' popular 1.0 / 0.5 with weights 0.2 / 0.05 is the same stencil times 0.3, so his F and k also give the same pattern types, just ~1.2× larger.
- Checked against an independent CPU version in doubles (same equations, periodic edges): the GPU state matched to 6e-6 after 1500 steps of a growing maze (F 0.029, k 0.057). Redo that check if the step shader changes.
- Seed blobs use B = 1/2, not Pearson's 1/4. With 1/4, blobs smaller than ~8 cells die at high F (Worms died outright).
- The common "spirals" setting F 0.014, k 0.045 dies out from these seeds. Crescents (0.010, 0.047) and Waves (0.014, 0.041) were picked by scanning F 0.010–0.022, k 0.041–0.049 for settings where B survives and keeps moving.
- `map.webp`, the card's map background, is a screenshot of map mode with UI hidden: 1200×900 window (4:3, like the card), speed 100, about 75 s (~450k steps), shrunk to 480×360. Re-bake it if the colors, tone curve, map range (`MAP`) or seeds change.
- The 16×16 probe pass is read back twice a second to notice when B has died out. It's the only GPU→CPU readback.
