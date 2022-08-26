const dirs = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];

const boggleSolver = (grid, dict) => {
  // flatten grid
  const boardSize = grid.length;
  grid = [].concat(...grid);

  const trie = {};
  for (const word of dict) {
    let ct = trie;
    for (const letter of word) ct = ct[letter] = ct[letter] || {};
    ct._ = true;
  }

  const queue = [];
  for (let i = 0; i < boardSize ** 2; i++) {
    queue[i] = [i];
  }

  const result = new Set();
  for (const path of queue) {
    let ct = trie;
    for (const i of path) ct = ct[grid[i]];

    if (!ct) continue;

    if (ct._) {
      const word = path.map((p) => grid[p]).join('');
      // console.log(word, path);
      result.add(word);
    }

    const lastIndex = path[path.length - 1];
    const cx = lastIndex % boardSize;
    const cy = Math.floor(lastIndex / boardSize);
    for (const [dy, dx] of dirs) {
      const index = (cy + dy) * boardSize + cx + dx;
      if (
        cx + dx >= 0 &&
        cy + dy >= 0 &&
        cx + dx < boardSize &&
        cy + dy < boardSize &&
        ct[grid[index]] && // must be part of a word in the dictionary
        !path.includes(index) // can't use the same letter twice
      ) {
        queue.push([...path, index]);
      }
    }
  }

  return [...result].sort((a, b) => a.length - b.length || a.localeCompare(b));
};

import fetch from 'node-fetch';
const go = async () => {
  const response = await fetch(
    'https://raw.githubusercontent.com/redbo/scrabble/master/dictionary.txt'
  );
  const dict = await response.text();
  const grid = `
AOESC
UATRS
WTEEE
LIBNG
LSSTQ`;

  const solution = boggleSolver(
    grid
      .trim()
      .split('\n')
      .map((r) => [...r.trim()]),
    dict.split('\n')
  ).filter((s) => s.length >= 4);

  console.log(solution.map((s) => `${s} (${s.length})`).join('\n'));
  console.log(solution.length, 'words');
};

go();

// const {Test} = require('./test');
// var grid = [
//   ['P', 'A', 'T', 'S'],
//   ['E', 'F', 'G', 'K'],
//   ['O', 'I', 'E', 'C'],
//   ['G', 'N', 'T', 'R'],
// ];
// var dict = [
//   'AGE',
//   'AGED',
//   'AGEDLY',
//   'AGEING',
//   'AGEINGS',
//   'AGEISM',
//   'AGENT',
//   'AGENTRY',
//   'AGENTS',
//   'AGING',
//   'AGINGS',
//   'AGIST',
//   'FEAT',
//   'FEATER',
//   'FEATEST',
//   'NECK',
//   'NECKBAND',
//   'NECKBANDS',
//   'NECKS',
//   'NECKTIE',
//   'NECKTIES',
//   'STAGE',
//   'STAGECOACH',
//   'STAGECOACHES',
//   'STAGING',
//   'STAGINGS',
//   'STAGNANCY',
//   'TAP',
//   'TAPE',
//   'TAPED',
// ];
// var expected = [
//   'STAGING',
//   'AGEING',
//   'AGENT',
//   'AGING',
//   'NECKS',
//   'STAGE',
//   'FEAT',
//   'NECK',
//   'TAPE',
//   'AGE',
//   'TAP',
// ];

// Test.assertSimilar(boggleSolver(grid, dict), expected);

