interface Participant {
  name: string;
  isAdult: boolean;
  gender: 'M' | 'F';
  energy: number;
  boldness: number;
  responsibility: number;
  friends: string[];
  avoid: string[];
}

interface GroupStats {
  size: number;
  adultCount: number;
  maxResponsibility: number;
  avgEnergy: number;
  energyStdDev: number;
  avgBoldness: number;
  friendConnections: number; // 1-way matches
  orphans: number; // People who wanted friends but got none
  avoidCollisions: number;
  maleCount: number;
  femaleCount: number;
}

// ==========================================
// 1. CONFIGURATION
// ==========================================

const CONFIG = {
  // Annealing
  ITERATIONS: 1_000_000, // Total optimizer steps. More = better results but slower.
  START_TEMP: 10_000, // Initial "temperature". Higher = more random moves at start.
  COOLING_RATE: 0.9999, // How fast temp drops. Higher (e.g. 0.9999) = slower cooling = better quality.

  // Constraints
  MIN_SIZE: 4, // Minimum people per group
  MAX_SIZE: 5, // Maximum people per group
  TARGET_SIZE: 4.5, // Ideal size (halfway between 4 and 5)
  MIN_RESPONSIBILITY: 8, // Minimum responsibility score required for at least one member
  MIN_STUDENTS: 3, // Minimum number of students per group
  MAX_ADULTS: 2, // Maximum number of adults per group
  MIN_BOLDNESS: 4, // Minimum average boldness for the group
};

const WEIGHTS = {
  // Hard Constraints (The "Must Haves")
  SIZE_VIOLATION: 50_000,
  UNSAFE_GROUP: 100_000,
  AVOID_COLLISION: 100_000,
  MIN_STUDENTS: 50_000,

  // Soft Constraints (The "Nice to Haves")
  ENERGY_MISMATCH: 1000, // Keep walking pace similar
  SOCIAL_VACUUM: 1000, // Avoid boring groups
  TOO_MANY_ADULTS: 2000, // Don't waste chaperones
  LONE_GENDER: 2500, // Avoid isolating one boy/girl

  // Social Scoring
  FRIEND_ONE_WAY_BONUS: 300, // Happiness per friend link
  ORPHAN_PENALTY: 1000, // sadness if no friends matched
};

function getStandardDeviation(array: number[]): number {
  if (array.length === 0) return 0;
  const mean = array.reduce((a, b) => a + b, 0) / array.length;
  return Math.sqrt(
    array.map((x) => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) /
      array.length,
  );
}

function analyzeGroup(
  group: string[],
  participants: Map<string, Participant>,
): GroupStats {
  if (group.length === 0)
    return {
      size: 0,
      adultCount: 0,
      maxResponsibility: 0,
      avgEnergy: 0,
      energyStdDev: 0,
      avgBoldness: 0,
      friendConnections: 0,
      orphans: 0,
      avoidCollisions: 0,
      maleCount: 0,
      femaleCount: 0,
    };

  const members = group.map((name) => participants.get(name)!);
  const energies = members.map((p) => p.energy);
  const boldnesses = members.map((p) => p.boldness);
  const responsibilities = members.map((p) => p.responsibility);

  let friendConnections = 0;
  let avoidCollisions = 0;
  let orphans = 0;

  // Social Graph Analysis
  for (const p1 of members) {
    let gotAtLeastOneFriend = false;

    // Check who p1 wanted
    p1.friends.forEach((friendName) => {
      // If the friend is in this group...
      if (group.includes(friendName)) {
        gotAtLeastOneFriend = true;
        friendConnections++; // +1 for every wish granted
      }
    });

    // Check avoids
    p1.avoid.forEach((enemyName) => {
      if (group.includes(enemyName)) avoidCollisions++;
    });

    // Did they list friends but get none?
    if (p1.friends.length > 0 && !gotAtLeastOneFriend) {
      orphans++;
    }
  }

  return {
    size: group.length,
    adultCount: members.filter((p) => p.isAdult).length,
    maxResponsibility: Math.max(...responsibilities),
    avgEnergy: energies.reduce((a, b) => a + b, 0) / group.length,
    energyStdDev: getStandardDeviation(energies),
    avgBoldness: boldnesses.reduce((a, b) => a + b, 0) / group.length,
    friendConnections,
    orphans,
    avoidCollisions,
    maleCount: members.filter((p) => p.gender === 'M').length,
    femaleCount: members.filter((p) => p.gender === 'F').length,
  };
}

