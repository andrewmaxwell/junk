// nodemon --ext ts,tsx --exec "tsx sundayScheduler/realmConverter"
import fs from 'fs';
import {formatDate} from './utils';

const go = async () => {
  const response = await fetch(
    'https://onrealm.org/chatham/ViewSchedule/GetSchedule',
  );

  const roleMapping = {
    'Music-Drummer': 'Drums',
    'Music-Bass Guitarist': 'Bass',
    'Music-Worship Leader': 'Guitar',
    'Music-Pianist': 'Piano',
  };

  const vocalsL = new Set(['Hannah Barrow', 'John Gobble', 'Peter Gobble']);

  const getRole = (origRole: string, personName: string) => {
    if (origRole === 'Music-Vocalist') {
      return vocalsL.has(personName) ? 'VocalsL' : 'VocalsH';
    }
    return roleMapping[origRole] ?? origRole;
  };

  const formatName = (str: string) => {
    const [first, last] = str.split(' ');
    return `${first} ${last[0]}`;
  };

  const data = (await response.json()) as {
    Meetings: Array<{
      StartDateString: string;
      Assignments: Array<{RoleName: string; IndividualName: string}>;
    }>;
  };

  const result = data.Meetings.map((m) => {
    const roles: Record<string, string[]> = {};
    for (const a of m.Assignments) {
      const roleName = getRole(a.RoleName, a.IndividualName);
      (roles[roleName] ??= []).push(a.IndividualName);
    }
    const roleString = Object.entries(roles)
      .map(
        ([role, people]) =>
          `${roleMapping[role] ?? role}: ${people.map(formatName).join(', ')}`,
      )
      .join('; ');

    return `${formatDate(new Date(m.StartDateString))}\t${roleString}; Nursery: _, _; 2-preK: _, _; K-2: _, _; Watchman: _`;
  }).join('\n');

  fs.writeFileSync('output.txt', result, 'utf-8');
};

go();
