import {randEl} from './utils.js';

/** @type {(state: State) => State} */
export function getInitialState(state) {
  const {people, schedule} = state;

  /** @type {Record<string, string[]>} */
  const roleGroups = {};
  for (const name in people) {
    for (const role in people[name].roles) {
      (roleGroups[role] ||= []).push(name);
    }
  }

  return {
    ...state,
    schedule: schedule.map((row) => {
      /** @type {Record<string, Assignment[]>} */
      const assignments = {};

      for (const role in row.roles) {
        assignments[role] = row.roles[role].map((name) => ({
          name: name === '_' ? randEl(roleGroups[role]) : name,
          determined: name !== '_',
        }));
      }
      return {...row, assignments};
    }),
  };
}
