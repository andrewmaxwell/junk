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
const nodeIndex = {};
for (let y = 0; y < input.length; y++) {
  for (let x = 0; x < input[y].length; x++) {
    if (get(x, y) === '.') {
      const id = x + ',' + y;
      const node = {id, x, y, neighbors: []};
      nodes.push(node);
      nodeIndex[id] = node;

      for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        const dx = x + dir.x;
        const dy = y + dir.y;
        const a = get(dx, dy);
        const b = get(dx + dir.x, dy + dir.y);
        const c = get(dx + dir.x * 2, dy + dir.y * 2);
        if (isLetter(a) && isLetter(b)) {
          portals.push({
            id,
            label: dir.x < 0 || dir.y < 0 ? b + a : a + b,
            deep: c ? -1 : 1
          });
        }
      }
    }
  }
}

nodes.forEach(({id, x, y, neighbors}) => {
  dirs.forEach(dir => {
    const dx = x + dir.x;
    const dy = y + dir.y;
    if (get(dx, dy) === '.') neighbors.push({id: dx + ',' + dy, deep: 0});
  });
  const portal = portals.find(p => p.id === id);
  if (portal) {
    neighbors.push(
      ...portals.filter(p => p.label === portal.label && p.id !== id)
    );
  }
});

const start = portals.find(p => p.label === 'AA').id;
const end = portals.find(p => p.label === 'ZZ').id;

const go = () => {
  const q = [{dist: 0, id: start, depth: 0}];
  const seen = {[start + ',0']: true};
  for (let i = 0; i < q.length; i++) {
    const curr = nodeIndex[q[i].id];
    for (let j = 0; j < curr.neighbors.length; j++) {
      const n = curr.neighbors[j];
      if (!q[i].depth && n.id === end) {
        console.log(q[i].dist + 1);
        const path = [];
        let c = q[i];
        while (c.prev) {
          path.push(c);
          c = c.prev;
        }
        path.push(c);
        return path.reverse();
        // return q[i].dist + 1;
      }

      const nextDepth = q[i].depth + n.deep;
      const nextId = n.id + ',' + nextDepth;
      if (nextDepth >= 0 && !seen[nextId]) {
        q.push({
          dist: q[i].dist + 1,
          id: n.id,
          depth: nextDepth,
          prev: q[i]
        });
        seen[nextId] = true;
      }
    }
  }
};

const path = go();
let frame = 0;
const loop = () => {
  if (path[frame])
    window.pre.innerHTML =
      input
        .map((r, y) =>
          r.map((v, x) => (path[frame].id === x + ',' + y ? 'O' : v)).join('')
        )
        .join('\n') +
      `\n\n` +
      JSON.stringify({...path[frame], prev: undefined});
  frame++;
  setTimeout(loop, 50);
  // requestAnimationFrame(loop);
};
loop();

console.log(go());
// console.log(path);
// console.dir(nodes);
// console.log(JSON.stringify(nodes, null, 2));
// console.log(portals);