// const result2 = boggleSolver(
//   [
//     ['H', 'U', 'N', 'S'],
//     ['N', 'B', 'I', 'E'],
//     ['E', 'A', 'M', 'L'],
//     ['T', 'S', 'S', 'O'],
//   ],
//   'ABET|ABETMENT|ABETS|ABETTAL|ABETTALS|AIL|AILANTHUS|AILANTHUSES|AILS|AILUROPHOBE|AILUROPHOBIA|AIM|AIMED|AIMER|AIMS|AINUS|AIR|AMEN|AMENABILITY|AMENABLE|AMENS|AMENT|AMENTS|AMIES|AMIGAS|AMIGO|AMINES|AMINIC|AMINITY|AMIS|AMISH|AMISS|AMOLE|AMOLES|AMONG|AMONGST|ASS|ASSAFOETIDA|ASSAGAI|ATE|ATELIER|ATELIERS|BAIL|BAILABLE|BAILED|BAILS|BAILSMAN|BAILSMEN|BAIRN|BAIRNS|BAN|BANAL|BANALITIES|BANE|BANED|BANEFUL|BANES|BANG|BANGED|BAS|BASAL|BASALLY|BASE|BASEBALL|BASEBALLS|BASS|BASSES|BASSET|BASSO|BASSOON|BASSOONIST|BAST|BASTARD|BASTARDIES|BASTE|BASTED|BASTER|BAT|BATBOY|BATBOYS|BATE|BATEAU|BATEAUX|BATES|BATFISH|BATH|BATS|BATSMAN|BATSMEN|BATTALION|BATTALIONS|BEAM|BEAMED|BEAMIER|BEAMS|BEAMY|BEAN|BEANBAG|BEANBAGS|BEAST|BEASTIE|BEASTIES|BEAT|BEATABLE|BEATEN|BEATS|BEAU|BEAUCOUP|BEN|BENCH|BENCHED|BESMILE|BESMIRCH|BESMIRCHED|BESS|BESSEMER|BEST|BESTED|BESTIAL|BET|BETA|BETAKE|BETAKEN|BETAS|BETATRON|BETATRONS|BETS|BETTA|BETTAS|BIAS|BIASED|BIASEDLY|BIENS|BIER|BIERS|BILE|BILES|BILGE|BILGED|BIN|BINAL|BINARIES|BINES|BINGE|BINGES|BINS|BINTS|BIO|BUN|BUNCH|BUNCHED|BUNS|BUNSEN|BUNT|ELM|ELMIER|ELMIEST|ELMS|ELMY|ELOCUTION|EMS|EMU|EMULATE|ENS|ENSAMPLES|ENSCONCE|HUB|HUBBIES|HUBBUB|HUN|HUNCH|HUNCHBACK|HUNS|HUNT|HUNTABLE|IAMB|IAMBI|IAMBIC|IBM|ICBM|ICE|INS|INSALIVATING|INSALIVATION|LEI|LEIPZIG|LEIS|LEISTER|LEISURE|LEMAN|LEMANS|LEMMA|LENS|LENSE|LENSED|LIANES|LIAR|LIARS|LIB|LIBATION|LIBATIONARY|LIE|LIECHTENSTEIN|LIED|LIEN|LIENABLE|LIENAL|LIENS|LIENTERIES|LIER|LIES|LIEU|LIEUT|LIM|LIMA|LIMACONS|LIMAS|LIMB|LIMBECK|LIMBED|LIME|LIMEADE|LIMEADES|LIMENS|LIMERICK|LIMERICKS|LIMES|LIMESTONE|LIMESTONES|LIMO|LIMONITE|LIMONITIC|LIMOS|LIMOUSINE|LIMOUSINES|LINE|LINEABLE|LINEAGE|LINEMAN|LINEMEN|LINEN|LINES|LINESMAN|LINESMEN|LINS|LINSEED|LINSEEDS|LOSS|LOSSES|LOSSY|MAIL|MAILABILITY|MAILABLE|MAILS|MAILWOMAN|MAILWOMEN|MAIN|MAINE|MAINFRAME|MAINFRAMES|MAINS|MAINSAIL|MAINSAILS|MAN|MANACLE|MANACLED|MANE|MANED|MANEGE|MANES|MANEUVER|MANEUVERABILITY|MAS|MASCARA|MASCARAS|MASS|MASSA|MASSACHUSETTS|MAST|MASTECTOMIES|MASTECTOMY|MAT|MATADOR|MATADORS|MATE|MATED|MATELESS|MATES|MATESHIP|MATEY|MATS|MATT|MATTE|MEIN|MEIOSES|MEIOSIS|MEN|MENACE|MENACED|MENS|MENSAL|MENSAS|MENU|MENUS|MEOW|MIEN|MIENS|MIFF|MIFFED|MIL|MILADIES|MILADIS|MILE|MILEAGE|MILEAGES|MILES|MILESTONE|MILESTONES|MILOS|MILQUETOAST|MILQUETOASTS|MILS|MILT|MILTIEST|MIN|MINABLE|MINACIOUSNESS|MINE|MINEABLE|MINED|MINES|MINESTRONE|MINESWEEPER|MINS|MINSTER|MINSTERS|MISE|MISEDITS|MISEDUCATE|MOLE|MOLECULAR|MOLECULARLY|MOLES|MOLESKIN|MOLESKINS|MOLIES|MOLINE|MOLL|MOLLIE|MOSS|MOSSBACK|MOSSBACKS|MSS|MUCH|MUCHES|NIB|NIBBED|NIBBLE|NIL|NILE|NILL|NILLED|NILS|NIM|NIMBI|NIMBLE|NIMS|NINCOMPOOP|NINCOMPOOPS|NUB|NUBBIER|NUBBIEST|NUBIA|NUBIAS|NUBILE|NUBILITIES|NUBILITY|NUN|NUNCIO|NUNCIOS|OLE|OLEAGINOUS|OLEANDER|OLES|OLEUMS|OLFACTION|OMEN|OMENED|OMENS|OMICRON|OMICRONS|OMS|ONAGER|ONAGERS|OSSEA|OSSEOUS|OSSEOUSLY|SEMI|SEMIACTIVE|SEMIAGRICULTURAL|SIAM|SIAMESE|SIAMESES|SIB|SIBERIA|SIBERIAN|SILO|SILOED|SILOING|SILOS|SILT|SILTATION|SIN|SINATRA|SINCE|SINE|SINECURE|SINECURES|SNUB|SNUBBED|SNUBBER|SNUBNESS|SNUBS|SNUCK|TAB|TABARD|TABARDED|TABU|TABUED|TABUING|TAI|TAIGA|TAIL|TAILBACKS|TAILBONE|TAILS|TAILSKIDS|TAILSPIN|TAM|TAMABLE|TAMALE|TAME|TAMEABLE|TAMED|TAMES|TAMEST|TAMING|TAMS|TAN|TANAGER|TANAGERS|TASS|TASSEL|TASSELED|TEA|TEABERRIES|TEABERRY|TEAM|TEAMAKER|TEAMAKERS|TEAMS|TEAMSTER|TEAMSTERS|TEAS|TEASE|TEASED|TEN|TENABILITY|TENABLE'.split(
//     '|'
//   )
// );

