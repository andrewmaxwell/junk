const conflictPenalty = 100;
const unavailablePenalty = 100;
const frequencyMultiplier = 20;

/** @type {(state: StateRow[], debug?: boolean) => {cost: number, details: string}} */
export const getCost = (state, debug) => {
  let cost = 0;

  /** @type {Array<string>} */
  const details = [];

  /** @type {Record<string, {prev: number, load: number}>} */
  const personRoleLoad = {};

  /** @type {(date: Date, amount: number, msg: string) => void} */
  const log = (date, amount, msg) => {
    cost += amount;
    if (debug) {
      details.push(
        `${date.toISOString().slice(0, 10)}: ${msg} = ${Math.round(Math.abs(amount) * 10) / 10} ${amount > 0 ? 'point penalty' : 'point bonus'}`,
      );
    }
  };

  for (const {date, assignments, unavailable} of state) {
    const assignedCounts = {};
    for (const role in assignments) {
      for (const {name} of assignments[role]) {
        assignedCounts[name] = (assignedCounts[name] || 0) + 1;
      }
    }

    // Check for conflicts each week
    for (const name in assignedCounts) {
      const count = assignedCounts[name];
      if (count === 1) continue;
      log(
        date,
        conflictPenalty * (count - 1),
        `${name} has conflict(s), assigned ${count} times`,
      );
    }

    for (const role in assignments) {
      for (const {name, weights, roles} of assignments[role]) {
        // Unavailable
        if (unavailable.has(name)) {
          log(date, unavailablePenalty, `${name} is not available`);
        }

        // Weights
        for (const weightName in weights) {
          if (assignedCounts[weightName] > 0) {
            log(date, -weights[weightName], `${name} + ${weightName}`);
          }
        }

        // frequency
        const key = name + '/' + role;
        if (!personRoleLoad[key]) {
          personRoleLoad[key] = {prev: date.getTime(), load: 1};
        } else {
          const r = personRoleLoad[key];
          const numWeeks = (date.getTime() - r.prev) / (7 * 24 * 3600 * 1000);
          r.load += 1 - numWeeks * roles[role];
          r.prev = date.getTime();
          if (r.load > 1) {
            log(
              date,
              frequencyMultiplier * (r.load - 1),
              `${name} is doing ${role} too often`,
            );
          }
        }
      }
    }
  }
  return {cost, details: details.join('\n')};
};
