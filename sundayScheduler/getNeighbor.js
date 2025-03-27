import {randEl, randIndex} from './utils.js';

/** @type {(state: State, roleGroups: Record<string, string[]>) => State | undefined} */
function tryGetNeighbor({schedule, ...rest}, roleGroups) {
  const weekIndex = randIndex(schedule);
  const role = randEl(Object.keys(schedule[weekIndex].assignments));
  const people = schedule[weekIndex].assignments[role];
  const personIndex = randIndex(people);
  const person = people[personIndex];
  const newPersonName = randEl(roleGroups[role]);

  if (
    !person ||
    !newPersonName ||
    person.determined ||
    person.name === newPersonName
  )
    return undefined;

  const newSchedule = schedule.slice();
  const newRow = {...newSchedule[weekIndex]};
  const newAssignments = {...newRow.assignments};
  const newRolePeople = newAssignments[role].slice();
  newRolePeople[personIndex] = {name: newPersonName, determined: false};
  newAssignments[role] = newRolePeople;
  newRow.assignments = newAssignments;
  newSchedule[weekIndex] = newRow;
  return {...rest, schedule: newSchedule};
}

/** @type {(state: State) => (state: State) => State} */
export const getGetNeighbor = (state) => {
  /** @type {Record<string, string[]>} */
  const roleGroups = {};
  for (const name in state.people) {
    for (const role in state.people[name].roles) {
      (roleGroups[role] ||= []).push(name);
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