// const expected2 = [
//   'BAILSMEN',
//   'SNUBNESS',
//   'BATSMEN',
//   'BESMILE',
//   'LINEMAN',
//   'AMINES',
//   'AMOLES',
//   'BASSET',
//   'LIANES',
//   'LIMENS',
//   'MOLIES',
//   'MOLINE',
//   'NUBIAS',
//   'NUBILE',
//   'ABETS',
//   'AMENS',
//   'AMIES',
//   'AMOLE',
//   'BAILS',
//   'BANES',
//   'BASSO',
//   'BASTE',
//   'BATES',
//   'BEAMS',
//   'BEAST',
//   'BEATS',
//   'BETAS',
//   'BIENS',
//   'BILES',
//   'BINES',
//   'LEMAN',
//   'LIENS',
//   'LIMAS',
//   'LIMES',
//   'LIMOS',
//   'LINES',
//   'MAILS',
//   'MAINE',
//   'MAINS',
//   'MANES',
//   'MATES',
//   'MIENS',
//   'MILES',
//   'MILOS',
//   'MINES',
//   'MOLES',
//   'NUBIA',
//   'OMENS',
//   'OSSEA',
//   'SILOS',
//   'TAILS',
//   'TAMES',
//   'TEAMS',
//   'ABET',
//   'AILS',
//   'AIMS',
//   'AMEN',
//   'AMIS',
//   'BAIL',
//   'BANE',
//   'BASE',
//   'BASS',
//   'BAST',
//   'BATE',
//   'BATS',
//   'BEAM',
//   'BEAN',
//   'BEAT',
//   'BESS',
//   'BEST',
//   'BETA',
//   'BETS',
//   'BIAS',
//   'BILE',
//   'BINS',
//   'BUNS',
//   'ELMS',
//   'HUNS',
//   'IAMB',
//   'LEIS',
//   'LENS',
//   'LIEN',
//   'LIES',
//   'LIMA',
//   'LIMB',
//   'LIME',
//   'LIMO',
//   'LINE',
//   'LINS',
//   'LOSS',
//   'MAIL',
//   'MAIN',
//   'MANE',
//   'MASS',
//   'MAST',
//   'MATE',
//   'MATS',
//   'MEIN',
//   'MENS',
//   'MENU',
//   'MIEN',
//   'MILE',
//   'MILS',
//   'MINE',
//   'MINS',
//   'MISE',
//   'MOLE',
//   'MOSS',
//   'NILE',
//   'NILS',
//   'NIMS',
//   'OLES',
//   'OMEN',
//   'SEMI',
//   'SIAM',
//   'SILO',
//   'SINE',
//   'SNUB',
//   'TABU',
//   'TAIL',
//   'TAME',
//   'TAMS',
//   'TASS',
//   'TEAM',
//   'TEAS',
//   'AIL',
//   'AIM',
//   'ASS',
//   'ATE',
//   'BAN',
//   'BAS',
//   'BAT',
//   'BEN',
//   'BET',
//   'BIN',
//   'BUN',
//   'ELM',
//   'EMS',
//   'ENS',
//   'HUB',
//   'HUN',
//   'IBM',
//   'INS',
//   'LEI',
//   'LIB',
//   'LIE',
//   'LIM',
//   'MAN',
//   'MAS',
//   'MAT',
//   'MEN',
//   'MIL',
//   'MIN',
//   'MSS',
//   'NIB',
//   'NIL',
//   'NIM',
//   'NUB',
//   'NUN',
//   'OLE',
//   'OMS',
//   'SIB',
//   'SIN',
//   'TAB',
//   'TAI',
//   'TAM',
//   'TAN',
//   'TEA',
//   'TEN',
// ];

// // for (let i = 0; i < result2.length; i++) {
// //   if (result2[i] !== expected2[i]) console.log(result2[i], expected2[i]);
// // }

// Test.assertSimilar(result2, expected2);
