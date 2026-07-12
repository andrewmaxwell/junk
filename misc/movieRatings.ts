import fs from 'fs';

const movies = `WALL-E`.split('\n');

const output = (
  await Promise.all(
    movies.map(async (movie: string) => {
      const response = await fetch(
        `http://www.omdbapi.com/?t=${movie}&apikey=a82403e1`,
      );
      return response.json();
    }),
  )
)
  .map((m) =>
    ['Internet Movie Database', 'Rotten Tomatoes', 'Metacritic']
      .map(
        (source) =>
          m.Ratings.find((r) => r.Source === source)?.Value.split(/\/|%/)[0] ||
          '',
      )
      .join('\t'),
  )
  .join('\n');

fs.writeFileSync('ratings.txt', output);
