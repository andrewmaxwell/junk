# careCalculator

A childcare rate calculator. It quotes an hourly team rate for a babysitting booking from the children's ages and needs, the tasks the caregivers handle, and whether parents are around.

Not on the homepage on purpose: there's no `README.md` or `image.png`, and none should be added.

## Purpose and decisions

A fun, transparent experiment: some of the parents are engineers who'll enjoy poking at the math, and it might help a babysitter estimate rates. The aim is understandable, plausible behavior, not an objectively correct price. These were Andrew's explicit decisions:

- **Super minimal design:** inputs and calculations only. No branding, taglines, decorative imagery or marketing copy.
- Show the team hourly rate, each caregiver's hourly pay and the booking total. **One dollar figure**, not a range. **Equal pay** by default.
- Quote expected responsibilities **up front**. Nothing adjusts the bill afterward because a child turned out harder.
- v1 covers ordinary indoor childcare. No pool supervision, medical care or overnights.
- Test that outputs are _realistic_, not just that the code runs (see the calibration checks at the end of `test.js`).

Modeling principles:

- Keep shared supervision, extra attention and personal-care tasks separate. Holding a child while watching the group isn't the same as a task that takes a caregiver away from the others.
- Age sets default supervision, but actual needs matter more.
- Children entertaining each other cuts entertainment work, never supervision.
- Parents aren't expected to help. If a parent plans to look after a child themselves, that child is left off the quote. There is no partial parent coverage, because unplanned help shouldn't change an upfront price.
- A second caregiver adds paid time but lowers each person's load. Removing one shouldn't simply halve the quote.
- Time and responsibility stay paid when children are easy or asleep.
- Price actual support tasks, not a blanket diagnosis or disability surcharge. A higher price is no substitute for proper staffing, qualifications or a suitable setting.

## Calibration

`example()` is a real two-hour session that both caregivers considered fair, agreed beforehand: $12.50/hr each, $25/hr team, $50 total. It's a calibration anchor, **not** a market rate.

- Johnny (4) and Layla (2) were easy and entertained themselves with Eden. Eden (4) and Nora (18 mo) need occasional redirection during play. Nora may need about an hour of holding to settle. Eliam (18 mo) needs frequent involvement during play and about an hour of one-to-one settling.
- On the night, Eliam's dad came down unplanned and consoled him for a good part of the session. That help wasn't expected, so the example leaves it out, and the model has no parent-coverage input.
- Parents handled all potty and diapers. There was no feeding, bathing or bedtime. Johnny's allergies exist but weren't in play.

**The weights are fitted to Andrew's guesses.** ChatGPT's original weights were placeholders. In October 2026 Andrew guessed the hourly pay that would make the second caregiver happy in several scenarios. Each changes one thing from the reference session ($12.50):

| Scenario                               | Guess  | Model  |
| -------------------------------------- | ------ | ------ |
| Diapers and potty                      | $15    | $14.50 |
| Dinner with allergy care               | $14    | $14    |
| Bedtime for all five                   | $20    | $20    |
| One caregiver                          | $25    | $24    |
| One caregiver plus diapers             | $28    | $29    |
| One caregiver, just Johnny and Eden    | $15    | $15    |
| Four hours instead of two              | $12.50 | $12.50 |
| Plus the newborn, asleep half the time | $13    | $14    |

A ninth guess, "no dad helping with Eliam" at $13, became moot once unplanned parent help was dropped from the model.

The weights came from a least-squares fit pulled toward the previous values, then rounded. Two of the model's principles were kept as constraints:

- One-to-one consoling stays dearer than holding.
- Tasks away from the group stay dearer alone than with a team.

The "easy job alone" guess is why `soloBonus` exists: being the only one in charge is worth something even when the work is light.

After fitting, every point weight was scaled by one factor, and the premium per point by its inverse, so the reference keeps each caregiver about 60% busy. Prices didn't change. Points are now explicitly relative to the reference session, not a literal share of attention: Andrew's guesses priced one-to-one consoling barely above holding, which no literal attention scale supports. The meter and heavy-load warning are expressed as multiples of the reference (warning above 1.7×).

`test.js` checks every guess within a tolerance. When retuning, keep them passing or update the table along with the tests. Andrew said these are guesses, so pushing back is fine.

Newborn scenario: a ~3-week-old sibling. Andrew wants the parents nearby for a newborn (hence the "your newborn preference" warning when parents are away). Don't assume the baby sleeps through the booking, or that both caregivers have agreed to newborn duties.

## Files

