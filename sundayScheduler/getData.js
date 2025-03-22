// @ts-expect-error import the thing
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
import './types.js';

const spreadsheetUrl =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQA9hjBB26_Je8_Pa9na96LgKLyYErm6kZT-CWrU_MXS53-D2-kDSsMOUva_-kwyOgpOlH-GsjENYot/pub?output=xlsx';

/** @type {<T>(str: string, parseFunc: (val: string) => T) => Record<string, T>} */
const toObject = (str, parseFunc) =>
  Object.fromEntries(
    str
      .split(';')
      .filter((w) => w.trim())
      .map((r) => {
        const [k, val] = r.split(':').map((p) => p.trim());
        return [k, parseFunc(val)];
      }),
  );

/** @type {() => Promise<State>} */
export async function getData() {
  const response = await fetch(spreadsheetUrl);
  const {People, Schedule, Roles} = XLSX.read(await response.arrayBuffer(), {
    cellDates: true,
  }).Sheets;

  return {
    roleInfo: Object.fromEntries(
      XLSX.utils.sheet_to_json(Roles).map((r) => [
        r.Role,
        {
          location: r.Location.trim(),
          isChildren: r['Childrens Ministry'].trim() === 'Y',
        },
      ]),
    ),
    people: Object.fromEntries(
      XLSX.utils
        .sheet_to_json(People)
        .map(
          ({
            Name = '',
            Roles = '',
            Weights = '',
            Gender = '',
            ['Over 21']: over21 = '',
          }) => [
            Name.trim(),
            {
              name: Name.trim(),
              roles: toObject(Roles, (val) => parseInt(val) / 100),
              weights: toObject(Weights, (val) => ({
                weight: parseInt(val),
                anywhere: val.endsWith('*'),
              })),
              isFemale: Gender.trim() === 'F',
              over21: over21.trim() === 'Y',
            },
          ],
        ),
    ),
    schedule: XLSX.utils
      .sheet_to_json(Schedule)
      .map(({Date: date, Roles: rolesString, Unavailable = ''}) => ({
        date,
        roles: toObject(rolesString, (listStr) =>
          listStr.split(',').map((n) => n.trim()),
        ),
        unavailable: new Set(
          Unavailable.split(',')
            .map((r) => r.trim())
            .filter(Boolean),
        ),
      })),
  };
}
