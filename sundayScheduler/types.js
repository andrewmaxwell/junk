/**
 * @typedef {Object} Person
 * @property {string} name
 * @property {Record<string, number>} roles
 * @property {Record<string, number>} weights
 * @property {boolean} [determined]
 */

/**
 * @typedef {Object} RoleSchedule
 * @property {Date} date
 * @property {Record<string, string[]>} roles
 * @property {Set<string>} unavailable
 */

/**
 * A row in the scheduling solution state.
 * @typedef {Object} StateRow
 * @property {Date} date
 * @property {Record<string, string[]>} roles
 * @property {Set<string>} unavailable
 * @property {Record<string, Person[]>} assignments
 */