- `model.js`: all the math, with no DOM access. `WEIGHTS` holds every tunable number. `workload()` turns a state into points, and `calculate()` turns points into a rate plus warnings. `scenarios` are the "Compare changes" options.
- `main.js`: holds `state` and the undo stack, and handles events. `render()` rebuilds the inputs (button clicks only); `updateResult()` refreshes everything that follows from them.
- `view.js`: markup for each part of the page, as strings built from a plan and its calculation. No DOM access.
- `storage.js`: saves the plan to `localStorage` under `care-v5` and to the URL hash, and loads it back through `sanitize()`. Rename the key if the state shape changes in a way `sanitize()` can't migrate.
- `weightsPanel.js`: the lazily loaded lil-gui weights panel.
- `test.js`: model checks, including 500 randomized states that test monotonicity and pay splitting. Run with `node careCalculator/test.js`.
- `test-browser.js`: drives the real page in headless Chrome. Run with `node careCalculator/test-browser.js`. It serves the folder itself, so the dev server doesn't need to be running. Playwright isn't a repo dependency, so the test imports the copy in the npx cache (`~/.npm/_npx`) and launches the installed Google Chrome (`channel: 'chrome'`), so the cached Playwright's browser version doesn't matter.

Run both tests after any change.

## How the rate works

- **Unit:** points are relative, calibrated so the reference session carries `included` per caregiver. Task times are real minutes. Don't describe points as a literal share of someone's attention anywhere in the UI.
- Each child gets points for supervision (by age), extra attention, settling and the tasks the caregivers take on for that child. Sleep scales those points down. Parents being away adds a share of supervision for having no backup.
- Tasks are a caregiver's minutes divided by the booking's minutes, times a factor. Tasks done away from the group (toileting, baths, bedtime) use `away.team`, or the larger `away.solo` with one caregiver, who must manage the group too. Feeding happens with the group, so it uses the smaller `inRoom`. Food precautions are minutes per meal, so they don't grow with booking length, and only count for a child who's fed.
- Tasks are per child (`c.diapers`, `c.feeding`, `c.bath`, `c.bed`). The Responsibilities chips are "every child" toggles, shown mixed when only some children have the task. A new child (Add child, the newborn comparison) takes on the tasks every existing child has. Plans saved before this kept tasks on the plan; `sanitize()` gives them to every child.
- Staffing limits (children and under-2s per caregiver, a newborn with one caregiver) raise warnings, never the price.
- Base pay covers `weights.included` points per caregiver. Each point above that adds `weights.premium` $/hr to the team rate, and each caregiver's booking pay rounds to a whole dollar.
- `included` is a fixed number, calibrated so `example()` costs exactly base pay ($25/hr). It isn't derived from `example()`, so editing the example doesn't change other quotes. If you retune the weights and want the example to cost base pay again, recompute it as `workload(example()).total / 2`.

## Conventions

- Weights live in `state.weights`, so they're saved and the lil-gui "Weights" panel (inside "Formula and assumptions") can edit them live. The "All workload assumptions" text is generated from the same weights. When you add a weight, add it to `WEIGHTS`, the math, `buildGui()` and the assumptions text.
- Age-based values are `{months, value}` anchors that `byAge()` interpolates linearly, holding the end values beyond the first and last anchors. That keeps quotes from jumping on a birthday; `test.js` checks it. Don't go back to step brackets.
- `NEWBORN_MONTHS` (3) only drives the newborn warnings.
- Child attention is stored as a level name (`none`, `occasional`, `frequent`, `constant`) that indexes `weights.attention`, so retuning a weight applies to saved children too.
- Don't re-render the inputs in the `change` handler. Replacing the DOM while a field blurs drops focus from the field the user tabbed or clicked into. `patchCard()` patches the dependent bits (labels that use the name, and the settling-style, toileting and food-precaution fields, which are hidden rather than removed), then `refresh()`. The Responsibilities toggles re-render the cards, which is safe because focus is on the toggle, outside them. A full `render()` is fine after button clicks (add, remove, reset, scenarios).
- `childName()` gives a blank name a "Child N" fallback. Use it anywhere a name is shown.

## Look

- Clean and minimal with a little color: cards on a soft background, one teal accent, and light and dark themes. Every color is a token on `:root` in `style.css`.
- Each child has an identity color: the stripe on its card, its segment in the workload meter, and its dot in the legend and table. Colors come from the dataviz skill's validated reference palette, in its fixed order (`--series-1`…`8`). `c.hue` stores each child's slot so colors follow the child, not its position, when another child is removed. Past eight children, the rest share `--series-other`.
- Status colors (`--good`, `--warning`, `--critical`) are only for the meter's status and the warnings. They always come with an icon and a label.
- The meter shows one caregiver's share stacked by child, in multiples of the reference: a mark at 1× (where base pay stops) and one at the heavy-load line. Hover a segment for its value.
- Selects use `appearance: none` with a thin SVG chevron from the `--chevron` token, which has a light and a dark version. The native arrow sat jammed against the border.
- "Settling takes" (`comfort`) is hidden until "Help settling" is above None, because it changes nothing otherwise. The `change` handler toggles its `hidden`, and `[hidden]` is forced to `display: none` because `label` sets `display: flex`.

