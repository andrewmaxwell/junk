People Network 3D - 2023 - A 3D network showing how similarly people answered a survey.

Everyone who took the [survey](https://forms.gle/jV1qtBsuJdsmL1AF9) rated themselves 1 to 10 on 36 traits. Each person is a dot, placed so that the distances between dots match the distances between their answers as well as 3D allows. Tap someone to see who they answered most and least like, and color everyone by any trait to see how it runs through the crowd.

- The layout is classical MDS refined by SMACOF stress majorization ([embed.js](embed.js)). The page reports how far off the 3D distances are (Kruskal's stress-1, about 21% for raw answers), since 36 dimensions can't fit in 3 exactly.
- Lines are drawn from the real distances over all 36 answers, not from the 3D positions, so a long line is a pair the layout had to pull apart.
- "Compare by" uses the same two measures as [People Stats](../peopleStats/): raw answer distance, or 1 minus the correlation of the answers.
- The URL keeps who is selected and the settings, so a link shows what you saw. If you picked yourself in People Stats, you get a yellow ring.

Test the layout math with `node peopleNetwork3D/embed.test.js`.
