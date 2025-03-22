/** @type {(date: Date) => string} */
const formatDate = (date) =>
  [date.getMonth() + 1, date.getDate(), date.getFullYear()].join('/');

/** @type {(state: State) => string[]} */
export function validateData({people, schedule, roleInfo}) {
  const errors = [];

  // Collect all roles from people
  const peopleRoleSet = new Set();
  for (const name in people) {
    for (const r in people[name].roles) {
      peopleRoleSet.add(r);
    }
  }

  // Collect all roles from the schedule
  const scheduleRoleSet = new Set();
  for (const sched of schedule) {
    for (const r of Object.keys(sched.roles)) {
      scheduleRoleSet.add(r);
    }
  }

  const roleInfoRoleSet = new Set(Object.keys(roleInfo));

  // === Validate People ===
  for (const name in people) {
    // 1. Name checks
    if (!name || name.includes(',') || name.includes(';')) {
      errors.push(
        `Invalid person name "${name}". Names must not be empty, contain commas, or semicolons.`,
      );
    }

    const {roles, weights} = people[name];
    // 2. Role keys must exist in schedule roles
    for (const roleKey in roles) {
      if (!scheduleRoleSet.has(roleKey)) {
        errors.push(
          `Person "${name}" has role "${roleKey}" which does not appear in any schedule roles`,
        );
      }
      if (!roleInfoRoleSet.has(roleKey)) {
        errors.push(
          `Person "${name}" has role "${roleKey}" which does not appear in any roleInfo roles`,
        );
      }
      // 3. Role values must be 0–1 inclusive
      const roleVal = roles[roleKey];
      if (isNaN(roleVal) || roleVal < 0 || roleVal > 1) {
        errors.push(
          `Invalid role value for ${name}.${roleKey}: ${roleVal} (should be between 0 and 1)`,
        );
      }
    }

    // 4. Weight keys should match names of existing people
    for (const weightKey of Object.keys(weights)) {
      if (!people[weightKey]) {
        errors.push(
          `Invalid weight key "${weightKey}" for person "${name}". It must be another existing person's name.`,
        );
      }
      const {weight} = weights[weightKey];
      if (isNaN(weight)) {
        errors.push(
          `Invalid weight "${weight}" for person "${name}". It must be a number.`,
        );
      }
    }
  }

  // === Validate RoleSchedule ===
  for (const sched of schedule) {
    // 1. Date between 2020 and 2030
    if (
      !(sched.date instanceof Date) ||
      isNaN(sched.date.getTime()) ||
      sched.date.getFullYear() < 2020 ||
      sched.date.getFullYear() > 2030
    ) {
      errors.push(
        `Invalid date "${formatDate(sched.date)}". It must be a valid Date between 2020 and 2030.`,
      );
    }

    // 2. Role keys in schedule must appear in people roles
    for (const roleKey of Object.keys(sched.roles)) {
      if (!peopleRoleSet.has(roleKey)) {
        errors.push(
          `Schedule on ${formatDate(sched.date)} has role "${roleKey}" which is not in people roles`,
        );
      }
      if (!roleInfoRoleSet.has(roleKey)) {
        errors.push(
          `Schedule on ${formatDate(sched.date)} has role "${roleKey}" which is not in roleInfo roles`,
        );
      }

      // 3. Role value arrays must contain valid person names or underscores
      for (const assignedName of sched.roles[roleKey]) {
        if (assignedName !== '_' && !people[assignedName]) {
          errors.push(
            `On ${formatDate(sched.date)}, role "${roleKey}" has invalid person "${assignedName}". Must be an existing person name or "_"`,
          );
        }
      }
    }

    // 4. Unavailable names must be valid names of people (can be empty set)
    for (const name of sched.unavailable) {
      if (!people[name]) {
        errors.push(
          `On ${formatDate(sched.date)}, "${name}" is listed as unavailable but is not a known person name.`,
        );
      }
    }
  }

  return errors;
}