## Sharing, undo and pay rounding

- The URL hash holds the whole plan, including the full weights, as base64url JSON, so retuning the defaults never changes an old link. A link reproduces the plan in any browser, and on load it wins over `localStorage`. The footer notes that the address includes names and care details. There are no copy buttons, by Andrew's choice: the address bar is the link.
- Undo covers the buttons that replace or remove things: removing a child, applying a comparison, resetting, restoring default weights, and a pasted link. Typing in fields isn't on the stack, because the browser's own undo covers inputs.
- Each caregiver's pay for the booking rounds to a whole dollar, since babysitters are usually paid cash. The hourly figures are derived from that rounded pay, so they can show odd cents.
- Age is entered as years plus months. The months box rolls over into years, and the model still stores only `months`.

## Child card layout

- Responsibilities sit above Children because the task toggles set tasks for every child below.
- Every field is inline; there's no collapsible section. "Toileting needs" shows only when that child has diapers & potty, and "Food precautions" only when that child has a meal. "Settling takes" shows only when the child needs settling.

## Review fixes (October 2026)

A GPT-6.1 review found these; keep them fixed.

- **Untrusted plans.** Links and saves go through `sanitize()` in `model.js`, which rebuilds the plan from known fields: numbers clamped, options checked against their lists, weights matched to the shape of `WEIGHTS` with fixed anchor ages. Only those clean values reach `innerHTML`; names are still escaped. Before this, a crafted link could inject markup through the weights. Any new state field needs a line in `sanitize()`.
- **Swallowed clicks.** A field commits on blur, which can happen on pointerdown over a button. `refresh()` waits for pointerup before re-rendering, so the button isn't replaced mid-click. Use `refresh()`, not `updateResult()`, from the `change` handler.
- **State that survives re-renders.** Disclosures inside re-rendered markup use `keep('id')` to keep their open state.
- **Settling minutes** count as entered, capped at the child's awake time. Sleep used to discount them a second time.
- **Staffing warning:** one caregiver with a child needing one-to-one settling for at least half the booking.
- **lil-gui loads lazily**, so the calculator works without the CDN; only the weights panel needs it.
- **Focus:** after removing a child, focus moves to the card that took its place (or Add child). After applying a comparison, it moves to the first comparison. Each child card is a labelled group, and its age boxes are labelled with the child's name.
- **Layout:** below 900px the page is one column, form first, with a fixed mini bar showing the price. Muted text (`--text-3`) meets 4.5:1 contrast on white, the page background and the quote card.
- "Start blank" clears the children but keeps session settings and weights.

A second review found these; also keep them fixed.

- **The hash is the plan.** In-page navigation must never use `#anchor` links, because the hash holds the plan; the mobile "Details" button scrolls with `scrollIntoView`.
- **Model version.** Links and saves carry `v: MODEL_VERSION`. `sanitize()` drops weights from any other version rather than misread them. Bump it whenever a weight or rule changes meaning.
- **Weight floors.** `included` is at least 0.05 and `heavyLoad` at least 1, so the meter never divides by zero.
- **One settling rule.** `settleMinutes()` (entered minutes, capped at awake time) feeds both pricing and the one-to-one warning. That warning is team-wide: it fires when the children needing one-to-one for half the booking or more take up every caregiver.
- **Group play** scales with children's average awake share, so sleeping children add none.
- **Parents away without diapers & potty** warns, naming each child who isn't independent and doesn't have the task. The task is never assigned silently. Toileting defaults to independent from age 5.
- `refresh()` also clears on `pointercancel`, which touch scrolling sends instead of `pointerup`.
- "Start blank" clears only the children.
- Renaming a child updates every label that uses the name.
- `MAX_CHILDREN` (30) caps Add child and loading alike.
- The mobile bar shows a note count when there are warnings, and the Calculation card says when custom weights are active.

A third review (October 2026) found these; also keep them fixed.

- **One-to-one warning** also fires when there are more one-to-one children than caregivers, even with no other children (two such children, one caregiver).
- **Weights panel** is rebuilt only when `state.weights` is replaced (undo, reset, restore, a link), so open folders survive adding a child. Weight edits must mutate `state.weights` in place.
- **Screen readers:** `#result` isn't a live region, because it's re-rendered on every edit. A hidden `#announce` line speaks the price and note count when they change.
- The newborn comparison is hidden at `MAX_CHILDREN`.

Not done, and worth considering:

- Easier sleep entry (hours rather than a percentage), and showing when settling was capped at awake time.
- Checking the prices against bookings Andrew prices that weren't used for fitting.

- Routine counts. Meals, baths and bedtimes are still one each per child per booking.
- Pinning Playwright as a dev dependency so `test-browser.js` doesn't rely on the npx cache. That's a root `package.json` change, so ask first.
