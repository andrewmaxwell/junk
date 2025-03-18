import {randEl, randIndex} from './utils.js';

/**
 * Attempts to produce a neighbor state by swapping two people's roles in two different weeks.
 * Might return `undefined` if it fails (e.g. picks the same person in both).
 *
 * @param {StateRow[]} state
 * @param {Record<string, Person[]>} roleGroups
 * @returns {StateRow[] | undefined}
 */
function tryGetNeighbor(state, roleGroups) {
  const weekIndex = randIndex(state);
  const role = randEl(Object.keys(state[weekIndex].assignments));
  const people = state[weekIndex].assignments[role];
  const personIndex = randIndex(people);
  const person = people[personIndex];
  const newPerson = randEl(roleGroups[role]);

  if (
    !person ||
    !newPerson ||
    person.determined ||
    person.name === newPerson.name
  )
    return undefined;

  const newState = [...state];
  newState[weekIndex] = {
    ...newState[weekIndex],
    assignments: {...newState[weekIndex].assignments, [role]: [...people]},
  };
  newState[weekIndex].assignments[role][personIndex] = newPerson;
  return newState;

  // // Pick a random role from all roles across all weeks
  // const allRoles = state.flatMap((s) => Object.keys(s.roles));
  // const role = randEl(allRoles);

  // // Pick two different weeks
  // const weekIndex1 = randIndex(state);
  // const weekIndex2 = randIndex(state);
  // if (weekIndex1 === weekIndex2) return undefined;

  // const people1 = state[weekIndex1].assignments[role];
  // const people2 = state[weekIndex2].assignments[role];
  // if (!people1?.length || !people2?.length) return undefined;

  // const personIndex1 = randIndex(people1);
  // const personIndex2 = randIndex(people2);

  // if (people1[personIndex1].name === people2[personIndex2].name) {
  //   return undefined;
  // }

  // // Create a shallow copy of the state so we don't mutate in place
  // const newState = [...state];
  // newState[weekIndex1] = {
  //   ...newState[weekIndex1],
  //   assignments: {
  //     ...newState[weekIndex1].assignments,
  //     [role]: [...people1],
  //   },
  // };
  // newState[weekIndex2] = {
  //   ...newState[weekIndex2],
  //   assignments: {
  //     ...newState[weekIndex2].assignments,
  //     [role]: [...people2],
  //   },
  // };

  // // Swap the two selected people
  // const temp = newState[weekIndex1].assignments[role][personIndex1];
  // newState[weekIndex1].assignments[role][personIndex1] =
  //   newState[weekIndex2].assignments[role][personIndex2];
  // newState[weekIndex2].assignments[role][personIndex2] = temp;

  // return newState;
}

/**
 * Repeats attempts to find a neighbor until successful, up to 1000 tries.
 *
 * @param {Person[]} people
 * @returns {(state: StateRow[]) => StateRow[]}
 */
export const getGetNeighbor = (people) => {
  /** @type {Record<string, Person[]>} */
  const roleGroups = {};
  for (const person of people) {
    for (const role in person.roles) {
      (roleGroups[role] ||= []).push(person);
    }
  }

  return (state) => {
    for (let i = 0; i < 1000; i++) {
      const candidate = tryGetNeighbor(state, roleGroups);
      if (candidate) return candidate;
    }
    throw new Error(`Unable to find a suitable neighbor after many tries.`);
  };
};
