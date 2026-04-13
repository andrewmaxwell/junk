import fs from 'fs';

// const movies = `Die Hard
// Miracle on 34th Street
// Glass Onion
// The Batman
// Wendell & Wild
// Monty Python and the Holy Grail
// The Fifth Element
// The Lego Batman Movie
// Miracle on 34th Street
// Everything Everywhere All at Once
// Dune: Part One
// Dune: Part Two
// Interstellar
// Spirited Away
// Spider-Man: Into the Spider-Verse
// The Dark Knight
// Beetlejuice
// The Lord of the Rings: The Fellowship of the Ring
// The Lord of the Rings: The Two Towers
// Scream
// The Lord of the Rings: The Return of the King
// The Lego Batman Movie
// Batman Begins
// Napoleon Dynamite
// The Princess Bride
// Fantastic Beasts and Where to Find Them
// Inception
// Interstellar
// The Lego Batman Movie
// The Dark Knight Rises
// Howl's Moving Castle
// A Quiet Place
// Harry Potter and the Sorcerer's Stone
// Harry Potter and the Chamber of Secrets
// Harry Potter and the Prisoner of Azkaban
// Harry Potter and the Goblet of Fire
// Interstellar
// Harry Potter and the Order of the Phoenix
// Arcane
// Harry Potter and the Half-Blood Prince
// Harry Potter and the Deathly Hallows: Part 1
// Harry Potter and the Deathly Hallows: Part 2
// A Quiet Place Part II
// The Lego Batman Movie
// The Boy and the Heron
// Arcane
// Nausicaä of the Valley of the Wind
// Top Gun
// Top Gun: Maverick
// Blade Runner 2049
// Jurassic Park
// Pirates of the Caribbean: The Curse of the Black Pearl
// My Neighbor Totoro
// Suzume
// The Sixth Sense
// Monster House
// The Matrix
// Frankenstein
// Princess Mononoke
// Elf
// The Goonies
// The Muppet Christmas Carol
// Scrooged
// The Hobbit: An Unexpected Journey
// The Hobbit: The Desolation of Smaug
// The Hobbit: The Battle of the Five Armies
// How to Train Your Dragon
// Tenet
// Spider-Man: Across the Spider-Verse
// Best in Show
// Back to the Future
// The Secret Life of Walter Mitty
// Pacific Rim
// The Lord of the Rings: The Fellowship of the Ring
// The Lord of the Rings: The Two Towers
// The Lord of the Rings: The Return of the King
// Night at the Museum
// The Adventures of Tintin`.split('\n');

// const apiKey = 'a82403e1';

// async function getMovieRating(movie: string) {
//   const response = await fetch(
//     `http://www.omdbapi.com/?t=${movie}&apikey=${apiKey}`,
//   );
//   return response.json();
// }

// const data = await Promise.all(movies.map(getMovieRating));

// fs.writeFileSync('movieRatings.json', JSON.stringify(data, null, 2));

const data = JSON.parse(fs.readFileSync('movieRatings.json', 'utf-8'));

const geomean = (arr: number[]) =>
  Math.pow(
    arr.reduce((a, b) => a * b, 1),
    1 / arr.length,
  );

const output = data
  .map((m) => {
    const [imdb, rotten, metacritic] = m.Ratings?.map((r) => r.Value) || [];
    return {
      score: geomean([
        imdb ? Number(imdb.split('/')[0]) * 10 : '',
        rotten ? rotten.split('%')[0] : '',
        metacritic ? metacritic.split('/')[0] : '',
      ]),
      title: m.Title,
    };
  })
  .sort((a, b) => b.score - a.score);

console.log(JSON.stringify(output));
