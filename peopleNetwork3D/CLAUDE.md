# peopleNetwork3D

- Data comes from `../peopleStats/getData.js`, which takes `(hidden, distance)`; `analysis.js` (for `topEigen`) and `correlationCoefficient.js` are shared with peopleStats too. Changing their signatures breaks this page, which is how it was black-screened before.
- The metric definitions are copied from `peopleStats/main.js`. Keep the two in step.
- "Me" is read from peopleStats' `localStorage` key `peopleStatsMe`.
- Measured, raw answers, 70 people: the old spring simulation (all n² springs, random start) settled to stress 0.214 after ~50 s of frames (0.245 after 1 s, 0.216 after 10 s). Classical MDS alone gets 0.42 and MDS + 100 SMACOF iterations gets 0.211 in about 150 ms. Beyond ~50 iterations it barely moves.
- Node can't reach the Google Sheet from Claude's sandbox (fetch and curl both fail). Fetch it in the browser instead.
