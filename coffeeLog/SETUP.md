# Connect Coffee Log to Google Sheets

The app is static and works with the repository’s existing GitHub Pages deployment. There is no build step or sign-in screen. A small Google Apps Script writes to your spreadsheet.

## One-time Google setup

1. Create a new Google spreadsheet called **Coffee Log**. Keep its sharing set to **Restricted**.
2. In that spreadsheet, open **Extensions → Apps Script**.
3. Replace the starter code with the complete contents of [apps-script/Code.gs](./apps-script/Code.gs), then save.
4. Select **setup** in the function dropdown and click **Run**. Authorize your script to access your spreadsheet. This creates the **Drinks** and **Batches** tabs and remembers the spreadsheet ID. Setup can be run again without clearing data.
5. Click **Deploy → New deployment**. Select **Web app**. Set **Execute as** to **Me**, and **Who has access** to **Anyone**. Deploy.
6. Copy the deployed URL ending in **/exec**, not the test URL ending in /dev.
7. Open Coffee Log, tap the settings icon, paste the URL, and tap **Connect**. The app checks the spreadsheet before saving the connection.

The Google authorization is for initial setup only. Logging a drink does not require signing in. Anyone who has the app endpoint can submit drinks and retrieve the remembered names, milk values, and batch filenames. Notes, ratings, and full drink records are not returned by the endpoint. The spreadsheet itself stays restricted to your Google account.

If your Google Workspace administrator disables deployments with **Anyone** access, use a Google account that permits anonymous Apps Script web apps.

## Connect all devices

For the same setup on your Pixel and desktop, put the /exec URL in `config.js`:

```js
window.COFFEE_LOG_CONFIG = {
  endpoint: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
};
```

Commit the files through your usual workflow. Your existing Pages deployment copies this folder as-is. All paths are relative, including the PWA scope, so the app works under the repository’s Pages subdirectory.

The Settings value overrides config.js on a device. If you replace a deployment, connect the new URL in Settings on devices that had a manual override.

## Install on the Pixel

Open the published HTTPS page in Chrome. Use the app’s **Install app** link when available, or Chrome’s menu → **Add to Home screen → Install**. Internet is needed for logging. The app does not cache drinks for later automatic submission.

## Manage batches from your laptop

Use the **Batches** tab in the same spreadsheet. You do not need the Artisan files on your phone, and there is no file upload.

| filename | label | active |
| --- | --- | --- |
| #32_colombian_supremo_26-09-21_1432.alog | #32 Colombian | TRUE |

- **filename** is the exact Artisan filename, including `.alog`. Paste filenames from your laptop, one per row.
- **label** is optional: use a shorter display name for the phone dropdown. Logs always store the full filename.
- **active** can be TRUE or blank for current batches; set FALSE to hide a finished batch. This overrides historical entries so an old batch does not keep reappearing. You can turn this column into checkboxes in Sheets if preferred.
- Reopen the app after editing the sheet. Catalog changes refresh when the app becomes visible. A form you have already started is preserved; a removed batch can stay in that draft, but it will not be preselected in a fresh form.
- Previously logged filenames are also available unless marked inactive in Batches. An inline batch addition appears through drink history; add it to Batches if you want a label or to mark it inactive later.
- When first created, Batches is populated from existing drink logs, or with Andrew’s sample filename if there are no logs. Running setup again does not overwrite your catalog.

## Update from the first version

Replace the Apps Script code, run **setup** again, then **Deploy → Manage deployments → Edit → New version → Deploy**. Existing drinks and Batches entries are preserved. Use the same deployment URL.

New spreadsheets omit the temperature column. Existing spreadsheets may keep that column for historical data; new entries leave it blank. No columns or historical values are deleted. The updated app needs the updated script to load the new catalog and drink choices.

## Everyday use

- Your default is Andrew, now, half-caf, whole-milk latte. Drinks start with Latte, Cortado, Iced Latte, and Frappe; Add new drink remembers additional choices. There is no separate temperature field.
- Select the regular and decaf Artisan batches. Half-caf records a 50/50 mix. The last pair from your own half-caf drink is preselected next time.
- Add new drinks, drinkers, milk, or batch filenames using **+ Add new…** in that field. Values become remembered choices after a successful save.
- Rate your own drink 1–5, or leave it blank. Guest drinks have no rating.
- Log drink saves a row. Confirmation appears only when Google reports success.
- If confirmation is lost, **Retry this drink** reuses the same ID and cannot create a second row. The original entry is kept in the current tab, including across a reload. Confirm it before editing the form or changing the connection. There is no automatic retry.
- Use **Open spreadsheet** for corrections. Reopen the app to refresh choices from the sheet. Keep the header names/order and drink IDs intact. Sort entire rows, not individual columns; the latest pair is determined by submission time.

The first regular batch is suggested as `#32_colombian_supremo_26-09-21_1432.alog`. Choose your actual decaf batch before saving your first half-caf drink.

## Troubleshooting

- **No confirmation / connection timeout:** Check internet access, run setup, and confirm the deployment executes as you with **Anyone** access. Open the /exec URL directly; it should say Coffee Log is ready without requiring sign-in.
- **Updated script isn’t running:** Use **Deploy → Manage deployments → Edit → New version → Deploy** to update the existing deployment while retaining its URL.
- **Headers changed:** Restore the column headers from `Code.gs`. Logging stops rather than putting data in the wrong columns.
- **Fake submissions:** Disable or replace the Apps Script deployment. Authentication can be added later if needed.

## Development and verification

No package installation is needed. Run `npm test` in this folder (Node 20+) for validation, retry/deduplication, spreadsheet correction, guest-rating, and response-safety tests. Serve this folder with your existing local server.

Before relying on the live connection, connect your deployment, save one real drink, and check the row in Sheets. Automated backend tests use a spreadsheet stub; they do not verify a deployed Google account or Google’s iframe behavior.

Implementation references: [Google Apps Script web apps](https://developers.google.com/apps-script/guides/web), [HTML service restrictions](https://developers.google.com/apps-script/guides/html/restrictions), [HtmlOutput](https://developers.google.com/apps-script/reference/html/html-output), [postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage), and [PWA installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
