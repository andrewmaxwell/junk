const input = `                                           S         C   O       U         Z     R                                             
                                           M         O   U       K         W     O                                             
  #########################################.#########.###.#######.#########.#####.###########################################  
  #.#...#...#.....#.#.#...#.............#...#.#.....#...#...#...........#.#.....#...........#...#.#...#.#.#...#.#...#...#.#.#  
  #.###.###.#.#.###.#.###.###########.#.###.#.#.#######.###.###########.#.###.#.#######.#.#.###.#.#.###.#.#.###.#.###.###.#.#  
  #...#.#.#...#.#.........#...#.#...#.#.......#.....#...#.#.#.#...#.........#.#.#.......#.#.......................#.........#  
  #.###.#.#####.###.#####.###.#.###.#####.#####.#####.###.#.#.###.#.#.#.#.#####.#.###.#####.#.###.#.###.#.#####.#####.#####.#  
  #.#.#.#...............#.......................#.#...#.#.....#...#.#.#.#.#.....#...#.#...#.#...#.#...#.#.#.#.#.#.......#.#.#  
  #.#.#.#########.#.#.#####.#.#.#######.#######.#.#.#.#.###.#####.#.#.#####.###.#.#####.#####.#.###.#.###.#.#.###.#####.#.###  
  #.#.#.#.....#.#.#.#.#.#...#.#.#...#.....#...#...#.#.....#.....#...#...#.#.#.#.#.........#.#.#.#...#.#...#...#.#.#...#.#.#.#  
  #.#.#.###.###.#######.#####.###.###.#######.#.#######.###.#.###.#.#.###.###.#.###.#.#.###.#.###.#.#.#####.###.#.#.#####.#.#  
  #.#...#.......#.........#.....#.#.#...#.#.#.....#.......#.#...#.#.#...#.........#.#.#...#.#...#.#.#.#...#...........#...#.#  
  #.#.#####.#############.#######.#.#####.#.###.###.###########.#.#.#.#.#.#####.###.###.###.#####.#.#####.#.###.###.###.###.#  
  #.......#...#.......#...........................#.....#.#...#.#.#.#.#.#...#.....#.#...........#.#...#.#...#.#.#.#...#.....#  
  #####.###.###.###.###.###.#.###.#####.#.#.###########.#.#.#.#.#.#######.#.#####.#.###.#####.#########.###.#.###.#####.#####  
  #...#.....#.#.#.#.#.#.#.#.#.#.#.#.#...#.#.#...#.........#.#.#.#.#.#.....#.#.#.#.#.#.......#.................#.#.#.....#...#  
  ###.###.###.###.#.#.###.#####.###.#####.###.#.###.#########.#.#.#.#####.###.#.#######.#######.###.#.###.#.#.#.#.###.#####.#  
  #.#.#.......#.................#.#.#.........#.#.......#.......#...#...............#...#.....#.#.#.#.#.#.#.#...#.....#.#...#  
  #.#.###.###.#.#.#.###.###.###.#.#.#####.#.###.###.#.#########.#.#######.#.#.#.#######.#.#######.###.#.#######.#####.#.###.#  
  #...#.#.#.#.#.#.#...#...#.#.#...........#.#.#.#...#.#.....#.#.#...#.#...#.#.#.#.#.................#.......#.#...#.....#...#  
  ###.#.#.#.#.#####.#.#######.#.#.###.###.###.#.###.#####.#.###.#.###.#####.###.#.#####.###.#######.#.#######.#########.#.###  
  #.........#...#.#.#.#.......#.#.#...#...#.#.....#.....#.#...#.#.#.....#...#.#.#.....#...#.......#.#...#.......#.#...#.....#  
  ###.###.#######.#####.#####.#.#.#######.#.###.#.#.###.#.#.###.#.###.###.###.###.###.#.#.###############.###.###.###.###.###  
  #.#...#.#.......#.#.#.#...#...#...#.....#.#...#.#.#.#.#.#.#...#.......#.......#.#.#...#...#.#.........#.#.#.....#.........#  
  #.#####.#####.###.#.#####.#.###########.#.###.###.#.#.#.#.#.#.#.#####.#######.###.#.#####.#.###.#######.#.#############.###  
  #.#.#.#...#.....#...#.......#...#.#.#.#.#.......#...#.#.#...#.#.#.......#.......#.#...#.#.#.#.#.#...#.....#.#.#.#.#.#.....#  
  #.#.#.#.###.#.###.###.###.#.###.#.#.#.###.#.#####.#.###.#.#.###.###.#########.###.#.###.###.#.#.###.#.#####.#.#.#.#.###.###  
  #...#...#.#.#.#.....#.#.#.#.#.......#.....#...#...#...#.#.#.#...#.......#.#.#.#...#.............#.#.#...#...#.#...........#  
  #.#.#.###.###.###.#####.#########.###.###.###.#.#.#####.#############.###.#.#.#.#.#.###.#.#.#.###.#.#.#####.#.#.#.#.#.###.#  
  #.#...#...#.#...#...#...#...#.#.....#.#.#.#...#.#.#.#.#.......#.#.#...#.......#.#...#.#.#.#.#.#.#.............#.#.#.#.#...#  
  #####.#.###.#.###.#####.###.#.#.#.###.#.###.###.###.#.#####.###.#.#.#####.#.###.#####.#.###.###.#.###########.#########.###  
  #.#.#.#.#.#.....#.#.#.#.#...#...#.#.#.#.......#.......#.#...#.....#...#...#...#.....#.#.#.#.#.#.....#...#.#.#.#.#.#.#.#...#  
  #.#.#.#.#.#.#####.#.#.#.###.#####.#.#####.#.#.#####.###.###.###.#.#.#######.###.###.#.###.#.#.###.###.###.#.###.#.#.#.#.#.#  
  #.......#.#.....#...........#.#.#.......#.#.#.#.....#...#.#...#.#...#.....#...#...#.......#...#.................#.......#.#  
  #######.#.#.#####.###.#####.#.#.###.###.#####.#.#####.###.###.#.#########.#.#########.###.#######.###.#.#.###############.#  
  #.....#.....#...#.#.#...#.....#...#.#.........#.....#.........#.........#.......#.......#.#.#.......#.#.#...#...#...#.....#  
  ###.###.#######.###.#######.#.#.#######.#########.#######.###########.###.#########.#######.#####.###########.#.#.###.#.#.#  
  #.#.#.......#.#.#.#.#...#.#.#.#...#    H         G       U           O   O         Z    #.#...#.......#.....#.#...#.#.#.#.#  
  #.#.###.#.###.#.#.#.###.#.###.###.#    Y         M       K           H   U         W    #.###.#.#########.#######.#.#####.#  
  #.......#.#.#.....#.#.......#.....#                                                     #.#.......#.#.#.#.#...............#  
  #.#.#######.#####.#.#####.#.#.###.#                                                     #.###.#.###.#.#.#.#####.#########.#  
TV..#...#...#.#.#.......#...#.....#..AO                                                   #.#...#...#.#.#...#.#.#...#.....#.#  
  ###.#####.#.#.#####.#####.#######.#                                                     #.###.#.###.#.#.###.#.###.#######.#  
ZZ....#.#...#.#...#.......#.....#...#                                                     #...#.#.........#.#.#.#.#...#.....#  
  #.###.#.#.#.#.###.###.#.###.#####.#                                                     #.#.#.#####.###.#.#.#.###.#.#.#####  
  #.......#...........#.#.......#.#.#                                                   FA..#.....#.#.#.#...........#.#......DI
  #####################.#.#.#.###.###                                                     ###.#####.###.#############.#######  
  #.....#.............#.#.#.#.#.#...#                                                     #...#...............#...#.#.#......AO
  #.#.###.#.###.#.###.#####.###.#.#.#                                                     #####.#####.#.###.#.#.#.#.###.#####  
LU..#.....#.#...#.#.#...#.#.#.....#.#                                                   DR......#.....#.#.#.#...#.#...#.....#  
  #####.#.#####.###.#.###.#####.###.#                                                     #.#.#####.#####.#######.#.#.#####.#  
  #.#.#.#.....#.#...........#.....#..ZA                                                   #.#.#.......#...........#.#.......#  
  #.#.###.#####.#####.#####.#.#.#.#.#                                                     #######.#######.#.#.#####.###.#.#.#  
  #...#.#...#.#.....#.#.......#.#.#.#                                                     #.#...#...#.....#.#.......#...#.#.#  
  ###.#.#####.#.#####.#########.#####                                                     #.#.#####.#########.###.#.#####.###  
  #.........#...#...#.#.....#.#.....#                                                   CQ..#.....#.#...#.......#.#.#.#...#..FA
  #.#######.#####.#######.#.#.#######                                                     #.###.#####.#############.#.#####.#  
WA......#...#.#.#...#.#...#...#.....#                                                     #.#...#...#.....#.#.#.#.#...#...#.#  
  #.#####.###.#.###.#.###.###.#.###.#                                                     #.###.#.#####.#.#.#.#.#.#####.###.#  
  #.#.#...#.#.#.#.#.....#...#.#...#..OB                                                   #.#.......#...#.#.#.......#.#.#.#.#  
  ###.###.#.#.#.#.#.###.###.#.###.###                                                     #.#.#.#########.#.#.#####.#.#.#.#.#  
  #.....#.............#.....#.......#                                                     #...#.................#...........#  
  #.#########.#.#.###.#.###.#.#.#.###                                                     #########################.#####.#.#  
  #.....#.....#.#.#.#.#.#...#.#.#.#.#                                                     #...#...................#.#...#.#.#  
  #.###.#####.#.#.#.#############.#.#                                                     #.#.#.#######.#.#####.#####.#.###.#  
  #...#...#...#.#.#.....#.#.#...#.#.#                                                     #.#.#.#.....#.#...#...#.....#...#.#  
  ###.#.###############.#.#.#.#.###.#                                                     #.#.#.###.###.#####.###.#####.#####  
ZA..#.#...#.#.#...#...#.......#...#.#                                                   KN..#.#.......#.#.......#...#.#.#....FB
  #.#.#.###.#.#.#.###.#.###.###.###.#                                                     #.#.#####.#.#########.###.#.#.#.#.#  
  #...#.........#.......#.#.#........SM                                                   #.#.......#.#.....#.......#.#...#.#  
  ###########.###.#######.###########                                                     #############.#.###########.#######  
  #.#.....#...#...#...#...#.......#.#                                                     #.........#.#.#.#.#................KL
  #.#.#.###########.#.#.#.#.#.#####.#                                                     #.#####.#.#.###.#.###.#.#####.###.#  
WW....#.............#...#...#........LU                                                 WW..#...#.#.............#.....#.#...#  
  ###########.#.#####.###.#.#########                                                     #.###.###.###.###.#.#.#.#.###.###.#  
CQ..........#.#.....#...#.#...#.....#                                                   BX..#.......#...#.#.#.#.#.#.#.#.#.#..OH
  #.#######.###################.#.###                                                     #####.#.#####.#.###########.###.###  
  #.#.......#.....#.#...#.......#.#..PE                                                 KL....#.#.#.#.....#...#...#...#.....#  
  ###.#.#.###.#####.#.#####.#####.#.#                                                     #.#######.#########.#.###.#####.#.#  
  #.#.#.#.#.....#.......#...#.....#.#                                                     #.#...#...#...#.#.#.....#.#.#...#..GM
  #.###.###.#.#####.#.#####.#.#.###.#                                                     #.#.#.###.###.#.#.###.###.#.###.#.#  
  #.#.......#.......#.......#.#.....#                                                     #...#...........................#.#  
  #.#########.#.###.###.###.#####.###                                                     #####.#####.#.#####################  
  #.........#.#.#...#.#.#.#.#...#...#                                                   RO....#.#.#...#.#...#.#.#.#.........#  
  ###.#.#####.#####.#.#.#.#####.#####                                                     ###.###.#######.#.#.#.#.#.#.###.###  
WJ..#.#.#...#.#...#.#...#.....#.#.#..WA                                                   #.........#.....#.......#.#.#.....#  
  #.#.#.###.###.#.#######.#.#.#.#.#.#                                                     #.#######.#.###.###.###.#.#####.#.#  
  #.#.#...#.....#.#...#.#.#.#.....#.#                                                     #.#.......#.#.....#.#.#...#.....#.#  
  #.#.###.#.#.#.#####.#.###.#.#.#.#.#                                                     #.#####.###.#########.#.#.#######.#  
  #...#.....#.#.............#.#.#...#                                                     #.#.#.............#.....#.#...#....OB
  #.#.###.#.#.#####.###.#.#########.#    D       C       U           W       F   T        ###.#.###.###.#########.#.###.###.#  
  #.#.#...#.#...#.....#.#...#.#.....#    I       O       I           J       B   V        #.#.....#...#.#...#.#...#.#.......#  
  #.#####.###.#.###.###.#####.#.#.#######.#######.#######.###########.#######.###.#########.#.#######.#.#.#.#.###.###.###.#.#  
  #.....#.#.#.#...#.#.#...#.....#.#.......#...#.#.#...........#.#.#...#.........#.#.......#.#.#...#...#...#.#.....#.#.#.#.#.#  
  #.#####.#.#.#####.#.###########.#####.#.#.#.#.#.#####.###.###.#.#.#.###.#######.#.#.#.###.###.#######.#.###.#.#.#.#.#.###.#  
  #.#.#.#.#.#.#.....#.#.#...#.#.#.#.#...#...#.#.......#.#...#.#.....#.#.....#...#...#.#.#.........#.#...#.#...#.#.#.....#...#  
  ###.#.#.#.#######.#.#.#.###.#.#.#.#.#.###.#####.###.###.###.###.#####.###.###.#.###.#.#.#####.###.###.#.#.#.#.###########.#  
  #.............#...........#.....#...#.#...#.#.#...#...#.....#...#.#...#.....#...#.#.#...#...#.......#.#.#.#.#...#.........#  
  #####.#.#.#.#####.###############.#.#####.#.#.#.###.#######.###.#.#####.#######.#.#######.###.###.###.#.#####.###.###.###.#  
  #.....#.#.#...#.............#...#.#...#...#.......#.#.....#.#.#...#.#.....#.#.#.#...#.......#.#.#.#...#.#.#.#...#...#.#...#  
  ###.#.###.#####.#####.#########.#.#######.#.###.#.#####.#.#.#.###.#.###.#.#.#.#.#.###.###.#.###.###.#.###.#.#####.#.###.#.#  
  #...#.#.......#...#.....#.......#.#.#.#...#.#...#.#.....#...#.........#.#.#...#.........#.#...#.#...#.....#...#...#.#...#.#  
  ###.#####.#####.#######.#.###.#.###.#.#.###.#.#.#######.#######.#####.###.#.#.#.#####.#######.#.###.###.###.#######.#####.#  
  #.#.#.#.....#...#.......#.#...#.#.#.......#.#.#...#.#...#.#.#.#.#.....#.#...#.#.....#.#.#.........#.#.#.........#...#...#.#  
  #.###.###.###.#.#####.#.#####.###.#####.#######.###.###.#.#.#.#.###.#.#.#####.###.#####.###.#.###.###.#.#.###.#####.#.###.#  
  #...........#.#.#.....#.#.................#.#.#.....#.......#.#.#.#.#.#.......#.......#...#.#...#.#.#...#.#.....#.......#.#  
  #######.###.###.#.###.#####.#####.#.###.#.#.#.###.#####.###.#.#.#.#.#.###.#####.#####.#.###.###.###.#.#.#.###.###.#.#####.#  
  #...#.....#...#.#.#...#.....#.#...#.#...#.#.......#.......#.#.....#.#.#.....#.......#...#.#.#.....#...#.#...#.#...#.....#.#  
  ###.###.#####.#####.#.#####.#.#########.###.###.#.#####.#.###########.#.#.#####.#####.#.#.#.###########.#####.#.#.#.#.#.#.#  
  #.#.........#...#...#.....#.#...#.#.#.#...#...#.#...#.#.#.......#.....#.#...#.......#.#.#.#.#.....#.#.....#...#.#.#.#.#.#.#  
  #.#####.#####.#######.#########.#.#.#.#.#######.###.#.#.#############.#.#.#####.###.###.#.###.#####.###.###.###.#.#.#.#.###  
  #...........#.....#.#.#.................#.#.......#...#...#...#.....#.#.#.#.#.#.#.#.#.#.#...#...#.#.......#...#.#.#.#.#...#  
  #.###.#.###########.#.###.#.###.#.#.#.#.#.#.#####.#####.#.###.###.#.#.#.###.#.#.#.###.###.#####.#.###.#.#.#######.#.#######  
  #...#.#.......#.#...#.#.#.#.#.#.#.#.#.#.#.....#.....#...#...#.#.#.#.#.#.....#.......#.....#...#.#...#.#.#.....#...#.#.....#  
  #.#.###.#######.###.###.###.#.#########.###########.###.#####.#.#.#.#.#.#######.###.#.#####.###.#.#.#####.###.###.#####.###  
  #.#.#.#.......#.#.......#...#.......#.....#.#.#...#.#.#.#.....#...#...#.....#.#...#.#.............#.#.#.#.#.#...#.......#.#  
  #.###.#.###.###.#.###.#.#########.#.###.###.#.#.#.#.#.#.#.###.#.#######.#####.#.#####.#####.###.#####.#.###.#.#####.#.#.#.#  
  #...#.....#.#.#.#.#...#...#.#.#...#...#.#.......#.#.#.....#...#.....#.#...#...#.#.#...#...#.#.#.......#.#...#...#...#.#...#  
  #####.###.###.#.#######.#.#.#.#####.###.#######.#.#.#######.#####.#.#.#.#####.#.###.#.#.#####.#.#######.###.#######.###.###  
  #.#...#...#...........#.#...#...........#...#...#.....#.....#.#.#.#...#.....#...#...#...#.#.#.#.#.............#...#.#.#...#  
  #.#.#######.#.#.###.#.###.#.###########.#.#####.###########.#.#.#####.#.###.###.#.###.#.#.#.#.#####.###.#.#.###.###.#.#.###  
  #.......#...#.#.#.#.#.....#.#...#.........#.....#.......#...#.....#...#.#.#.#...#...#.#.#.#.#.......#.#.#.#.......#.#.....#  
  #.#######.#.#.#.#.###.#####.#.###########.#####.#.###.#####.#.#######.#.#.#####.###.#.###.#.#.###.###.#.#.###.#.#####.###.#  
  #...#.....#.#.#.#.....#...........#.#.#...#...#...#.#.....#.....#.....#...#.#.......#...........#.....#.#.#.#.#...#.....#.#  
  #.###.#.#########.#.#.#.#.#.###.#.#.#.#.###.#.#####.#.###.###.#####.#####.#.#.#.#.###.###.###.###.#########.#.###.#.#.#.#.#  
  #...#.#...#.......#.#.#.#.#.#...#...........#.#.........#.#.....#.....#.....#.#.#.#...#.....#...#...........#...#.#.#.#.#.#  
  #############################################.#.#####.#######.###.#####.###########.#######################################  
                                               B A     H       P   K     D           U                                         
                                               X A     Y       E   N     R           I                                         `
  .split('\n')
  .map(r => r.split(''));

