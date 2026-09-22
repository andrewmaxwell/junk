import {params, sharedRanges, speciesRanges} from './params.js';
import {presets} from './presets.js';

const CUSTOM = 'custom';
const title = (s) => s[0].toUpperCase() + s.slice(1);

export const createGui = ({
  reset,
  clearDrawing,
  onChange,
  applyPreset,
  randomize,
  copyLink,
  isCustom,
}) => {
  const gui = new /** @type {any} */ (window).dat.GUI();
  const controllers = [];

  const actions = {
    preset: isCustom ? CUSTOM : Object.keys(presets)[0],
    randomize: () => {
      randomize();
      markCustom();
    },
    'copy link': async () => {
      const copied = await copyLink().then(
        () => true,
        () => false,
      );
      copyButton.name(
        copied ? 'link copied!' : "couldn't copy, use the address bar",
      );
      setTimeout(() => copyButton.name('copy link'), 2000);
    },
    reset,
    'clear drawing': clearDrawing,
  };
  const presetMenu = gui
    .add(actions, 'preset', [...Object.keys(presets), CUSTOM])
    .onChange((name) => name !== CUSTOM && applyPreset(name));
  gui.add(actions, 'randomize');
  const copyButton = gui.add(actions, 'copy link');
  gui.add(actions, 'reset');
  gui.add(actions, 'clear drawing');

  /** Shows "custom" in the preset menu once the species no longer match a preset. */
  const markCustom = () => {
    actions.preset = CUSTOM;
    presetMenu.updateDisplay();
  };

  const add = (folder, target, key, range, isSpecies) => {
    const c = range
      ? folder.add(target, key, ...range)
      : folder.addColor(target, key);
    c.onChange(() => {
      if (isSpecies) markCustom();
      onChange();
    });
    controllers.push(c);
  };

  params.species.forEach((sp, i) => {
    const folder = gui.addFolder(`Species ${i + 1}`);
    add(folder, sp, 'color', null, true);
    for (const [key, range] of Object.entries(speciesRanges)) {
      add(folder, sp, key, range, true);
    }
  });
  for (const [group, ranges] of Object.entries(sharedRanges)) {
    const folder = gui.addFolder(title(group));
    for (const [key, range] of Object.entries(ranges)) {
      add(folder, params[group], key, range, false);
    }
  }

  /** Redraws every control after params change in code. */
  const refresh = () => controllers.forEach((c) => c.updateDisplay());
  return {refresh, markCustom};
};
