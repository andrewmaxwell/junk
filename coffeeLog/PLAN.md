# Coffee Log

## Purpose

A small phone app for Andrew to record coffee drinks he makes, including drinks for other people. Personal ratings can later be correlated with Artisan roast batches.

## Platform and storage

- Static, dependency-free PWA, hosted by the repository’s existing GitHub Pages deployment.
- Designed for Pixel 9 Pro; dark theme and plain, functional copy.
- No sign-in for logging. A Google Apps Script deployment accepts submissions and supplies remembered choices. The spreadsheet itself remains restricted.
- Internet required. No offline queue or automatic retries.
- Corrections happen in Google Sheets, not in the app.

## Logging

- Drinker defaults to Andrew; remembered choices and inline additions.
- Time defaults to submission time; editable for past drinks.
- Drink defaults to Latte. Initial choices: Latte, Cortado, Iced Latte, Frappe. Additional drinks can be entered and are remembered after saving.
- No separate temperature field. Temperature is implicit in the drink name.
- Caffeine defaults to Half-caf; Regular and Decaf are also available.
- Milk defaults to Whole milk; remembered choices, None, and inline additions.
- Half-caf uses two different roast batches, mixed 50/50. Other caffeine options use one batch.
- Remember Andrew’s last half-caf batch pair without changing the fixed drink defaults for guest entries.
- Optional 1–5 whole-number rating for Andrew only. Guest drinks have no rating.
- Optional free-text notes. Neither ratings nor notes carry over to another drink.
- No size, shot count, or brewing measurements.

## Batch catalog

Maintain a Batches tab in the same spreadsheet from the laptop. Columns:

| Column | Meaning |
| --- | --- |
| filename | Exact Artisan filename, including extension |
| label | Optional short name for the phone dropdown |
| active | TRUE or blank to show; FALSE to hide a finished batch |

Example filename: `#32_colombian_supremo_26-09-21_1432.alog`.

The phone reads the catalog; no Artisan file uploads or transfers are needed. Previously logged batches remain available unless explicitly marked inactive. Inline additions remain available as a fallback. Catalog labels are only for display; each drink saves the exact filenames.

Catalog changes refresh when the app opens or becomes visible. An in-progress draft remains intact. Inactive batches do not remain selected in fresh forms. Running setup creates the catalog without overwriting existing entries.

## Drinks tab

One row per drink: drink_id, drank_at, created_at, drinker, drink_type, caffeine, milk, batch_1_filename, batch_2_filename, batch_1_percent, rating, notes.

Timestamps retain their timezone. Stable drink IDs prevent duplicates on retry. A rating is feedback on the entire drink and, for half-caf, the combination of two batches, rather than an independent rating of each batch.

For compatibility, existing logs can retain their historical temperature column. New entries leave it blank; upgrades do not delete data. New spreadsheets omit it.

## Save behavior

Confirm success only after the spreadsheet confirms the row. Disable duplicate submissions while saving. If confirmation is lost, retain the original payload and ID for a manual retry, including across a reload of the same tab. Explicit validation failures allow correction. Render user-provided values as plain text and avoid spreadsheet formula execution.

## Setup and validation

See SETUP.md. Deploy the included Apps Script from Andrew’s Google spreadsheet, run setup, then connect its /exec URL in app Settings or config.js. Script updates require deploying a new version. End-to-end saving needs verification against the actual deployment; automated tests use a spreadsheet stub.

## Possible future friction reductions

- Compact default summary with tap-to-edit details, keeping rating and Save visible immediately.
- Favorites for commonly repeated non-default drinks.
- A laptop helper to import new Artisan filenames into Batches automatically.

These are ideas, not part of the current implementation.