const get = (x, y) => input[y] && input[y][x];
const isLetter = x => /\w/.test(x);
const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1}
];

const portals = [];
const nodes = [];
for (let y = 0; y < input.length; y++) {
  for (let x = 0; x < input[y].length; x++) {
    if (get(x, y) === '.') {
      const id = x + ',' + y;
      nodes.push({id, x, y, neighbors: []});

      for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        const dx = x + dir.x;
        const dy = y + dir.y;
        const a = get(dx, dy);
        const b = get(dx + dir.x, dy + dir.y);
        if (isLetter(a) && isLetter(b)) {
          portals.push({id, label: [a, b].sort().join('')});
        }
      }
    }
  }
}

nodes.forEach(({id, x, y, neighbors}) => {
  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    const dx = x + dir.x;
    const dy = y + dir.y;
    if (get(dx, dy) === '.') neighbors.push(dx + ',' + dy);
  }
  const portal = portals.find(p => p.id === id);
  if (portal) {
    neighbors.push(
      ...portals
        .filter(p => p.label === portal.label && p.id !== id)
        .map(p => p.id)
    );
  }
});

const start = portals.find(p => p.label === 'AA').id;
const end = portals.find(p => p.label === 'ZZ').id;

const q = [{dist: 0, id: start}];
for (let i = 0; i < q.length; i++) {
  const curr = nodes.find(n => n.id === q[i].id);
  for (let j = 0; j < curr.neighbors.length; j++) {
    const n = curr.neighbors[j];
    if (n === end) console.log('>>>>', q[i].dist + 1);
    if (!q.some(x => x.id === n)) q.push({dist: q[i].dist + 1, id: n});
  }
}

console.log(q);

// console.log(nodes);
// console.log(portals);