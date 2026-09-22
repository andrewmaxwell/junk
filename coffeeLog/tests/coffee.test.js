import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { unique, timestampWithOffset, validateDrink, validEndpoint, trustedReplyOrigin, FIRST_BATCH, DEFAULT_DRINKS } from '../model.js';

const script = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
function fixture() {
  let grid = [];
  let catalog = [['filename', 'label', 'active']];
  let locks = 0;
  let flushFailure = false;
  const sheet = {
    getDataRange: () => ({ getValues: () => grid.map(row => row.slice()) }),
    getLastRow: () => grid.length,
    getMaxRows: () => 1000,
    getRange: (row, column) => ({
      setValues(values) { values.forEach((value, i) => { grid[row - 1 + i] = value.map(v => typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v); }); },
      setFontWeight() { return this; }, setBackground() { return this; }, setNumberFormat() { return this; }
    }),
    setFrozenRows() {}, autoResizeColumns() {}, setColumnWidth() {}
  };
  const batchSheet = { ...sheet, getLastRow: () => catalog.length, getDataRange: () => ({getValues: () => catalog.map(row => row.slice())}), getRange: (row) => ({ setValues(values) { values.forEach((value, i) => { catalog[row - 1 + i] = value.slice(); }); }, setFontWeight() { return this; }, setBackground() { return this; } }) };
  const book = { getSheetByName: name => name === 'Batches' ? batchSheet : sheet, getId: () => 'test-sheet', getUrl: () => 'https://docs.google.com/spreadsheets/d/test-sheet/edit' };
  const context = vm.createContext({ console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test-sheet', setProperty() {} }) },
    LockService: { getScriptLock: () => ({ waitLock() { locks++; }, releaseLock() { locks--; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => book, openById: () => book, flush() { if (flushFailure) { flushFailure = false; throw new Error('Response lost after write'); } } },
    HtmlService: { createHtmlOutput: html => ({ html, setXFrameOptionsMode() { return this; } }), XFrameOptionsMode: { ALLOWALL: 1 } }
  });
  vm.runInContext(script, context);
  grid = [Array.from(vm.runInContext('HEADERS', context))];
  return { context, get catalog() { return catalog; }, get rows() { return grid; }, get locks() { return locks; }, failFlush() { flushFailure = true; } };
}
function drink(overrides = {}) {
  return {
    drink_id: randomUUID(), drank_at: '2026-09-22T10:00:00-05:00', drinker: 'Andrew', drink_type: 'Latte',
    caffeine: 'Half-caf', milk: 'Whole milk', batch_1_filename: FIRST_BATCH,
    batch_2_filename: '#31_decaf_26-09-20_1000.alog', batch_1_percent: 50, rating: 4, notes: '', ...overrides
  };
}

test('half-caf saves both full Artisan filenames, a number rating and timezone', () => {
  const f = fixture(), d = drink();
  assert.equal(f.context.handle_('log', d).drinkId, d.drink_id);
  assert.equal(f.rows[1][1], d.drank_at);
  assert.equal(f.rows[1][7], FIRST_BATCH);
  assert.equal(f.rows[1][8], d.batch_2_filename);
  assert.equal(f.rows[1][9], 50); assert.equal(f.rows[1][10], 4);
  assert.equal(f.locks, 0);
});

test('a retry after a committed write and lost response adds no duplicate', () => {
  const f = fixture(), d = drink(); f.failFlush();
  assert.throws(() => f.context.handle_('log', d), /Response lost/);
  assert.equal(f.rows.length, 2);
  assert.equal(f.context.handle_('log', d).duplicate, true);
  assert.equal(f.rows.length, 2); assert.equal(f.locks, 0);
});

test('guest ratings are discarded on the server and do not replace Andrew’s batch defaults', () => {
  const f = fixture(); f.context.handle_('log', drink());
  f.context.handle_('log', drink({ drinker: 'Alex', rating: 5, batch_1_filename: '#99_guest.alog' }));
  assert.equal(f.rows[2][10], '');
  assert.equal(f.context.handle_('bootstrap', {}).lastPair[0], FIRST_BATCH);
});

test('spreadsheet corrections supply fresh choices and no notes or ratings are exposed by bootstrap', () => {
  const f = fixture(); f.context.handle_('log', drink({ notes: 'Private tasting note' }));
  f.rows[1][7] = '#32_corrected.alog'; f.rows[1][6] = 'Oat milk';
  const result = f.context.handle_('bootstrap', {});
  assert.equal(result.choices.batches.includes(FIRST_BATCH), false);
  assert.equal(result.lastPair[0], '#32_corrected.alog');
  assert.equal(result.choices.milks[0], 'Oat milk');
  assert.equal(JSON.stringify(result).includes('Private tasting note'), false);
});

test('single-batch drinks discard stale second batch and use 100 percent', () => {
  const f = fixture(); f.context.handle_('log', drink({ caffeine: 'Decaf', rating: '' }));
  assert.equal(f.rows[1][8], ''); assert.equal(f.rows[1][9], 100); assert.equal(f.rows[1][10], '');
});

test('sorting the sheet does not change the last-used personal batch pair', () => {
  const f = fixture();
  f.context.handle_('log', drink({ batch_1_filename: '#40_new.alog' }));
  f.context.handle_('log', drink({ batch_1_filename: '#20_old.alog' }));
  f.rows[1][2] = '2026-09-22T10:00:00Z'; f.rows[2][2] = '2026-09-20T10:00:00Z';
  assert.equal(f.context.handle_('bootstrap', {}).lastPair[0], '#40_new.alog');
});

test('invalid ratings, missing or repeated half-caf batches and broken headers cannot append rows', () => {
  const f = fixture();
  for (const overrides of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { batch_2_filename: '' }, { batch_2_filename: FIRST_BATCH }, { drinker: ' ' }, { drank_at: 'yesterday' }]) {
    assert.throws(() => f.context.handle_('log', drink(overrides)));
    assert.equal(f.rows.length, 1);
  }
  f.rows[0][0] = 'Wrong header';
  assert.throws(() => f.context.handle_('log', drink()), /headers/);
  assert.equal(f.locks, 0);
});

test('free text is escaped for Sheets formulas while retaining the original value', () => {
  const f = fixture();
  assert.equal(f.context.literal_('=IMPORTXML("https://example.com", "//x")').startsWith("'="), true);
  const notes = '=1+1\nTasted sweet';
  f.context.handle_('log', drink({ notes }));
  assert.equal(f.rows[1][11], notes);
});

test('Apps Script HTML reply is bound to request ID and exact parent origin', () => {
  const f = fixture(), requestId = randomUUID();
  const output = f.context.doPost({ parameter: { requestId, parentOrigin: 'http://localhost:3000', action: 'log', payload: JSON.stringify(drink()) } });
  assert.match(output.html, /window.top.postMessage/);
  assert.ok(output.html.includes(requestId));
  assert.ok(output.html.includes('"http://localhost:3000"'));
  assert.ok(output.html.includes('"ok":true'));
});

test('HTML-like error text cannot break out of the response script', () => {
  const f = fixture(); f.context.handle_ = () => { throw new Error('</script><img src=x onerror=alert(1)>'); };
  const output = f.context.doPost({ parameter: { requestId: randomUUID(), parentOrigin: 'https://andrewmaxwell.github.io', action: 'bootstrap', payload: '{}' } });
  assert.equal(output.html.includes('<img'), false);
  assert.equal((output.html.match(/<\/script>/g) || []).length, 1);
});

test('remembered names and milk ignore case; filenames retain case', () => {
  assert.deepEqual(unique(['Andrew', ' andrew ', 'Alex']), ['Andrew', 'Alex']);
  assert.deepEqual(unique(['A.alog', 'a.alog'], true), ['A.alog', 'a.alog']);
});

test('only deployed Google Apps Script endpoints and Google reply origins are accepted', () => {
  assert.equal(validEndpoint('https://script.google.com/macros/s/abc-123/exec'), true);
  for (const value of ['https://script.google.com/macros/s/abc/dev', 'https://evil.test/macros/s/abc/exec', 'https://script.google.com.evil.test/macros/s/abc/exec']) assert.equal(validEndpoint(value), false);
  assert.equal(trustedReplyOrigin('https://abc-script.googleusercontent.com'), true);
  assert.equal(trustedReplyOrigin('https://script.google.com.evil.test'), false);
});

test('client validation rejects missing batch; timestamps round-trip the instant', () => {
  assert.throws(() => validateDrink(drink({ batch_2_filename: '' })), /decaf/);
  const date = new Date('2026-09-22T15:23:45Z');
  assert.equal(new Date(timestampWithOffset(date)).getTime(), date.getTime());
});


test('catalog batches appear before a drink has used them, with optional phone labels', () => {
  const f = fixture();
  f.catalog.push(['#41_new_roast.alog', '#41 Colombian', true], ['#42_decaf.alog', '', '']);
  const result = f.context.handle_('bootstrap', {});
  assert.deepEqual(Array.from(result.choices.batches), ['#41_new_roast.alog', '#42_decaf.alog']);
  assert.equal(result.batchLabels['#41_new_roast.alog'], '#41 Colombian');
  assert.equal(result.version, 2);
});

test('inactive catalog batches stay hidden even when present in history and defaults', () => {
  const f = fixture(); f.context.handle_('log', drink());
  f.catalog.push([FIRST_BATCH, '', false]);
  const result = f.context.handle_('bootstrap', {});
  assert.equal(result.choices.batches.includes(FIRST_BATCH), false);
  assert.equal(result.lastPair[0], '');
  assert.equal(f.rows[1][7], FIRST_BATCH);
});

test('the four default drinks and custom drinks work without a temperature field', () => {
  const f = fixture();
  assert.deepEqual(Array.from(f.context.handle_('bootstrap', {}).choices.drinks), DEFAULT_DRINKS);
  for (const type of [...DEFAULT_DRINKS, 'Mocha']) f.context.handle_('log', drink({ drink_type: type }));
  assert.equal(f.rows[0].includes('temperature'), false);
  assert.equal(f.context.handle_('bootstrap', {}).choices.drinks.includes('Mocha'), true);
  assert.throws(() => f.context.handle_('log', drink({ drink_type: ' ' })));
});

test('existing temperature columns are retained without shifting or deleting data', () => {
  const f = fixture(); f.context.handle_('log', drink());
  f.rows[0].splice(5, 0, 'temperature');
  f.rows[1].splice(5, 0, 'Hot');
  f.context.handle_('log', drink({ drink_type: 'Iced Latte' }));
  assert.equal(f.rows[1][5], 'Hot');
  assert.equal(f.rows[2][5], '');
  assert.equal(f.rows[2][6], 'Half-caf');
  assert.equal(f.rows[2][8], FIRST_BATCH);
});

test('running setup again preserves both logged drinks and the maintained catalog', () => {
  const f = fixture(); f.context.handle_('log', drink());
  f.catalog.push(['#42_decaf.alog', 'Decaf', false]);
  f.context.setup();
  assert.equal(f.rows.length, 2);
  assert.deepEqual(f.catalog[1], ['#42_decaf.alog', 'Decaf', false]);
});

test('setup initializes a blank catalog from existing roast references', () => {
  const f = fixture(); f.context.handle_('log', drink());
  f.catalog.length = 0;
  f.context.setup();
  assert.deepEqual(Array.from(f.catalog[0]), ['filename', 'label', 'active']);
  assert.equal(f.catalog[1][0], FIRST_BATCH);
  assert.equal(f.catalog[2][0], '#31_decaf_26-09-20_1000.alog');
});
