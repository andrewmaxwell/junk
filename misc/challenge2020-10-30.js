const fs = require('fs');

const pokemon = fs
  .readFileSync('/Users/amaxw/Downloads/pokemon.csv')
  .toString()
  .split('\n')
  .map((r) => r.split(',').map((n) => (isNaN(n) ? n : Number(n))))
  .slice(1)
  .map((r) =>
    Object.fromEntries(
      [
        'id',
        'name',
        'type1',
        'type2',
        'hp',
        'attack',
        'defense',
        'spAttack',
        'spDef',
        'speed',
        'generation',
        'legendary',
      ].map((key, i) => [key, r[i]])
    )
  );

const pokedex = Object.fromEntries(
  pokemon.map((p) => {
    p.win = [];
    p.lose = [];
    return [p.id, p];
  })
);

const combats = fs
  .readFileSync('/Users/amaxw/Downloads/combats.csv')
  .toString()
  .split('\n')
  .map((r) => r.split(',').map((n) => (isNaN(n) ? n : Number(n))))
  .slice(1);

combats.forEach(([a, b, winner]) => {
  if (!pokedex[a] || !pokedex[b]) return;
  if (winner === a) {
    pokedex[a].win.push(b);
    pokedex[b].lose.push(a);
  } else {
    pokedex[a].lose.push(b);
    pokedex[b].win.push(a);
  }
});

pokemon.forEach((p) => {
  p.ratio = p.win.length / p.lose.length;
  p.deltas = {};

  ['win', 'lose'].forEach((t) => {
    const deltaKey = t + 'Delta';
    p[deltaKey] = {};
    for (const key of [
      'hp',
      'attack',
      'defense',
      'spAttack',
      'spDef',
      'speed',
      'generation',
    ]) {
      let delta = 0;
      let num = 0;
      for (const id of p[t]) {
        const o = pokedex[id];
        if (isNaN(p[key]) || isNaN(o[key])) continue;
        delta += p[key] - o[key];
        num++;
      }
      p[deltaKey][key] = delta / num;
    }
  });
});
pokemon.sort((a, b) => b.ratio - a.ratio);
console.log(pokemon.slice(0, 10));
