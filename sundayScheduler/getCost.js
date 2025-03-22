import './types.js';

const conflictPenalty = 100;
const unavailablePenalty = 100;
const noAdultWomanPenalty = 100;
const frequencyMultiplier = 20;
const consecutiveWeekPenalty = 20;

/** @type {(state: State, log: (date: Date, amount: number, msg: string) => void) => void} */
const calcCost = ({people, schedule, roleInfo}, log) => {
  /** @type {Record<string, {prev: number, load: number}>} */
  const personRoleLoad = {};

  for (const {date, assignments, unavailable} of schedule) {
    /** @type {Record<string, string[]>} */
    const assignedLocations = {};
    for (const role in assignments) {
      for (const {name} of assignments[role]) {
        (assignedLocations[name] ??= []).push(roleInfo[role]?.location);
      }
    }

    // Check for conflicts each week
    for (const name in assignedLocations) {
      const count = assignedLocations[name].length;
      if (count > 1) {
        log(
          date,
          conflictPenalty * (count - 1),
          `${name} has conflict(s), assigned ${count} times`,
        );
      }
    }

    for (const role in assignments) {
      for (const {name} of assignments[role]) {
        // Unavailable
        if (unavailable.has(name)) {
          log(date, unavailablePenalty, `${name} is not available`);
        }

        // Weights
        const {weights, roles} = people[name];
        for (const weightName in weights) {
          if (!assignedLocations[weightName]) continue;
          const {weight, anywhere} = weights[weightName];
          if (anywhere) {
            log(date, -weight, `${name} + ${weightName} (anywhere)`);
          } else {
            // only bonus if the two people are in the same place
            const {location} = roleInfo[role];
            if (assignedLocations[weightName].some((loc) => loc === location)) {
              log(date, -weight, `${name} + ${weightName} (${location})`);
            }
          }
        }

        // frequency
        const key = name + '/' + role;
        if (!personRoleLoad[key]) {
          personRoleLoad[key] = {prev: date.getTime(), load: 1};
        } else {
          const r = personRoleLoad[key];
          const numWeeks = Math.round(
            (date.getTime() - r.prev) / (7 * 24 * 3600 * 1000),
          );
          r.load = Math.max(0, r.load - numWeeks * roles[role]) + 1;
          r.prev = date.getTime();
          if (r.load > 1) {
            log(
              date,
              frequencyMultiplier * (r.load - 1) +
                consecutiveWeekPenalty * (numWeeks === 1 ? 1 : 0),
              `${name} is doing ${role} too often`,
            );
          }
        }
      }
    }

    // make sure there is at least one adult woman in each childcare role
    for (const role in roleInfo) {
      if (
        roleInfo[role].isChildren &&
        assignments[role] &&
        !assignments[role].some((p) => {
          const {over21, isFemale} = people[p.name];
          return over21 && isFemale;
        })
      ) {
        log(date, noAdultWomanPenalty, `${role} does not have an adult woman`);
      }
    }
  }
};

/** @type {(state: State) => number} */
export const getCost = (state) => {
  let cost = 0;
  calcCost(state, (_, amount) => {
    cost += amount;
  });
  return cost;
};

/** @type {(state: State) => string} */
export const getDetails = (state) => {
  const details = [];
  calcCost(state, (date, amount, msg) =>
    details.push(
      `${date.toISOString().slice(0, 10)}: ${msg} = ${Math.round(Math.abs(amount) * 10) / 10} ${amount > 0 ? 'point penalty' : 'point bonus'}`,
    ),
  );
  return details.join('\n');
};
