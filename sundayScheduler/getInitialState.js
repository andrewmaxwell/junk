import {randEl} from './utils.js';

/** @type {(people: Person[], roleSchedule: RoleSchedule[]) => StateRow[]} */
export function getInitialState(people, roleSchedule) {
  /** @type {Record<string, Person[]>} */
  const roleGroups = {};

  /** @type {Record<string, Person>} */
  const peopleIndex = {};

  for (const person of people) {
    peopleIndex[person.name] = person;
    for (const role in person.roles) {
      (roleGroups[role] ||= []).push(person);
    }
  }

  return roleSchedule.map((row) => {
    /** @type {Record<string, Person[]>} */
    const assignments = {};

    for (const role in row.roles) {
      assignments[role] = row.roles[role].map((name) =>
        name === '_'
          ? randEl(roleGroups[role])
          : {...peopleIndex[name], determined: true},
      );
    }
    return {...row, assignments};
  });
}
