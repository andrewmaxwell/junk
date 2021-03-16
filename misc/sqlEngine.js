/* eslint-disable sonarjs/no-duplicate-string */

const ops = {
  '=': (a, b) => a !== undefined && a == b,
  '<>': (a, b) => a != b,
  '<=': (a, b) => a <= b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '>': (a, b) => a > b,
};

const getVal = (name, row) => {
  if (name[0] === "'") return name.slice(1, -1).replace(/''/g, "'");
  if (!isNaN(name)) return Number(name);
  if (name.includes('.')) return row[name];
  return name;
};

class SQLEngine {
  constructor(db) {
    this.db = {};
    for (const table in db) {
      this.db[table] = db[table].map((row) => {
        const res = {};
        for (const key in row) res[table + '.' + key] = row[key];
        return res;
      });
    }
  }
  execute(query) {
    const tokens = query
      .match(/=|<>|<=|>=|<|>|('[^']*')+|[\w.]+/g)
      .map((t) => (/^(FROM|WHERE|JOIN)$/i.test(t) ? t.toUpperCase() : t));
    const fromIndex = tokens.indexOf('FROM');
    const whereIndex = tokens.indexOf('WHERE');
    const selectCols = tokens.slice(1, fromIndex);
    const table = tokens[fromIndex + 1];
    const joins = tokens.includes('JOIN')
      ? tokens
          .slice(fromIndex + 3, whereIndex > -1 ? whereIndex : Infinity)
          .join('\n')
          .split('\nJOIN\n')
          .map((r) => r.split('\n'))
      : [];
    const [whereA, whereOp, whereB] =
      whereIndex > -1 ? tokens.slice(whereIndex + 1) : [];

    return joins
      .reduce(
        (res, [table, , col1, op, col2]) =>
          res
            .map((row) =>
              this.db[table]
                .filter((joinRow) =>
                  col1 in row
                    ? ops[op](getVal(col1, row), getVal(col2, joinRow))
                    : ops[op](getVal(col1, joinRow), getVal(col2, row))
                )
                .map((joinRow) => ({...row, ...joinRow}))
            )
            .reduce((a, b) => a.concat(b), []),
        this.db[table]
      )
      .filter(
        (row) =>
          !whereA || ops[whereOp](getVal(whereA, row), getVal(whereB, row))
      )
      .map((row) => {
        const res = {};
        for (const col of selectCols) res[col] = row[col];
        return res;
      });
  }
}

var movieDatabase = {
  movie: [
    {id: 1, name: 'Avatar', directorID: 1},
    {id: 2, name: 'Titanic', directorID: 1},
    {id: 3, name: 'Infamous', directorID: 2},
    {id: 4, name: 'Skyfall', directorID: 3},
    {id: 5, name: 'Aliens', directorID: 1},
  ],
  actor: [
    {id: 1, name: 'Leonardo DiCaprio'},
    {id: 2, name: 'Sigourney Weaver'},
    {id: 3, name: 'Daniel Craig'},
  ],
  director: [
    {id: 1, name: 'James Cameron'},
    {id: 2, name: 'Douglas McGrath'},
    {id: 3, name: 'Sam Mendes'},
  ],
  actor_to_movie: [
    {movieID: 1, actorID: 2},
    {movieID: 2, actorID: 1},
    {movieID: 3, actorID: 2},
    {movieID: 3, actorID: 3},
    {movieID: 4, actorID: 3},
    {movieID: 5, actorID: 2},
  ],
};

const {Test, it} = require('./test');
var engine = new SQLEngine(movieDatabase);

function assertSimilarRows(actual, expected, message) {
  // console.log('actual', actual);
  function logFailed(m, rows) {
    Test.expect(
      false,
      m + '<pre>' + rows.map(JSON.stringify).join(',\n') + '</pre>'
    );
  }
  if (!actual || actual.length == 0 || !expected || expected.length == 0) {
    return Test.assertSimilar(actual, expected, message);
  }
  function allPropertiesInLeftInRight(a, b) {
    return Object.keys(a).every(function (ak) {
      return a[ak] == b[ak];
    });
  }
  function similarObjects(a, b) {
    return allPropertiesInLeftInRight(a, b) && allPropertiesInLeftInRight(b, a);
  }
  function getRowsInLeftWhichAreNotInRight(left, right) {
    return left.filter(function (r) {
      return !right.some(function (a) {
        return similarObjects(a, r);
      });
    });
  }
  var missingRowsInActual = getRowsInLeftWhichAreNotInRight(expected, actual),
    extraRowsInActual = getRowsInLeftWhichAreNotInRight(actual, expected);
  if (missingRowsInActual.length > 0) {
    logFailed(
      'Failure: expected result to include the following rows, but they were missing: ',
      missingRowsInActual
    );
    return;
  }
  if (extraRowsInActual.length > 0) {
    logFailed(
      'Failure: result contained the following rows which were not expected: ',
      extraRowsInActual
    );
    return;
  }

  Test.expect(true, message);
}

it('should SELECT columns', function () {
  var actual = engine.execute('SELECT movie.name FROM movie');
  assertSimilarRows(actual, [
    {'movie.name': 'Avatar'},
    {'movie.name': 'Titanic'},
    {'movie.name': 'Infamous'},
    {'movie.name': 'Skyfall'},
    {'movie.name': 'Aliens'},
  ]);
});

it('should apply WHERE', function () {
  var actual = engine.execute(
    'SELECT movie.name FROM movie WHERE movie.directorID = 1'
  );
  assertSimilarRows(actual, [
    {'movie.name': 'Avatar'},
    {'movie.name': 'Titanic'},
    {'movie.name': 'Aliens'},
  ]);
});

it('should perform parent->child JOIN', function () {
  var actual = engine.execute(
    'SELECT movie.name, director.name ' +
      'FROM movie ' +
      'JOIN director ON director.id = movie.directorID'
  );
  assertSimilarRows(actual, [
    {'movie.name': 'Avatar', 'director.name': 'James Cameron'},
    {'movie.name': 'Titanic', 'director.name': 'James Cameron'},
    {'movie.name': 'Aliens', 'director.name': 'James Cameron'},
    {'movie.name': 'Infamous', 'director.name': 'Douglas McGrath'},
    {'movie.name': 'Skyfall', 'director.name': 'Sam Mendes'},
  ]);
});

it('should perform child->parent JOIN ', function () {
  var actual = engine.execute(
    'SELECT movie.name, director.name ' +
      'FROM director ' +
      'JOIN movie ON director.id = movie.directorID'
  );
  assertSimilarRows(actual, [
    {'movie.name': 'Avatar', 'director.name': 'James Cameron'},
    {'movie.name': 'Titanic', 'director.name': 'James Cameron'},
    {'movie.name': 'Infamous', 'director.name': 'Douglas McGrath'},
    {'movie.name': 'Skyfall', 'director.name': 'Sam Mendes'},
    {'movie.name': 'Aliens', 'director.name': 'James Cameron'},
  ]);
});

it('should perform many-to-many JOIN and apply WHERE', function () {
  var actual = engine.execute(
    'SELECT movie.name, actor.name ' +
      'FROM movie ' +
      'JOIN actor_to_movie ON actor_to_movie.movieID = movie.id ' +
      'JOIN actor ON actor_to_movie.actorID = actor.id ' +
      "WHERE actor.name <> 'Daniel Craig'"
  );
  assertSimilarRows(actual, [
    {'movie.name': 'Aliens', 'actor.name': 'Sigourney Weaver'},
    {'movie.name': 'Avatar', 'actor.name': 'Sigourney Weaver'},
    {'movie.name': 'Infamous', 'actor.name': 'Sigourney Weaver'},
    {'movie.name': 'Titanic', 'actor.name': 'Leonardo DiCaprio'},
  ]);
});

const engine2 = new SQLEngine({
  movie: [
    {id: 1, title: 'The A-Team', year: 2010, directorID: 1},
    {id: 2, title: 'Avatar', year: 2009, directorID: 2},
    {id: 3, title: 'Titanic', year: 1997, directorID: 2},
    {id: 4, title: 'The Avengers', year: 2012, directorID: 3},
    {id: 5, title: 'Iron Man 3', year: 2013, directorID: 4},
    {id: 6, title: 'Iron Man', year: 2008, directorID: 5},
    {
      id: 7,
      title: 'The Lord of the Rings: The Return of the King',
      year: 2003,
      directorID: 6,
    },
    {
      id: 8,
      title: 'The Lord of the Rings: The Fellowship of the Ring',
      year: 2001,
      directorID: 6,
    },
    {
      id: 9,
      title: 'The Lord of the Rings: The Two Towers',
      year: 2002,
      directorID: 6,
    },
    {id: 10, title: 'Skyfall', year: 2012, directorID: 7},
    {id: 11, title: 'The Dark Knight Rises', year: 2012, directorID: 8},
    {id: 12, title: 'The Dark Knight', year: 2008, directorID: 8},
    {
      id: 13,
      title: "Pirates of the Caribbean: Dead Man's Chest",
      year: 2006,
      directorID: 9,
    },
    {id: 14, title: 'Toy Story 3', year: 2010, directorID: 10},
    {id: 15, title: 'E.T. the Extra-Terrestrial', year: 1982, directorID: 11},
    {id: 16, title: 'Toy Story', year: 1995, directorID: 12},
    {
      id: 17,
      title: 'Pirates of the Caribbean: On Stranger Tides',
      year: 2011,
      directorID: 13,
    },
    {id: 18, title: 'Jurassic Park', year: 1993, directorID: 11},
  ],
  director: [
    {id: 1, name: 'Joe Carnahan'},
    {id: 2, name: 'James Cameron'},
    {id: 3, name: 'Joss Whedon'},
    {id: 4, name: 'Shane Black'},
    {id: 5, name: 'Jon Favreau'},
    {id: 6, name: 'Peter Jackson'},
    {id: 7, name: 'Sam Mendes'},
    {id: 8, name: 'Christopher Nolan'},
    {id: 9, name: 'Gore Verbinski'},
    {id: 10, name: 'Lee Unkrich'},
    {id: 11, name: 'Steven Spielberg'},
    {id: 12, name: 'John Lasseter'},
    {id: 13, name: 'Rob Marshall'},
  ],
  actor: [
    {id: 1, name: 'Liam Neeson'},
    {id: 2, name: 'Bradley Cooper'},
    {id: 3, name: 'Jessica Biel'},
    {id: 4, name: "Quinton 'Rampage' Jackson"},
    {id: 5, name: 'Sam Worthington'},
    {id: 6, name: 'Zoe Saldana'},
    {id: 7, name: 'Sigourney Weaver'},
    {id: 8, name: 'Stephen Lang'},
    {id: 9, name: 'Leonardo DiCaprio'},
    {id: 10, name: 'Kate Winslet'},
    {id: 11, name: 'Billy Zane'},
    {id: 12, name: 'Kathy Bates'},
    {id: 13, name: 'Robert Downey Jr.'},
    {id: 14, name: 'Chris Evans'},
    {id: 15, name: 'Mark Ruffalo'},
    {id: 16, name: 'Chris Hemsworth'},
    {id: 17, name: 'Gwyneth Paltrow'},
    {id: 18, name: 'Don Cheadle'},
    {id: 19, name: 'Guy Pearce'},
    {id: 20, name: 'Terrence Howard'},
    {id: 21, name: 'Jeff Bridges'},
    {id: 22, name: 'Noel Appleby'},
    {id: 23, name: 'Alexandra Astin'},
    {id: 24, name: 'Sean Astin'},
    {id: 25, name: 'David Aston'},
    {id: 26, name: 'Alan Howard'},
    {id: 27, name: 'Elijah Wood'},
    {id: 28, name: 'Bruce Allpress'},
    {id: 29, name: 'John Bach'},
    {id: 30, name: 'Sala Baker'},
    {id: 31, name: 'Daniel Craig'},
    {id: 32, name: 'Judi Dench'},
    {id: 33, name: 'Javier Bardem'},
    {id: 34, name: 'Ralph Fiennes'},
    {id: 35, name: 'Christian Bale'},
    {id: 36, name: 'Gary Oldman'},
    {id: 37, name: 'Tom Hardy'},
    {id: 38, name: 'Joseph Gordon-Levitt'},
    {id: 39, name: 'Heath Ledger'},
    {id: 40, name: 'Aaron Eckhart'},
    {id: 41, name: 'Michael Caine'},
    {id: 42, name: 'Johnny Depp'},
    {id: 43, name: 'Orlando Bloom'},
    {id: 44, name: 'Keira Knightley'},
    {id: 45, name: 'Jack Davenport'},
    {id: 46, name: 'Tom Hanks'},
    {id: 47, name: 'Tim Allen'},
    {id: 48, name: 'Joan Cusack'},
    {id: 49, name: 'Ned Beatty'},
    {id: 50, name: 'Dee Wallace'},
    {id: 51, name: 'Henry Thomas'},
    {id: 52, name: 'Peter Coyote'},
    {id: 53, name: 'Robert MacNaughton'},
    {id: 54, name: 'Don Rickles'},
    {id: 55, name: 'Jim Varney'},
    {id: 56, name: 'Penélope Cruz'},
    {id: 57, name: 'Geoffrey Rush'},
    {id: 58, name: 'Ian McShane'},
    {id: 59, name: 'Sam Neill'},
    {id: 60, name: 'Laura Dern'},
    {id: 61, name: 'Jeff Goldblum'},
    {id: 62, name: 'Richard Attenborough'},
  ],
  actor_to_movie: [
    {actorID: 1, movieID: 1},
    {actorID: 2, movieID: 1},
    {actorID: 3, movieID: 1},
    {actorID: 4, movieID: 1},
    {actorID: 5, movieID: 2},
    {actorID: 6, movieID: 2},
    {actorID: 7, movieID: 2},
    {actorID: 8, movieID: 2},
    {actorID: 9, movieID: 3},
    {actorID: 10, movieID: 3},
    {actorID: 11, movieID: 3},
    {actorID: 12, movieID: 3},
    {actorID: 13, movieID: 4},
    {actorID: 13, movieID: 5},
    {actorID: 13, movieID: 6},
    {actorID: 14, movieID: 4},
    {actorID: 15, movieID: 4},
    {actorID: 16, movieID: 4},
    {actorID: 17, movieID: 5},
    {actorID: 17, movieID: 6},
    {actorID: 18, movieID: 5},
    {actorID: 19, movieID: 5},
    {actorID: 20, movieID: 6},
    {actorID: 21, movieID: 6},
    {actorID: 22, movieID: 7},
    {actorID: 22, movieID: 8},
    {actorID: 23, movieID: 7},
    {actorID: 24, movieID: 7},
    {actorID: 24, movieID: 8},
    {actorID: 24, movieID: 9},
    {actorID: 25, movieID: 7},
    {actorID: 26, movieID: 8},
    {actorID: 27, movieID: 8},
    {actorID: 28, movieID: 9},
    {actorID: 29, movieID: 9},
    {actorID: 30, movieID: 9},
    {actorID: 31, movieID: 10},
    {actorID: 32, movieID: 10},
    {actorID: 33, movieID: 10},
    {actorID: 34, movieID: 10},
    {actorID: 35, movieID: 11},
    {actorID: 35, movieID: 12},
    {actorID: 36, movieID: 11},
    {actorID: 37, movieID: 11},
    {actorID: 38, movieID: 11},
    {actorID: 39, movieID: 12},
    {actorID: 40, movieID: 12},
    {actorID: 41, movieID: 12},
    {actorID: 42, movieID: 13},
    {actorID: 42, movieID: 17},
    {actorID: 43, movieID: 13},
    {actorID: 44, movieID: 13},
    {actorID: 45, movieID: 13},
    {actorID: 46, movieID: 14},
    {actorID: 46, movieID: 16},
    {actorID: 47, movieID: 14},
    {actorID: 47, movieID: 16},
    {actorID: 48, movieID: 14},
    {actorID: 49, movieID: 14},
    {actorID: 50, movieID: 15},
    {actorID: 51, movieID: 15},
    {actorID: 52, movieID: 15},
    {actorID: 53, movieID: 15},
    {actorID: 54, movieID: 16},
    {actorID: 55, movieID: 16},
    {actorID: 56, movieID: 17},
    {actorID: 57, movieID: 17},
    {actorID: 58, movieID: 17},
    {actorID: 59, movieID: 18},
    {actorID: 60, movieID: 18},
    {actorID: 61, movieID: 18},
    {actorID: 62, movieID: 18},
  ],
});

// console.log(
//   engine2.execute(
//     "SELECT movie.title FROM movie WHERE movie.title = 'Pirates of the Caribbean: Dead Man''s Chest'"
//   )
// );

assertSimilarRows(
  engine2.execute(
    'SELECT actor.name, movie.title FROM movie JOIN actor_to_movie ON actor_to_movie.movieID = movie.id JOIN actor ON actor_to_movie.actorID = actor.id WHERE movie.directorID = 8'
  ),
  [
    {'movie.title': 'The Dark Knight Rises', 'actor.name': 'Christian Bale'},
    {'movie.title': 'The Dark Knight Rises', 'actor.name': 'Gary Oldman'},
    {'movie.title': 'The Dark Knight Rises', 'actor.name': 'Tom Hardy'},
    {
      'movie.title': 'The Dark Knight Rises',
      'actor.name': 'Joseph Gordon-Levitt',
    },
    {'movie.title': 'The Dark Knight', 'actor.name': 'Christian Bale'},
    {'movie.title': 'The Dark Knight', 'actor.name': 'Heath Ledger'},
    {'movie.title': 'The Dark Knight', 'actor.name': 'Aaron Eckhart'},
    {'movie.title': 'The Dark Knight', 'actor.name': 'Michael Caine'},
  ]
);

assertSimilarRows(
  engine2.execute(
    'select movie.title, actor.name, movie.year from movie join actor_to_movie on actor_to_movie.movieID = movie.id join actor on actor.id = actor_to_movie.actorID JOIN director on director.id = movie.directorID'
  ),
  [
    {
      'movie.title': 'The A-Team',
      'actor.name': 'Liam Neeson',
      'movie.year': 2010,
    },
    {
      'movie.title': 'The A-Team',
      'actor.name': 'Bradley Cooper',
      'movie.year': 2010,
    },
    {
      'movie.title': 'The A-Team',
      'actor.name': 'Jessica Biel',
      'movie.year': 2010,
    },
    {
      'movie.title': 'The A-Team',
      'actor.name': "Quinton 'Rampage' Jackson",
      'movie.year': 2010,
    },
    {
      'movie.title': 'Avatar',
      'actor.name': 'Sam Worthington',
      'movie.year': 2009,
    },
    {'movie.title': 'Avatar', 'actor.name': 'Zoe Saldana', 'movie.year': 2009},
    {
      'movie.title': 'Avatar',
      'actor.name': 'Sigourney Weaver',
      'movie.year': 2009,
    },
    {'movie.title': 'Avatar', 'actor.name': 'Stephen Lang', 'movie.year': 2009},
    {
      'movie.title': 'Titanic',
      'actor.name': 'Leonardo DiCaprio',
      'movie.year': 1997,
    },
    {
      'movie.title': 'Titanic',
      'actor.name': 'Kate Winslet',
      'movie.year': 1997,
    },
    {'movie.title': 'Titanic', 'actor.name': 'Billy Zane', 'movie.year': 1997},
    {'movie.title': 'Titanic', 'actor.name': 'Kathy Bates', 'movie.year': 1997},
    {
      'movie.title': 'The Avengers',
      'actor.name': 'Robert Downey Jr.',
      'movie.year': 2012,
    },
    {
      'movie.title': 'Iron Man 3',
      'actor.name': 'Robert Downey Jr.',
      'movie.year': 2013,
    },
    {
      'movie.title': 'Iron Man',
      'actor.name': 'Robert Downey Jr.',
      'movie.year': 2008,
    },
    {
      'movie.title': 'The Avengers',
      'actor.name': 'Chris Evans',
      'movie.year': 2012,
    },
    {
      'movie.title': 'The Avengers',
      'actor.name': 'Mark Ruffalo',
      'movie.year': 2012,
    },
    {
      'movie.title': 'The Avengers',
      'actor.name': 'Chris Hemsworth',
      'movie.year': 2012,
    },
    {
      'movie.title': 'Iron Man 3',
      'actor.name': 'Gwyneth Paltrow',
      'movie.year': 2013,
    },
    {
      'movie.title': 'Iron Man',
      'actor.name': 'Gwyneth Paltrow',
      'movie.year': 2008,
    },
    {
      'movie.title': 'Iron Man 3',
      'actor.name': 'Don Cheadle',
      'movie.year': 2013,
    },
    {
      'movie.title': 'Iron Man 3',
      'actor.name': 'Guy Pearce',
      'movie.year': 2013,
    },
    {
      'movie.title': 'Iron Man',
      'actor.name': 'Terrence Howard',
      'movie.year': 2008,
    },
    {
      'movie.title': 'Iron Man',
      'actor.name': 'Jeff Bridges',
      'movie.year': 2008,
    },
    {
      'movie.title': 'The Lord of the Rings: The Return of the King',
      'actor.name': 'Noel Appleby',
      'movie.year': 2003,
    },
    {
      'movie.title': 'The Lord of the Rings: The Fellowship of the Ring',
      'actor.name': 'Noel Appleby',
      'movie.year': 2001,
    },
    {
      'movie.title': 'The Lord of the Rings: The Return of the King',
      'actor.name': 'Alexandra Astin',
      'movie.year': 2003,
    },
    {
      'movie.title': 'The Lord of the Rings: The Return of the King',
      'actor.name': 'Sean Astin',
      'movie.year': 2003,
    },
    {
      'movie.title': 'The Lord of the Rings: The Fellowship of the Ring',
      'actor.name': 'Sean Astin',
      'movie.year': 2001,
    },
    {
      'movie.title': 'The Lord of the Rings: The Two Towers',
      'actor.name': 'Sean Astin',
      'movie.year': 2002,
    },
    {
      'movie.title': 'The Lord of the Rings: The Return of the King',
      'actor.name': 'David Aston',
      'movie.year': 2003,
    },
    {
      'movie.title': 'The Lord of the Rings: The Fellowship of the Ring',
      'actor.name': 'Alan Howard',
      'movie.year': 2001,
    },
    {
      'movie.title': 'The Lord of the Rings: The Fellowship of the Ring',
      'actor.name': 'Elijah Wood',
      'movie.year': 2001,
    },
    {
      'movie.title': 'The Lord of the Rings: The Two Towers',
      'actor.name': 'Bruce Allpress',
      'movie.year': 2002,
    },
    {
      'movie.title': 'The Lord of the Rings: The Two Towers',
      'actor.name': 'John Bach',
      'movie.year': 2002,
    },
    {
      'movie.title': 'The Lord of the Rings: The Two Towers',
      'actor.name': 'Sala Baker',
      'movie.year': 2002,
    },
    {
      'movie.title': 'Skyfall',
      'actor.name': 'Daniel Craig',
      'movie.year': 2012,
    },
    {'movie.title': 'Skyfall', 'actor.name': 'Judi Dench', 'movie.year': 2012},
    {
      'movie.title': 'Skyfall',
      'actor.name': 'Javier Bardem',
      'movie.year': 2012,
    },
    {
      'movie.title': 'Skyfall',
      'actor.name': 'Ralph Fiennes',
      'movie.year': 2012,
    },
    {
      'movie.title': 'The Dark Knight Rises',
      'actor.name': 'Christian Bale',
      'movie.year': 2012,
    },
    {
      'movie.title': 'The Dark Knight',
      'actor.name': 'Christian Bale',
      'movie.year': 2008,
    },
    {
      'movie.title': 'The Dark Knight Rises',
      'actor.name': 'Gary Oldman',
      'movie.year': 2012,
    },
    {
      'movie.title': 'The Dark Knight Rises',
      'actor.name': 'Tom Hardy',
      'movie.year': 2012,
    },
    {
      'movie.title': 'The Dark Knight Rises',
      'actor.name': 'Joseph Gordon-Levitt',
      'movie.year': 2012,
    },
    {
      'movie.title': 'The Dark Knight',
      'actor.name': 'Heath Ledger',
      'movie.year': 2008,
    },
    {
      'movie.title': 'The Dark Knight',
      'actor.name': 'Aaron Eckhart',
      'movie.year': 2008,
    },
    {
      'movie.title': 'The Dark Knight',
      'actor.name': 'Michael Caine',
      'movie.year': 2008,
    },
    {
      'movie.title': "Pirates of the Caribbean: Dead Man's Chest",
      'actor.name': 'Johnny Depp',
      'movie.year': 2006,
    },
    {
      'movie.title': 'Pirates of the Caribbean: On Stranger Tides',
      'actor.name': 'Johnny Depp',
      'movie.year': 2011,
    },
    {
      'movie.title': "Pirates of the Caribbean: Dead Man's Chest",
      'actor.name': 'Orlando Bloom',
      'movie.year': 2006,
    },
    {
      'movie.title': "Pirates of the Caribbean: Dead Man's Chest",
      'actor.name': 'Keira Knightley',
      'movie.year': 2006,
    },
    {
      'movie.title': "Pirates of the Caribbean: Dead Man's Chest",
      'actor.name': 'Jack Davenport',
      'movie.year': 2006,
    },
    {
      'movie.title': 'Toy Story 3',
      'actor.name': 'Tom Hanks',
      'movie.year': 2010,
    },
    {'movie.title': 'Toy Story', 'actor.name': 'Tom Hanks', 'movie.year': 1995},
    {
      'movie.title': 'Toy Story 3',
      'actor.name': 'Tim Allen',
      'movie.year': 2010,
    },
    {'movie.title': 'Toy Story', 'actor.name': 'Tim Allen', 'movie.year': 1995},
    {
      'movie.title': 'Toy Story 3',
      'actor.name': 'Joan Cusack',
      'movie.year': 2010,
    },
    {
      'movie.title': 'Toy Story 3',
      'actor.name': 'Ned Beatty',
      'movie.year': 2010,
    },
    {
      'movie.title': 'E.T. the Extra-Terrestrial',
      'actor.name': 'Dee Wallace',
      'movie.year': 1982,
    },
    {
      'movie.title': 'E.T. the Extra-Terrestrial',
      'actor.name': 'Henry Thomas',
      'movie.year': 1982,
    },
    {
      'movie.title': 'E.T. the Extra-Terrestrial',
      'actor.name': 'Peter Coyote',
      'movie.year': 1982,
    },
    {
      'movie.title': 'E.T. the Extra-Terrestrial',
      'actor.name': 'Robert MacNaughton',
      'movie.year': 1982,
    },
    {
      'movie.title': 'Toy Story',
      'actor.name': 'Don Rickles',
      'movie.year': 1995,
    },
    {
      'movie.title': 'Toy Story',
      'actor.name': 'Jim Varney',
      'movie.year': 1995,
    },
    {
      'movie.title': 'Pirates of the Caribbean: On Stranger Tides',
      'actor.name': 'Penélope Cruz',
      'movie.year': 2011,
    },
    {
      'movie.title': 'Pirates of the Caribbean: On Stranger Tides',
      'actor.name': 'Geoffrey Rush',
      'movie.year': 2011,
    },
    {
      'movie.title': 'Pirates of the Caribbean: On Stranger Tides',
      'actor.name': 'Ian McShane',
      'movie.year': 2011,
    },
    {
      'movie.title': 'Jurassic Park',
      'actor.name': 'Sam Neill',
      'movie.year': 1993,
    },
    {
      'movie.title': 'Jurassic Park',
      'actor.name': 'Laura Dern',
      'movie.year': 1993,
    },
    {
      'movie.title': 'Jurassic Park',
      'actor.name': 'Jeff Goldblum',
      'movie.year': 1993,
    },
    {
      'movie.title': 'Jurassic Park',
      'actor.name': 'Richard Attenborough',
      'movie.year': 1993,
    },
  ]
);
