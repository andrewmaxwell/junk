/** @type {(people: Person[], roleSchedule: RoleSchedule[]) => string[]} */
export function validateData(people, roleSchedule) {
  const errors = [];

  // Collect all person names
  const allPeopleNames = new Set(people.map((p) => p.name));

  // Collect all roles from people
  const peopleRoleSet = new Set();
  for (const p of people) {
    for (const r of Object.keys(p.roles)) {
      peopleRoleSet.add(r);
    }
  }

  // Collect all roles from the schedule
  const scheduleRoleSet = new Set();
  for (const sched of roleSchedule) {
    for (const r of Object.keys(sched.roles)) {
      scheduleRoleSet.add(r);
    }
  }

  // === Validate People ===
  for (const p of people) {
    // 1. Name checks
    if (!p.name || p.name.includes(',') || p.name.includes(';')) {
      errors.push(
        `Invalid person name "${p.name}". Names must not be empty, contain commas, or semicolons.`,
      );
    }

    // 2. Role keys must exist in roleSchedule[].roles
    for (const roleKey of Object.keys(p.roles)) {
      if (!scheduleRoleSet.has(roleKey)) {
        errors.push(
          `Person "${p.name}" has role "${roleKey}" which does not appear in any roleSchedule[].roles`,
        );
      }
      // 3. Role values must be 0–1 inclusive
      const roleVal = p.roles[roleKey];
      if (isNaN(roleVal) || roleVal < 0 || roleVal > 1) {
        errors.push(
          `Invalid role value for ${p.name}.${roleKey}: ${roleVal} (should be between 0 and 1)`,
        );
      }
    }

    // 4. Weight keys should match names of existing people
    for (const weightKey of Object.keys(p.weights)) {
      if (!allPeopleNames.has(weightKey)) {
        errors.push(
          `Invalid weight key "${weightKey}" for person "${p.name}". It must be another existing person's name.`,
        );
      }
      if (isNaN(p.weights[weightKey])) {
        errors.push(
          `Invalid weight "${p.weights[weightKey]}" for person "${p.name}". It must be a number.`,
        );
      }
    }
  }

  // === Validate RoleSchedule ===
  for (const sched of roleSchedule) {
    // 1. Date between 2020 and 2030
    if (
      !(sched.date instanceof Date) ||
      isNaN(sched.date.getTime()) ||
      sched.date.getFullYear() < 2020 ||
      sched.date.getFullYear() > 2030
    ) {
      errors.push(
        `Invalid date "${sched.date}". It must be a valid Date between 2020 and 2030.`,
      );
    }

    // 2. Role keys in schedule must appear in people[].roles
    for (const roleKey of Object.keys(sched.roles)) {
      if (!peopleRoleSet.has(roleKey)) {
        errors.push(
          `Schedule on ${sched.date} has role "${roleKey}" which is not in people[].roles`,
        );
      }

      // 3. Role value arrays must contain valid person names or underscores
      for (const assignedName of sched.roles[roleKey]) {
        if (assignedName !== '_' && !allPeopleNames.has(assignedName)) {
          errors.push(
            `On ${sched.date}, role "${roleKey}" has invalid person "${assignedName}". Must be an existing person name or "_"`,
          );
        }
      }
    }

    // 4. Unavailable names must be valid names of people (can be empty set)
    for (const name of sched.unavailable) {
      if (!allPeopleNames.has(name)) {
        errors.push(
          `On ${sched.date}, "${name}" is listed as unavailable but is not a known person name.`,
        );
      }
    }
  }

  return errors;
}