function calculateTotalCost(
  grouping: string[][],
  participants: Map<string, Participant>,
  verbose = false,
): {totalCost: number; messages: string[]} {
  let totalCost = 0;
  const messages: string[] = [];

  // Helper to DRY up constraints
  const check = (condition: boolean, name: string, penalty: number) => {
    if (condition) {
      totalCost += penalty;
      if (verbose && Math.abs(penalty) > 0) {
        messages.push(`${name.padEnd(40)} | ${Math.round(-penalty)} pts`);
      }
    }
  };

  grouping.forEach((group, i) => {
    const stats = analyzeGroup(group, participants);
    const p = verbose ? `[Group ${i + 1}] ` : '';

    // --- Hard Constraints ---
    check(
      stats.size < CONFIG.MIN_SIZE || stats.size > CONFIG.MAX_SIZE,
      `${p}Size Violation (${stats.size})`,
      WEIGHTS.SIZE_VIOLATION *
        Math.pow(Math.abs(stats.size - CONFIG.TARGET_SIZE), 2),
    );

    check(
      stats.maxResponsibility < CONFIG.MIN_RESPONSIBILITY,
      `${p}Unsafe (Max Resp: ${stats.maxResponsibility})`,
      WEIGHTS.UNSAFE_GROUP,
    );

    check(
      stats.avoidCollisions > 0,
      `${p}Avoid Collision`,
      WEIGHTS.AVOID_COLLISION * stats.avoidCollisions,
    );

    check(
      stats.size - stats.adultCount < CONFIG.MIN_STUDENTS,
      `${p}Too few students`,
      WEIGHTS.MIN_STUDENTS,
    );

    // --- Soft Constraints ---
    check(
      stats.adultCount > CONFIG.MAX_ADULTS,
      `${p}Too many adults`,
      WEIGHTS.TOO_MANY_ADULTS * (stats.adultCount - CONFIG.MAX_ADULTS),
    );

    check(
      true,
      `${p}Energy Mismatch`,
      stats.energyStdDev * WEIGHTS.ENERGY_MISMATCH,
    );

    check(
      stats.avgBoldness < CONFIG.MIN_BOLDNESS,
      `${p}Boring Group (Avg Boldness < 4)`,
      (CONFIG.MIN_BOLDNESS - stats.avgBoldness) * WEIGHTS.SOCIAL_VACUUM,
    );

    check(
      stats.maleCount === 1 || stats.femaleCount === 1,
      `${p}Lone Wolf Gender`,
      WEIGHTS.LONE_GENDER,
    );

    // --- Social Scores ---
    check(
      stats.orphans > 0,
      `${p}Orphans (Wanted friends, got 0)`,
      stats.orphans * WEIGHTS.ORPHAN_PENALTY,
    );

    check(
      stats.friendConnections > 0,
      `${p}Friend Bonus`,
      -stats.friendConnections * WEIGHTS.FRIEND_ONE_WAY_BONUS,
    );
  });

  return {totalCost, messages};
}

function simulatedAnnealing(allParticipants: Participant[]): string[][] {
  const participantMap = new Map(allParticipants.map((p) => [p.name, p]));

  // 1. Initial State: Round Robin
  const shuffled = [...allParticipants].sort(() => Math.random() - 0.5);
  const numGroups = Math.max(
    1,
    Math.round(shuffled.length / CONFIG.TARGET_SIZE),
  );
  let currentGrouping: string[][] = Array.from({length: numGroups}, () => []);

  shuffled.forEach((p, i) => currentGrouping[i % numGroups].push(p.name));

  let currentCost = calculateTotalCost(currentGrouping, participantMap, false);
  let bestGrouping = currentGrouping.map((g) => [...g]);
  let bestCost = currentCost;

  // 2. Annealing Parameters
  let temperature = CONFIG.START_TEMP;

  for (let i = 0; i < CONFIG.ITERATIONS; i++) {
    const newGrouping = currentGrouping.map((g) => [...g]); // Fast deep copy for 2D primitives

    // Pick two random groups
    const g1 = Math.floor(Math.random() * newGrouping.length);
    let g2 = Math.floor(Math.random() * newGrouping.length);
    while (g1 === g2) g2 = Math.floor(Math.random() * newGrouping.length);

    const group1 = newGrouping[g1];
    const group2 = newGrouping[g2];

    // DECIDE: SWAP vs MOVE?
    // Move is only allowed if donor has enough people (min size - 1 buffer)
    const canMove = group1.length > 3; // Keep at least 3, let annealing fix to 4
    const doSwap = !canMove || Math.random() < 0.5;

    if (doSwap && group1.length > 0 && group2.length > 0) {
      // SWAP
      const p1Idx = Math.floor(Math.random() * group1.length);
      const p2Idx = Math.floor(Math.random() * group2.length);
      [group1[p1Idx], group2[p2Idx]] = [group2[p2Idx], group1[p1Idx]];
    } else if (canMove) {
      // MOVE
      const p1Idx = Math.floor(Math.random() * group1.length);
      group2.push(group1.splice(p1Idx, 1)[0]);
    }

    const newCost = calculateTotalCost(newGrouping, participantMap, false);

    // Acceptance Probability
    if (
      newCost.totalCost < currentCost.totalCost ||
      Math.random() <
        Math.exp((currentCost.totalCost - newCost.totalCost) / temperature)
    ) {
      currentGrouping = newGrouping;
      currentCost = newCost;

      if (currentCost.totalCost < bestCost.totalCost) {
        bestGrouping = currentGrouping.map((g) => [...g]);
        bestCost = currentCost;
      }
    }
    temperature *= CONFIG.COOLING_RATE;
  }
  return bestGrouping;
}

