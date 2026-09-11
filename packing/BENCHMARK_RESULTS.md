# Packing benchmark results

Measured 2026-09-11T18:38:50.302Z on darwin arm64 Apple M4 with Node v25.2.1.

Five seeds per case and method; each run had up to 2000 ms or 5 attempts. Staged rotation warm-up and forward sweeps were used for both methods. These are exploratory local timings, not browser frame times.

A hit means a feasible layout within the stated percentage of the reference **linear scale**. It does not mean a proof of optimality. Median times below include successful runs only; failures remain visible in the hit counts. The solver never receives the reference values or layouts.

## Selected findings

- Aligned square grids (4, 9, 16 pieces) reached the area bound in every run. Sliding before allowing rotations prevents the contact solver from disrupting these grids.
- Ten squares in a square: annealed repair reached 1% in 5/5 runs (median 1,077 ms among hits); basin hopping did so in 3/5 (243 ms among hits). The lower conditional time for basin hopping comes with more misses. Neither reached 0.1%.
- Twelve squares in a circle is an unproved reference construction: basin hopping reached 1% in 1/5 runs (1,536 ms), annealed repair in 0/5. Best gaps were 0.218% and 1.151%, respectively; median gaps were 1.359% and 1.254%. This does not establish basin hopping as uniformly better.
- Circle cases usually reached 0.1% quickly. The 0.01% threshold was much harder for several counts; four and six circles reached it consistently.

Annealed repair remains the app default based on these mixed results. Basin hopping is selectable. Both methods use the bug fixes and contact warm-up; this is not a comparison against the unmodified original code.

## All measurements

| Case | Reference | Method | ≤1% hits; median ms | ≤0.1% hits; median ms | ≤0.01% hits; median ms | Best gap % | Median gap % |
|---|---|---|---:|---:|---:|---:|---:|
| square in square n=4 | Proven optimum | anneal | 5/5; 0.7 | 5/5; 0.7 | 5/5; 0.7 | 0.000 | 0.000 |
| square in square n=4 | Proven optimum | basin | 5/5; 0.5 | 5/5; 0.5 | 5/5; 0.5 | 0.000 | 0.000 |
| square in square n=5 | Proven optimum | anneal | 5/5; 151.2 | 0/5; — | 0/5; — | 0.114 | 0.164 |
| square in square n=5 | Proven optimum | basin | 4/5; 429.1 | 0/5; — | 0/5; — | 0.122 | 0.165 |
| square in square n=9 | Proven optimum | anneal | 5/5; 1.2 | 5/5; 1.2 | 5/5; 1.2 | 0.000 | 0.000 |
| square in square n=9 | Proven optimum | basin | 5/5; 1.2 | 5/5; 1.2 | 5/5; 1.2 | 0.000 | 0.000 |
| square in square n=10 | Proven optimum | anneal | 5/5; 1076.7 | 0/5; — | 0/5; — | 0.160 | 0.195 |
| square in square n=10 | Proven optimum | basin | 3/5; 242.9 | 0/5; — | 0/5; — | 0.163 | 0.721 |
| square in square n=16 | Proven optimum | anneal | 5/5; 4.4 | 5/5; 4.4 | 5/5; 4.4 | 0.000 | 0.000 |
| square in square n=16 | Proven optimum | basin | 5/5; 4.7 | 5/5; 4.7 | 5/5; 4.7 | 0.000 | 0.000 |
| circle in circle n=2 | Proven optimum | anneal | 5/5; 1.9 | 5/5; 1.9 | 0/5; — | 0.040 | 0.040 |
| circle in circle n=2 | Proven optimum | basin | 5/5; 2.9 | 5/5; 2.9 | 0/5; — | 0.040 | 0.040 |
| circle in circle n=3 | Proven optimum | anneal | 5/5; 1.4 | 5/5; 8.9 | 0/5; — | 0.041 | 0.041 |
| circle in circle n=3 | Proven optimum | basin | 5/5; 1.5 | 5/5; 10.8 | 0/5; — | 0.041 | 0.041 |
| circle in circle n=4 | Proven optimum | anneal | 5/5; 7.1 | 5/5; 8.8 | 5/5; 14.2 | -0.003 | -0.003 |
| circle in circle n=4 | Proven optimum | basin | 5/5; 7.7 | 5/5; 9.7 | 5/5; 16.0 | -0.003 | -0.003 |
| circle in circle n=5 | Proven optimum | anneal | 5/5; 9.1 | 5/5; 15.8 | 0/5; — | 0.045 | 0.054 |
| circle in circle n=5 | Proven optimum | basin | 5/5; 10.0 | 5/5; 18.1 | 0/5; — | 0.054 | 0.054 |
| circle in circle n=6 | Proven optimum | anneal | 5/5; 8.6 | 5/5; 19.9 | 5/5; 22.8 | 0.003 | 0.003 |
| circle in circle n=6 | Proven optimum | basin | 5/5; 11.5 | 5/5; 26.2 | 5/5; 30.1 | 0.003 | 0.003 |
| circle in circle n=7 | Proven optimum | anneal | 5/5; 13.2 | 5/5; 26.3 | 0/5; — | 0.020 | 0.020 |
| circle in circle n=7 | Proven optimum | basin | 5/5; 14.7 | 5/5; 29.5 | 0/5; — | 0.020 | 0.020 |
| circle in circle n=8 | Proven optimum | anneal | 5/5; 7.4 | 5/5; 26.2 | 0/5; — | 0.035 | 0.035 |
| circle in circle n=8 | Proven optimum | basin | 5/5; 8.8 | 5/5; 31.7 | 0/5; — | 0.035 | 0.035 |
| circle in circle n=10 | Proven optimum | anneal | 5/5; 31.8 | 5/5; 93.2 | 1/5; 200.3 | 0.007 | 0.052 |
| circle in circle n=10 | Proven optimum | basin | 5/5; 39.4 | 5/5; 114.7 | 1/5; 132.8 | -0.000 | 0.052 |
| square in circle n=4 | Unproved reference | anneal | 5/5; 39.4 | 5/5; 95.5 | 0/5; — | 0.036 | 0.051 |
| square in circle n=4 | Unproved reference | basin | 5/5; 52.3 | 5/5; 124.5 | 0/5; — | 0.028 | 0.036 |
| square in circle n=5 | Unproved reference | anneal | 5/5; 198.3 | 5/5; 252.1 | 0/5; — | 0.039 | 0.051 |
| square in circle n=5 | Unproved reference | basin | 4/5; 215.1 | 4/5; 255.0 | 0/5; — | 0.011 | 0.051 |
| square in circle n=12 | Unproved reference | anneal | 0/5; — | 0/5; — | 0/5; — | 1.151 | 1.254 |
| square in circle n=12 | Unproved reference | basin | 1/5; 1536.4 | 0/5; — | 0/5; — | 0.218 | 1.359 |

## Reproduce

```sh
cd /Users/andrew/junk/packing
node benchmark-time.mjs --seeds 5 --ms 2000 --attempts 5 --strategy both --references --output benchmark-results.json
```

Use `--rotation free` to compare with unrestricted rotation from the start, or increase `--ms` and `--attempts` to test a longer search. `--only` filters by case name. Omit `--references` to include only proven-optimum cases.

Full configuration, per-seed times, final gaps, and stopping reasons are in [benchmark-results.json](benchmark-results.json). Reference sources are attached to each case in [benchmark-cases.js](benchmark-cases.js). Small negative gaps reflect accepted contact tolerance, not a better-than-optimal packing.
