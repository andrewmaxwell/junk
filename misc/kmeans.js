const getDist = (v1, v2) => {
  let result = 0;
  for (let i = 0; i < v1.length; i++) {
    result += (v1[i] - v2[i]) ** 2;
  }
  return Math.sqrt(result);
};

const getClosestCentroid = (centroids, values) => {
  let minDist = Infinity;
  let result;
  for (const c of centroids) {
    const dist = getDist(c.values, values);
    if (dist < minDist) {
      minDist = dist;
      result = c;
    }
  }
  return result;
};

const getNewCentroid = (rows, dataWidth) => {
  if (!rows.length) {
    return Array.from({length: dataWidth}, Math.random);
  }

  const values = [];
  for (let i = 0; i < dataWidth; i++) {
    values[i] = 0;
    for (const row of rows) {
      values[i] += row.values[i];
    }
    values[i] /= rows.length;
  }
  return values;
};

// iterations * rows * numClusters * dataWidth
const kmeans = (numClusters, data) => {
  const dataWidth = data[0].values.length; // width

  // initialize centroids
  const centroids = Array.from({length: numClusters}, () => ({
    values: Array.from({length: dataWidth}, Math.random),
  }));

  for (let i = 0; i < 1e4; i++) {
    // clear assignments
    for (const c of centroids) {
      c.rows = [];
    }

    // assign
    for (const row of data) {
      getClosestCentroid(centroids, row.values).rows.push(row);
    }

    // update
    const distances = [];
    for (const c of centroids) {
      const newValues = getNewCentroid(c.rows, dataWidth);
      distances.push(getDist(c.values, newValues));
      c.values = newValues;
    }

    if (distances.every((d) => d === 0)) {
      console.log(`done in ${i + 1} iterations`);
      break;
    }
    // console.log(distances);
  }

  return centroids;
};

