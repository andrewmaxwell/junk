// The lil-gui "Weights" panel inside "Formula and assumptions". It's optional,
// so lil-gui loads on the side: if the CDN is unreachable, the calculator
// still works and the panel says why it's absent.
let GUI;
let gui;
let options;
let latest;
export function initWeightsPanel(opts) {
  options = opts;
  import('https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm')
    .then((m) => {
      GUI = m.default;
      showWeights(latest);
    })
    .catch(() => {
      opts.container.innerHTML =
        '<p class="hint">The weights panel couldn’t load (it needs the lil-gui library from the internet).</p>';
    });
}
// Edits mutate `w` in place. The panel is rebuilt only when the weights object
// is replaced (undo, reset, restore, a link), so open folders survive
// ordinary re-renders.
export function showWeights(w) {
  latest = w;
  if (!GUI || !w || gui?.weights === w) return;
  gui?.destroy();
  gui = new GUI({container: options.container, title: 'Weights'});
  gui.weights = w;
  gui.add(w, 'premium', 0, 60, 0.5).name('Premium ($/hr per point)');
  gui.add(w, 'soloBonus', 0, 15, 0.5).name('Sole caregiver ($/hr)');
  gui.add(w, 'soloFree', 0, 1, 0.05).name('Sole caregiver: premium from (×)');
  gui.add(w, 'included', 0.1, 1.5, 0.001).name('Included pts / caregiver');
  gui.add(w, 'heavyLoad', 1, 3, 0.05).name('Heavy-load warning (×)');
  const sup = gui.addFolder('Supervision by age (pts)').close();
  for (const a of w.supervision)
    sup.add(a, 'value', 0, 1, 0.01).name(`${a.months} mo`);
  sup.add(w, 'asleepSupervision', 0, 1, 0.05).name('Kept while asleep');
  sup.add(w, 'soleResponsibility', 0, 1, 0.05).name('Parents away (+share)');
  const care = gui.addFolder('Attention & settling (pts)').close();
  for (const k of ['occasional', 'frequent', 'constant'])
    care.add(w.attention, k, 0, 1, 0.01).name(`Attention: ${k}`);
  care.add(w.settling, 'holding', 0, 1, 0.05).name('Settling: holding');
  care.add(w.settling, 'active', 0, 1, 0.05).name('Settling: active');
  const tasks = gui.addFolder('Tasks (minutes)').close();
  tasks.add(w.away, 'team', 0, 4, 0.05).name('Away factor, team');
  tasks.add(w.away, 'solo', 0, 4, 0.05).name('Away factor, alone');
  tasks.add(w, 'inRoom', 0, 2, 0.05).name('In-room factor');
  tasks.add(w.toiletingPerHour, 'diaper', 0, 30, 1).name('Diapers, min/hr');
  tasks.add(w.toiletingPerHour, 'help', 0, 30, 1).name('Potty help, min/hr');
  for (const a of w.feedingMinutes)
    tasks.add(a, 'value', 0, 60, 1).name(`Meal, ${a.months} mo`);
  tasks.add(w, 'allergyMinutes', 0, 60, 1).name('Food precautions / meal');
  tasks.add(w, 'bathMinutes', 0, 60, 1).name('Bath');
  for (const a of w.bedMinutes)
    tasks.add(a, 'value', 0, 60, 1).name(`Bedtime, ${a.months} mo`);
  const staff = gui.addFolder('Staffing warnings').close();
  staff
    .add(w, 'maxChildrenPerCaregiver', 1, 10, 1)
    .name('Children / caregiver');
  staff.add(w, 'maxUnder2PerCaregiver', 1, 6, 1).name('Under-2s / caregiver');
  gui
    .add({restore: options.onRestore}, 'restore')
    .name('Restore default weights');
  gui.onChange(options.onChange);
}