const participants: Participant[] = `
Andrew    | y | M | 5  | 6  | 10 |                     |
Josh      | y | M | 6  | 3  | 10 |                     |
Manny     | y | M | 10 | 9  | 10 |                     |
Sydney    | y | F | 8  | 10 | 10 |                     |
Krys      | y | F | 4  | 3  | 10 |                     |
Jadon     | n | M | 10 | 6  | 9  | Levi,Brady          |
Levi      | n | M | 8  | 9  | 8  | Jadon,Andrew,Brady  |
Anneliese | n | F | 5  | 2  | 6  |                     | Calvin
Brady     | n | M | 9  | 5  | 6  | Noelle,Jadon,Levi   | Wesley
Noelle    | n | F | 5  | 5  | 5  | Brady,Bella         | Nick
Nick      | n | M | 6  | 1  | 5  |                     | Noelle
VJ        | n | F | 5  | 10 | 5  | Andrew              |
Sam       | n | M | 8  | 5  | 4  | Wesley              |
Bella     | n | F | 5  | 3  | 3  | Noelle,Andrew       |
Aisley    | n | F | 5  | 7  | 3  | Andrew              | Krys
Wesley    | n | M | 10 | 7  | 2  | Sam,Jojo            | Brady
Jojo      | n | M | 9  | 6  | 2  | Wesley              |
Calvin    | n | M | 9  | 10 | 2  |                     | Anneliese
`
  .trim()
  .split('\n')
  .map((line) => {
    const [name, isAdult, gender, energy, boldness, resp, friends, avoid] = line
      .split('|')
      .map((s) => s.trim());
    return {
      name,
      isAdult: isAdult === 'y',
      gender: gender as 'M' | 'F',
      energy: Number(energy),
      boldness: Number(boldness),
      responsibility: Number(resp),
      friends: friends
        ? friends
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s)
        : [],
      avoid: avoid
        ? avoid
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s)
        : [],
    };
  });

const result = simulatedAnnealing(participants);
const pMap = new Map(participants.map((p) => [p.name, p]));

// VISUALIZATION
console.log(
  `\n\x1b[1m=== OPTIMIZED GROUPS (Total Cost: ${Math.round(calculateTotalCost(result, pMap).totalCost)}) ===\x1b[0m\n`,
);
result.forEach((group, i) => {
  const stats = analyzeGroup(group, pMap);
  const members = group
    .sort((a, b) => pMap.get(b)!.responsibility - pMap.get(a)!.responsibility)
    .map((n) => pMap.get(n)!.name)
    .join(', ');

  console.log(
    `\x1b[36mGROUP ${i + 1}\x1b[0m [Size: ${group.length}, Adults: ${stats.adultCount}, AvgEnergy: ${stats.avgEnergy.toFixed(1)}]`,
  );
  console.log(`  Members: ${members}`);
  console.log(
    `  Stats:   \x1b[33m⚡${stats.energyStdDev.toFixed(2)} Var\x1b[0m | \x1b[32m❤️ ${stats.friendConnections} Friend Links\x1b[0m | 🛡️ MaxResp: ${stats.maxResponsibility}`,
  );
  if (stats.orphans > 0)
    console.log(
      `  \x1b[31mWARNING: ${stats.orphans} Orphaned Student(s)\x1b[0m`,
    );
  console.log('');
});

// Print detailed logs for debugging
console.log(calculateTotalCost(result, pMap, true).messages.join('\n'));