const data =
  `Your Name	Strength	Intelligence	Creativity	Agility	Charisma	Endurance	Cooking	Musical Talent	Empathy	Focus	Resilience	Adaptability	Leadership	Coordination	Memory	Strategy	Communication	Sense of Humor	Problem Solving	Teamwork	Resourcefulness	Time Management	Confidence	Initiative	Intuition	Optimism	Negotiation	Patience	Multitasking	Tech-savviness	Attention to Detail	Courage	Conflict Resolution	Discipline	Emotional Intelligence	Sportsmanship
Andrew Maxwell	5	7	5	3	5	4	4	5	2	5	5	8	5	6	3	5	6	7	8	6	7	8	8	5	7	9	3	6	4	10	5	7	5	7	4	10
Olaf Maxwell	2	9	6	3	7	9	8	2	2	10	9	10	7	6	7	8	7	7	9	3	8	7	10	10	10	10	8	2	10	10	2	10	5	8	1	5
Abraham Tebeau	7	6	4	5	4	4	5	5	5	4	5	4	4	7	5	8	5	6	5	7	6	4	6	4	8	6	6	4	4	7	6	4	6	4	6	8
Joshua Maxwell	7	6	8	8	7	5	7	7	4	4	5	5	5	7	5	4	8	7	6	8	7	9	8	7	5	6	5	5	2	8	4	6	6	5	9	8
Levi Linscott	5	7	7	5	8	4	6	2	3	9	8	10	8	7	6	8	10	8	6	8	7	5	9	9	7	3	9	3	5	5	6	7	4	5	10	6
Hannah Barrow	5	5	7	3	4	3	4	8	5	2	5	6	5	6	4	5	4	6	6	4	7	6	4	6	2	5	4	5	6	7	8	7	4	4	4	6
Matt Heironimus 	5	5	3	3	3	3	5	1	5	5	8	6	5	3	4	5	7	6	8	5	6	9	7	6	4	5	3	5	3	10	8	5	5	4	5	7
Brady Heironimus	6	8	6	7	5	5	4	4	6	8	9	5	4	9	6	6	5	6	7	7	6	8	7	6	6	5	5	6	6	7	6	6	4	8	6	5
Kaden Tran	6	7	4	6	9	8	3	10	9	5	7	4	10	9	5	6	8	9	7	10	6	6	8	9	8	6	7	7	5	7	3	6	8	5	8	9
Andrea Maxwell	5	5	6	6	4	3	6	3	8	3	4	5	3	5	4	4	7	8	5	5	7	4	3	3	4	4	3	4	3	5	5	3	2	3	7	7
Phyllis Maxwell	3	5	4	4	4	3	8	6	5	5	6	6	4	5	4	7	4	7	7	7	6	8	7	6	6	8	7	7	6	5	7	6	5	5	6	8
Mark Maxwell	6	7	5	6	7	5	4	5	2	2	3	9	8	4	3	8	9	7	5	9	7	8	8	8	4	9	4	6	5	9	9	6	7	5	4	9
Nathan Smith	7	6	7	4	4	4	6	1	3	7	9	7	8	5	6	8	5	7	9	8	9	2	6	8	7	9	4	3	2	4	4	8	5	8	3	7
Emily Doria 	3	6	3	3	3	4	5	7	8	4	5	7	3	3	5	5	4	5	6	6	6	5	3	4	5	5	5	5	7	5	8	5	3	6	5	3
Marie Smith	6	5	7	5	5	6	7	7	8	5	5	2	5	5	7	5	5	5	8	6	7	6	6	8	8	5	8	5	7	6	10	8	8	8	7	10
Mitch Doria	9	6	6	5	5	6	1	1	5	7	7	6	6	6	6	7	6	8	6	5	4	9	6	6	8	5	9	8	7	9	8	7	6	7	5	4
Jadon Corra	6	6	7	7	4	5	6	6	3	5	5	5	4	6	6	7	5	7	7	5	5	5	5	5	6	6	10	5	5	8	6	6	4	6	4	4
Ayden Wakefield	8	7	9	9	8	1	5	6	7	1	8	4	5	6	5	7	4	10	10	9	8	4	9	6	9	7	7	6	4	8	10	10	1	4	8	10
Jason Beisman	4	5	2	5	3	2	8	1	6	8	9	8	1	1	7	10	6	3	8	6	8	7	4	3	7	8	2	7	5	9	8	2	4	6	7	4
Adam Hartman	8	8	10	8	7	8	6	8	5	5	10	8	7	8	9	9	8	8	10	7	9	3	8	7	9	5	9	7	6	8	5	5	8	6	6	8
Xin Zhang	8	7	9	2	8	10	6	1	7	2	5	9	6	8	4	2	3	9	8	9	8	9	8	8	7	10	3	6	3	10	7	5	7	9	10	6
Hudson Levanos	6	5	7	3	7	4	1	2	7	7	9	4	6	4	7	6	9	5	4	6	6	5	8	7	8	8	5	4	1	4	5	9	7	5	6	8
Sydney Ver Mehren	5	7	7	6	6	4	6	3	8	5	8	6	8	4	5	6	5	7	5	7	7	6	5	6	6	8	6	4	4	5	4	7	6	5	5	5
Jay Hotchkiss	7	6	4	6	7	4	3	2	5	3	6	8	7	6	2	5	7	7	6	8	4	7	7	7	5	8	7	8	2	7	9	4	3	5	7	8
Sergei Marchenko	6	6	7	5	4	7	7	5	3	6	8	2	8	4	5	5	6	7	6	7	5	6	6	7	5	7	7	9	7	5	6	6	5	8	5	8
Gillian Marchenko	4	5	6	5	7	2	5	3	7	5	6	6	7	5	4	3	7	9	5	6	4	5	6	7	7	3	6	5	6	3	4	4	6	4	3	6
Cheryl Hotchkiss	4	8	5	7	4	6	8	8	6	8	10	6	6	7	7	8	5	4	9	8	9	10	7	8	5	9	5	8	9	5	6	9	4	9	7	6
Curtis Ver Mehren	7	9	10	5	5	4	6	2	8	10	9	9	7	7	8	8	10	10	10	4	9	6	4	4	6	3	8	5	9	9	8	8	9	7	10	10
Kristina Curnutt	5	8	7	4	9	3	7	6	10	1	9	9	9	3	4	8	6	7	8	9	9	8	7	8	9	8	9	5	5	7	9	7	8	8	9	10
Danny Tran	9	4	6	7	5	4	5	1	4	6	7	7	6	7	3	7	4	5	7	7	6	6	4	7	8	8	4	6	3	9	8	7	4	5	3	8
Josh Govier 	7	7	4	4	4	3	5	5	7	6	5	6	8	8	6	7	8	7	7	8	6	6	6	5	6	7	5	5	5	5	2	4	9	3	4	9
Jenna Hickle	4	7	6	7	5	4	9	6	9	8	8	7	5	9	3	7	3	6	6	8	8	6	3	5	3	8	3	7	8	5	7	2	7	9	7	9
Emmanuel Forbes	10	7	4	10	6	5	10	1	5	7	10	10	10	9	6	7	7	6	8	10	10	9	10	7	8	7	7	10	9	5	5	10	8	8	4	8
Mirielle Corra	4	7	7	5	7	3	6	7	8	6	7	5	7	4	7	6	8	6	6	6	6	6	6	7	5	4	7	5	5	6	9	5	6	6	5	6
Ryan Curnutt	8	8	7	5	3	3	8	9	3	8	8	4	6	4	8	7	8	8	9	2	8	8	4	4	9	4	3	4	9	10	4	5	3	8	4	8
Sarah G	6	8	8	6	6	4	4	3	8	8	8	5	8	4	7	8	8	9	9	9	9	8	7	9	6	5	9	5	8	8	9	5	5	8	5	9
Lydia Weatherbie	3	7	9	4	4	3	7	6	10	3	8	6	6	5	6	7	8	7	6	7	9	1	1	6	3	8	4	6	3	8	10	7	6	3	9	10
Al Fuller	5	5	7	4	8	5	7	2	7	7	8	7	8	4	8	7	8	10	7	8	7	5	8	8	7	10	7	6	7	6	5	8	6	7	7	5
Daniel Tebeau	6	7	5	7	5	6	4	9	8	6	8	5	5	6	6	6	5	6	7	7	5	5	5	6	8	5	7	8	6	5	5	6	7	8	8	7
Vj Tebeau	3	2	4	4	2	2	3	4	5	2	3	4	4	2	8	1	2	1	4	1	2	4	3	3	3	5	2	6	4	3	7	2	2	3	1	5
Marcella Tebeau	7	7	8	4	6	4	5	7	9	6	6	7	7	6	5	7	8	4	8	8	6	5	3	6	6	8	8	5	7	9	8	5	8	6	7	8
Wesley Heironimus	4	6	4	3	6	6	1	3	5	5	7	3	4	5	4	6	4	4	3	5	6	5	6	6	5	5	4	4	5	4	3	5	5	3	5	6
Claire Fuller 	6	7	5	2	4	5	8	6	9	4	7	6	6	5	9	4	7	5	6	7	8	4	3	4	7	4	7	4	6	2	7	4	8	8	6	4
Clara Keller	8	8	10	8	10	6	10	1	10	8	10	8	10	7	9	9	8	9	9	8	10	8	8	10	10	10	10	8	10	7	10	10	7	7	8	9
Megan Forbes	4	7	7	6	9	3	7	8	7	7	6	7	8	5	8	7	9	7	9	8	9	7	7	8	8	7	7	7	7	8	7	7	7	6	7	8
Lena Edwards	6	4	8	3	8	1	3	3	9	3	8	4	4	3	3	6	5	9	4	4	9	3	3	5	5	5	6	7	3	5	10	9	4	5	9	10
Elizabeth Heironimus	5	7	4	7	6	10	9	1	3	7	7	5	2	5	9	3	7	5	5	5	5	9	7	7	5	7	5	5	6	5	9	5	5	9	5	7
Tim Keating	8	9	8	6	9	4	8	5	9	8	6	6	8	6	7	7	7	10	8	8	9	4	7	6	5	6	8	6	7	9	9	7	6	7	6	8
Loralee Gobble	6	5	5	6	6	5	7	5	7	6	4	4	4	4	8	4	9	4	4	5	5	7	4	5	4	5	4	2	4	3	7	3	4	4	8	5
Morgan Michalicek	3	4	5	7	3	4	7	1	5	5	5	6	3	6	6	4	7	8	8	6	5	1	9	5	5	6	7	7	8	7	9	3	7	4	8	5
Allyson Priest 	5	7	5	1	5	1	5	1	10	7	5	1	4	1	4	1	6	5	5	6	8	10	1	5	7	5	1	8	5	7	6	1	3	5	7	10
Terry Bailey	3	5	3	4	4	2	5	1	5	3	4	4	3	3	6	4	4	6	5	6	5	5	2	3	3	5	5	5	5	3	5	3	2	5	5	6
Justin Priest 	5	6	5	5	5	3	5	1	4	7	5	5	3	5	5	8	5	5	8	8	6	5	6	6	5	5	5	8	5	7	6	4	5	6	8	7
Gabrielle Richards	5	7	7	2	6	1	5	1	10	9	8	5	7	5	4	7	4	7	9	9	8	5	4	6	8	9	5	6	6	5	10	6	4	8	5	5
Peter Gobble	7	7	5	6	3	3	3	4	6	4	8	6	7	7	6	7	9	5	6	9	5	5	10	9	8	5	3	2	7	7	10	8	8	9	4	10
Kieran Brown	5	8	8	3	5	6	1	1	4	8	8	8	6	3	2	7	6	5	8	5	6	7	10	8	5	5	7	8	3	8	3	8	4	5	5	6
Caleb Fuller	7	6	5	4	8	7	8	5	6	3	7	8	8	8	10	8	6	7	6	10	5	8	7	5	10	8	10	3	4	10	6	10	5	5	6	3
Evan K	5	7	6	3	3	4	5	7	5	3	7	6	4	6	5	6	4	6	6	7	5	3	4	5	6	4	5	5	3	8	5	5	4	3	5	6
Beth Govier	3	5	5	5	8	2	7	7	5	7	7	4	9	4	3	4	8	6	5	5	6	8	7	9	4	3	5	3	8	6	9	3	6	7	4	3
Emma Pyles	7	7	8	1	7	3	7	5	9	2	6	7	8	5	3	5	8	5	6	8	7	3	4	7	6	8	3	9	2	8	5	8	8	5	4	9
Riley Heironimus	8	7	6	8	7	9	6	2	7	8	8	3	7	9	8	7	9	8	8	7	7	10	8	4	7	5	7	7	8	9	8	6	4	6	7	8
Nick Smith	8	7	9	5	6	9	8	7	9	4	8	6	8	8	7	6	8	8	6	9	5	4	8	9	7	7	8	8	5	8	7	9	7	8	9	8
Mercy Ballard	4	6	6	4	6	3	5	4	5	6	5	6	4	3	7	5	4	6	5	6	5	5	2	3	5	6	5	6	7	8	6	6	6	7	6	7
Lydia Ballard	5	6	3	4	7	2	9	7	8	6	9	5	6	6	8	5	6	7	5	9	4	3	7	6	6	4	7	6	5	8	9	9	6	7	7	9
Aidan Richards	3	5	3	2	4	2	5	1	5	3	3	2	1	2	2	2	1	2	3	2	2	2	2	2	1	5	5	3	2	5	4	2	2	5	5	4
Casey Heironimus	7	8	5	7	6	7	3	2	7	7	8	6	6	8	4	7	6	8	7	5	6	5	7	6	6	5	7	6	6	7	6	6	6	7	4	8
Anneliese Gobble	5	8	8	2	3	4	5	6	4	4	8	4	2	5	8	5	4	5	7	3	4	8	3	7	4	4	5	6	4	4	8	5	6	9	4	7
Rose Richards	3	5	5	2	5	1	3	1	10	4	4	5	6	2	1	6	6	8	5	7	2	1	2	6	5	4	5	7	2	7	9	2	4	5	1	8
Nehemiah Ballard	5	5	5	6	3	5	5	6	5	5	7	5	2	5	5	5	5	7	6	5	5	5	4	5	5	6	4	7	5	3	6	6	5	7	5	7
Jason Barrow	7	6	5	6	6	2	5	1	3	4	7	6	5	5	6	4	5	7	8	5	6	9	7	7	8	7	5	4	2	8	7	8	6	7	7	6`
    .split('\n')
    .map((r) => r.split('\t'));

// const labels = data[0].slice(1);
const rows = data.slice(1).map((r) => ({
  label: r[0].trim(),
  values: r.slice(1).map((x) => (x - 1) / 9),
}));

const result = kmeans(4, rows);

for (const c of result) {
  // console.log(c.values);
  console.log(c.rows.map((r) => r.label));
}
