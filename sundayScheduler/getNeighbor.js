import {randEl, randIndex} from './utils.js';

/** @type {(state: StateRow[], roleGroups: Record<string, Person[]>) => StateRow[] | undefined} */
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
}

/** @type {(people: Person[]) => (state: StateRow[]) => StateRow[]} */
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
