// @ts-expect-error import the thing
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
import './types.js';

const spreadsheetUrl =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQA9hjBB26_Je8_Pa9na96LgKLyYErm6kZT-CWrU_MXS53-D2-kDSsMOUva_-kwyOgpOlH-GsjENYot/pub?output=xlsx';

/**
 * @template T
 * @param {string} str
 * @param {(val: string) => T} parseFunc
 * @returns {Record<string, T>}
 */
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

/**
 * Fetches, parses, and returns data from a published spreadsheet.
 *
 * @returns {Promise<{
 *   people: Person[],
 *   roleSchedule: RoleSchedule[]
 * }>}
 */
export async function getData() {
  const response = await fetch(spreadsheetUrl);
  const buffer = await response.arrayBuffer();

  const workbook = XLSX.read(buffer, {cellDates: true});
  const {People, Roles} = workbook.Sheets;

  /** @type {{ Name: string; Roles: string; Weights?: string }[]} */
  const rawPeople = XLSX.utils.sheet_to_json(People);

  /** @type {Person[]} */
  const people = rawPeople.map(({Name, Roles, Weights = ''}) => ({
    name: Name.trim(),
    roles: toObject(Roles, (val) => parseInt(val) / 100),
    weights: toObject(Weights, Number),
  }));

  /** @type {{ Date: Date; Roles: string; Unavailable?: string }[]} */
  const rawRoles = XLSX.utils.sheet_to_json(Roles);

  /** @type {RoleSchedule[]} */
  const roleSchedule = rawRoles.map((row) => {
    const {Date: date, Roles: rolesString, Unavailable = ''} = row;
    return {
      date,
      roles: toObject(rolesString, (listStr) =>
        listStr.split(',').map((n) => n.trim()),
      ),
      unavailable: new Set(
        Unavailable.split(',')
          .map((r) => r.trim())
          .filter(Boolean),
      ),
    };
  });

  return {people, roleSchedule};
}
