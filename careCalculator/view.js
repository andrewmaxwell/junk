// Markup for the page, built from a plan and its calculation. No DOM access:
// main.js decides where each piece goes. Only escaped names and values that
// sanitize() has cleaned reach the markup.
import {childName, calculate, scenarios, TASKS, WEIGHTS} from './model.js';
export const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[
        c
      ],
  );
export const money = (v) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Math.round(v * 100) / 100 || 0);
const signed = (v) => (v > 0.005 ? '+' : '') + money(v);
export const plural = (n, word, many = word + 's') =>
  `${n} ${n === 1 ? word : many}`;
const pct = (v) => Math.round(v * 100) + '%';
// "0 mo: 0.35, 12 mo: 0.3, …" for an age-anchor list.
const anchors = (list) =>
  list.map((a) => `${a.months} mo: ${a.value}`).join(', ');
// Disclosures inside re-rendered markup keep their open state. main.js
// records toggles here.
export const openState = {};
const keep = (id) => `data-keep="${id}" ${openState[id] ? 'open' : ''}`;

const num = (title, key, value, min, max, step = 1, idx = '') =>
  `<label>${title}<input type="number" data-key="${key}" data-index="${idx}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
const select = (title, key, value, options, idx = '', hidden = false) =>
  `<label ${hidden ? 'hidden' : ''}>${title}<select data-key="${key}" data-index="${idx}">${options.map(([v, t]) => `<option value="${v}" ${String(value) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
const checkbox = (attrs, checked, title) =>
  `<label class="task"><input type="checkbox" ${attrs} ${checked ? 'checked' : ''}>${title}</label>`;
// Age as years + months; the months box rolls over into years.
const ageField = (c, i) =>
  `<label>Age<span class="age-input"><input type="number" aria-label="${esc(childName(c, i))}, age in years" data-key="years" data-index="${i}" value="${Math.floor(c.months / 12)}" min="0" max="18" step="1"><span>yr</span><input type="number" aria-label="${esc(childName(c, i))}, months" data-key="mo" data-index="${i}" value="${+(c.months % 12).toFixed(2)}" min="0" max="216" step="0.25"><span>mo</span></span></label>`;

// Each child keeps its color slot when others are removed, so colors follow
// the child rather than its position. Past eight, children share a gray.
const HUES = 8;
export function assignHues(children) {
  const used = new Set(children.map((c) => c.hue));
  for (const c of children) {
    if (c.hue !== undefined) continue;
    c.hue = [...Array(HUES).keys()].find((h) => !used.has(h)) ?? HUES;
    used.add(c.hue);
  }
}
const hueVar = (c) =>
  `--hue: var(--series-${c && c.hue < HUES ? c.hue + 1 : 'other'})`;

export const sessionHtml = (s) =>
  num('Hours', 'hours', s.hours, 0.5, 12, 0.5) +
  num('Caregivers', 'caregivers', s.caregivers, 1, 6) +
  num('Base pay / person / hour ($)', 'base', s.base, 0, 150, 0.5) +
  select('Parents available?', 'parents', s.parents, [
    ['true', 'On site, ready to help'],
    ['false', 'Away / unavailable'],
  ]);
// Toggles for every child at once. main.js sets checked and indeterminate,
// since a mixed state has no markup.
export const tasksHtml = (s) =>
  TASKS.map(([k, t]) =>
    checkbox(`data-all="${k}" ${s.children.length ? '' : 'disabled'}`, 0, t),
  ).join('');
export const settingHtml = (s) =>
  select('Play space', 'space', s.space, [
    ['shared', 'One suitable, visible area'],
    ['split', 'Suitable areas, divided sightlines'],
  ]) +
  select('Group play', 'play', s.play, [
    ['together', 'They entertain themselves'],
    ['led', 'Adults lead activities'],
    ['conflict', 'Frequent mediation'],
  ]);
// Fields that only matter for some choices are rendered hidden, and main.js
// toggles them in place, so an edit never replaces the focused field.
export const childrenHtml = (s) =>
  s.children
    .map(
      (c, i) =>
        `<article class="child" role="group" aria-label="${esc(childName(c, i))}" style="${hueVar(c)}"><div class="child-top"><input class="name" aria-label="Child ${i + 1} name" data-key="name" data-index="${i}" value="${esc(c.name)}" maxlength="40"><button class="remove" data-remove="${i}" aria-label="Remove ${esc(childName(c, i))}">×</button></div><div class="child-tasks" role="group" aria-label="Caregivers handle"><span class="caption" aria-hidden="true">Caregivers handle</span>${TASKS.map(([k, t]) => checkbox(`data-key="${k}" data-index="${i}"`, c[k], t)).join('')}</div><div class="fields">${ageField(c, i)}${select(
          'Extra attention during play',
          'attention',
          c.attention,
          [
            ['none', 'Mostly independent'],
            ['occasional', 'Occasional redirection'],
            ['frequent', 'Frequent involvement'],
            ['constant', 'Nearly constant help'],
          ],
          i,
        )}${select(
          'Help settling',
          'settle',
          c.settle,
          [
            [0, 'None'],
            [10, 'About 10 minutes'],
            [30, 'About 30 minutes'],
            [60, 'About an hour'],
            [999, 'Whole session'],
          ],
          i,
        )}${select(
          'Settling takes',
          'comfort',
          c.comfort,
          [
            ['holding', 'Holding, still watching others'],
            ['active', 'One-to-one, full attention'],
          ],
          i,
          !c.settle,
        )}${num('Expected time asleep (%)', 'sleep', c.sleep, 0, 100, 5, i)}${select(
          'Toileting needs',
          'toilet',
          c.toilet,
          [
            ['diaper', 'Diapers'],
            ['help', 'Potty assistance'],
            ['independent', 'Independent'],
          ],
          i,
          !c.diapers,
        )}${select(
          'Food precautions needed?',
          'allergy',
          c.allergy,
          [
            ['false', 'No'],
            ['true', 'Yes, follow parent instructions'],
          ],
          i,
          !c.feeding,
        )}</div></article>`,
    )
    .join('');

// Each caregiver's share of the workload, stacked by child, measured against
// the reference session: base pay covers 1×, the heavy-load line is at
// weights.heavyLoad×.
function meter(s, r) {
  const w = s.weights;
  const n = s.caregivers;
  const rel = (v) => v / w.included;
  const load = rel(r.load);
  const max = Math.max(w.heavyLoad * 1.15, load * 1.05);
  const at = (v) => (Math.min(v, max) / max) * 100 + '%';
  const segs = r.rows.map((row, i) => [
    row.name,
    rel(row.total / n),
    hueVar(s.children[i]),
  ]);
  if (r.group + r.environment > 0)
    segs.push([
      'Group & setting',
      rel((r.group + r.environment) / n),
      hueVar(),
    ]);
  const [cls, icon, label] =
    load <= 1 + 1e-9
      ? ['good', '✓', 'Covered by base pay']
      : load <= w.heavyLoad
        ? ['warning', '+', 'Premium applies']
        : ['critical', '!', 'Heavy'];
  return `<div class="load"><div class="load-head"><span>Workload per caregiver</span><span class="status ${cls}"><i aria-hidden="true">${icon}</i>${label}</span></div><div class="meter" role="img" aria-label="Each caregiver carries ${load.toFixed(2)} times the reference session’s load"><div class="fill" style="width:${at(load)}">${segs
    .filter(([, v]) => v > 0.0005)
    .map(
      ([name, v, hue]) =>
        `<span class="seg" style="flex-grow:${v};${hue}" data-tip="${esc(name)}: ${v.toFixed(2)}× per caregiver"></span>`,
    )
    .join(
      '',
    )}</div><span class="mark" style="left:${at(1)}"></span><span class="mark heavy" style="left:${at(w.heavyLoad)}"></span></div><div class="scale"><span style="left:${at(1)}">Reference</span><span style="left:${at(w.heavyLoad)}">Heavy ${w.heavyLoad}×</span></div><div class="legend">${segs
    .map(
      ([name, , hue]) =>
        `<span style="${hue}"><i class="dot"></i>${esc(name)}</span>`,
    )
    .join('')}</div></div>`;
}
const line = (a, b) => `<div class="line"><span>${a}</span><b>${b}</b></div>`;
export const resultHtml = (s, r) =>
  `<div class="quote"><span class="quote-title">Team hourly estimate</span><div class="price">${money(r.rate)}<small> / hour</small></div><div class="per">${money(r.each)} / hour each · equal split</div>${s.children.length ? meter(s, r) : ''}<div class="total"><span>${s.hours}-hour booking<br>${plural(s.caregivers, 'caregiver')}</span><strong>${money(r.total)}</strong></div><p class="quote-note">${money(r.pay)} each for the session. Each caregiver’s pay is rounded to a whole dollar.</p></div><div class="white-card"><h3>Calculation</h3>${JSON.stringify(s.weights) === JSON.stringify(WEIGHTS) ? '' : '<p class="hint">Using custom weights (see Formula and assumptions).</p>'}${line('Combined base pay', money(s.children.length ? s.base * s.caregivers : 0) + '/hr')}${r.solo ? line('Sole caregiver', money(r.solo) + '/hr') : ''}${line('Workload premium', money(r.extra) + '/hr')}${line('Rounding adjustment', money(r.rate - r.raw) + '/hr')}<details ${keep('breakdown')}><summary>Workload by child</summary><div class="table-wrap"><table class="breakdown"><thead><tr><th>Child</th><th>Supervision</th><th>Attention¹</th><th>Tasks²</th><th>Total</th></tr></thead><tbody>${r.rows.map((c, i) => `<tr><td><i class="dot" style="${hueVar(s.children[i])}"></i>${esc(c.name)}</td><td>${c.supervision.toFixed(2)}</td><td>${(c.attention + c.settling).toFixed(2)}</td><td>${(c.toileting + c.feeding + c.bath + c.bed + c.allergy).toFixed(2)}</td><td>${c.total.toFixed(2)}</td></tr>`).join('')}</tbody></table></div><p class="hint">All values in points.<br>¹ Play attention + settling. ² Toileting, feeding, bathing, bedtime and food precautions.</p>${line('Group + space', (r.group + r.environment).toFixed(2) + ' pts')}${line('Total workload', r.workload.toFixed(2) + ' pts')}<p class="hint">Points describe care demands, not a rating of the child.</p></details>${r.warnings.map((w) => `<div class="note">${esc(w)}</div>`).join('')}</div>`;
// What screen readers hear when the price changes.
export const summaryText = (r) =>
  `${money(r.rate)} per hour, ${money(r.each)} each${r.warnings.length ? `, ${plural(r.warnings.length, 'note')}` : ''}`;
// The phone's fixed price bar. Visual shortcut only; the quote card is the
// accessible source.
export const miniHtml = (r) =>
  `<span><strong>${money(r.rate)}</strong>/hr · ${money(r.each)} each</span><button data-scroll="result" tabindex="-1" ${r.warnings.length ? 'class="mini-notes"' : ''}>${r.warnings.length ? `! ${plural(r.warnings.length, 'note')}` : 'Details'}</button>`;
export const comparisonsHtml = (s, r) =>
  scenarios
    .map(([id, title, fn]) => {
      const copy = structuredClone(s);
      fn(copy);
      if (JSON.stringify(copy) === JSON.stringify(s)) return '';
      const q = calculate(copy);
      // Show both changes: one caregiver keeps the team rate but doubles pay.
      return `<button class="compare" data-scenario="${id}"><span>${title}</span><strong>${money(q.rate)}<small> /hr team</small></strong><small>${money(q.each)}/hr each</small><small>Team ${signed(q.rate - r.rate)} · each ${signed(q.each - r.each)}</small>${id === 'baby' ? '<small>Assumes asleep half the time; gets the tasks every child has.</small>' : ''}</button>`;
    })
    .join('');
export function mathHtml(s, r) {
  const w = s.weights;
  return `<div class="formula">Points are relative units, calibrated to the reference session.<br>Included workload/person: ${w.included.toFixed(3)} pts<br>Assigned average/person: ${r.load.toFixed(3)} pts (${(r.load / w.included).toFixed(2)}× the reference)<br>Premium = ${money(w.premium)} × max(0, total points − caregivers × ${w.included.toFixed(3)})<br>Team rate = base × caregivers + premium${s.caregivers === 1 ? ` + ${money(w.soloBonus)} sole caregiver` : ''}<br>Each caregiver’s booking pay rounds to the nearest dollar.</div><p>Reference: five children, two caregivers, two hours, parents handle personal care. Equal work sharing is assumed; actual assignments can be uneven.</p><details ${keep('assumptions')}><summary>All workload assumptions</summary><p>Age-based values change in straight lines between these ages, holding steady past the last one. Supervision points: ${anchors(w.supervision)}. Sleep retains ${pct(w.asleepSupervision)} of supervision. Extra play attention adds ${w.attention.occasional} / ${w.attention.frequent} / ${w.attention.constant} points while awake.</p><p>Settling: minutes entered (capped at the child’s awake time) as a share of the booking, × ${w.settling.holding} for holding or ${w.settling.active} for one-to-one.</p><p>Tasks count only for the children who have them, as a caregiver’s minutes divided by the booking’s, times a factor. Tasks away from the group (toileting, baths, bedtime) count ×${w.away.team} with a team, whose other members stretch to cover, and ×${w.away.solo} for one caregiver, who must manage the group too. Feeding happens with the group and partly overlaps supervision, so it counts ×${w.inRoom}.</p><p>Toileting: ${w.toiletingPerHour.diaper} minutes per hour for diapers, ${w.toiletingPerHour.help} for potty assistance. Meals, baths and bedtimes are one each per child per booking. One meal: ${anchors(w.feedingMinutes)} minutes, plus ${w.allergyMinutes} for a child with food precautions. One bath: ${w.bathMinutes} minutes. One bedtime: ${anchors(w.bedMinutes)} minutes.</p><p>Adult-led group play adds ${w.play.led} points per awake child; frequent mediation ${w.play.conflict}. Awake means each child’s average awake share, since sleep percentages don’t say who naps when. No group adjustment for one child. Divided sightlines add ${pct(w.splitSpace)} of supervision; parents being away adds ${pct(w.soleResponsibility)}, since there’s no backup. Heavy-load prompt appears above ${w.heavyLoad}× the reference load per caregiver; staffing prompts above ${w.maxChildrenPerCaregiver} children or ${w.maxUnder2PerCaregiver} under-2s per caregiver. These are editable-model heuristics, not safety limits.</p></details>`;
}
