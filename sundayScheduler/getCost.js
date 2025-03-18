const conflictPenalty = 100;
const unavailablePenalty = 100;
const frequencyMultiplier = 20;

/** @type {(state: StateRow[], debug?: boolean) => {cost: number, details: string}} */
export const getCost = (state, debug) => {
  let cost = 0;
  const details = [];

  /**
   * @param {Date} date
   * @param {number} amount
   * @param {string} msg
   */
  const log = (date, amount, msg) => {
    cost += amount;
    if (debug) {
      details.push(
        `${date.toISOString().slice(0, 10)}: ${msg} = ${Math.round(Math.abs(amount) * 10) / 10} ${amount > 0 ? 'point penalty' : 'point bonus'}`,
      );
    }
  };

  /** @type {Record<string, {prev: Date, load: number}>} */
  const personRoleLoad = {};

  for (const {date, assignments, unavailable} of state) {
    const seen = {};

    // Check for conflicts each week
    for (const {name} of Object.values(assignments).flat()) {
      if (seen[name]) {
        log(date, conflictPenalty, `${name} has a conflict`);
      } else {
        seen[name] = true;
      }
      if (unavailable.has(name)) {
        log(date, unavailablePenalty, `${name} is not available`);
      }
    }

    for (const role in assignments) {
      for (const {name, weights, roles} of assignments[role]) {
        // Weights
        for (const weightName in weights) {
          if (seen[weightName]) {
            log(date, -weights[weightName], `${name} + ${weightName}`);
          }
        }

        // frequency
        const key = name + '/' + role;
        if (!personRoleLoad[key]) personRoleLoad[key] = {prev: date, load: 1};
        else {
          const numWeeks =
            (date.getTime() - personRoleLoad[key].prev.getTime()) /
            (7 * 24 * 3600 * 1000);
          personRoleLoad[key].load += 1 - numWeeks * roles[role];
          personRoleLoad[key].prev = date;
          if (personRoleLoad[key].load > 1) {
            log(
              date,
              frequencyMultiplier * (personRoleLoad[key].load - 1),
              `${name} is doing ${role} too often`,
            );
          }
        }
      }
    }
  }
  return {cost, details: details.join('\n')};
};
