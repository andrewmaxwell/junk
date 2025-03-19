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

/** @type {() => Promise<{people: Person[], roleSchedule: RoleSchedule[]}>} */
export async function getData() {
  const response = await fetch(spreadsheetUrl);
  const {People, Roles} = XLSX.read(await response.arrayBuffer(), {
    cellDates: true,
  }).Sheets;

  return {
    people: XLSX.utils
      .sheet_to_json(People)
      .map(({Name, Roles, Weights = ''}) => ({
        name: Name.trim(),
        roles: toObject(Roles, (val) => parseInt(val) / 100),
        weights: toObject(Weights, Number),
      })),
    roleSchedule: XLSX.utils
      .sheet_to_json(Roles)
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
