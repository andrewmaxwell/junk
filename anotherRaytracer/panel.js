// The settings panel, and what each kind of change does to the image.

import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {frameView, resetCamera} from './camera.js';
import {addObjectsFolder, saveEdits, select} from './editor.js';
import * as renderer from './renderer.js';
import {scenes} from './scenes.js';
import {
  defaults,
  rememberHdr,
  saveSettings,
  settings,
  useSceneDefaults,
  view,
} from './settings.js';
import {loadScene, objectsChanged} from './world.js';

/** Settings changes that need the image started over */
export const changed = () => {
  saveSettings();
  renderer.restart();
};

/** Settings changes that only change how the image is shown */
export const displayChanged = () => {
  saveSettings();
  renderer.redraw();
};

/**
 * Adaptive sampling measures noise as displayed, so after the display gets
 * brighter, tiles that looked done may need more samples
 */
const brightnessChanged = () => {
  displayChanged();
  renderer.keepGoing();
};

/**
 * A lower noise target or more samples just keeps going, without starting
 * over
 */
const keepGoing = () => {
  saveSettings();
  renderer.keepGoing();
};

/** After view.hdr changes */
export const hdrChanged = () => {
  rememberHdr();
  renderer.configure();
  // Lights clamp to the screen's brightest, so start over
  renderer.restart();
};

/** Shows the scene settings.scene names, from the start */
export const showScene = () => {
  loadScene();
  resetCamera();
  select(-1);
  saveEdits();
};

/** Downloads the image as shown, as a PNG */
const saveImage = async () => {
  const samples = renderer.samplesPerPixel;
  const blob = await renderer.capture(frameView());
  if (!blob) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `anotherRaytracer-${settings.scene}-${samples}spp.png`;
  link.click();
  URL.revokeObjectURL(link.href);
};

const gui = new GUI({title: 'Another Raytracer'});
if (innerWidth < 600) gui.close();

/** Puts every setting but the scene back to its default, or the scene's */
const useDefaults = () => {
  Object.assign(settings, defaults, {scene: settings.scene});
  useSceneDefaults();
  saveSettings();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
};

gui.add(settings, 'scene', Object.keys(scenes)).onChange(() => {
  // Each scene starts with its own settings, not the last scene's
  useDefaults();
  showScene();
});
gui.add(view, 'paused').name('pause (space)').listen();
gui.add({reset: resetCamera}, 'reset').name('reset view (r)');
gui
  .add(
    {
      resetSettings: () => {
        useDefaults();
        // Pixel scale may have changed
        renderer.resize();
      },
    },
    'resetSettings',
  )
  .name('reset settings');
gui.add({saveImage}, 'saveImage').name('save image');
gui
  .add(settings, 'dof', 0, 0.05, 0.001)
  .name('depth of field (click to focus)')
  .onChange(changed);
gui.add(settings, 'fog', 0, 0.02, 0.0001).onChange(changed);
gui
  .add(settings, 'exposure', -4, 4, 0.1)
  .name('exposure (stops)')
  .onChange(brightnessChanged);

addObjectsFolder(gui);

// The rest: finer control of light and display, and for comparing methods
// and trading speed for accuracy
const advanced = gui.addFolder('Advanced').close();

const light = advanced.addFolder('Light');
light
  .add(settings, 'fogForward', -0.9, 0.9, 0.05)
  .name('fog scatters forward')
  .onChange(changed);
light.add(settings, 'fogBlue', 0, 1, 0.05).name('fog blue').onChange(changed);
light
  .add(settings, 'dispersion', 0, 5, 0.1)
  .name('glass dispersion')
  .onChange(() => {
    saveSettings();
    // Lasers bend by it too
    objectsChanged();
  });
light
  .add(settings, 'detail', 0, 3, 0.1)
  .name('surface detail')
  .onChange(changed);

const display = advanced.addFolder('Display');
display
  .add(settings, 'denoise')
  .name('denoise (d)')
  .onChange(displayChanged)
  .listen();
display
  .add(settings, 'glow', 0, 0.2, 0.005)
  .name('lens glow')
  .onChange(displayChanged);
display.add(settings, 'vignette', 0, 1, 0.05).onChange(displayChanged);
display
  .add(settings, 'grain', 0, 0.1, 0.005)
  .name('film grain')
  .onChange(displayChanged);
display
  .add(settings, 'aberration', 0, 0.01, 0.0005)
  .name('color fringes')
  .onChange(displayChanged);
display
  .add(settings, 'tone', {
    filmic: 'filmic',
    'ease into white': 'ease',
    clip: 'clip',
  })
  .name('SDR tone curve (t)')
  .onChange(changed)
  .listen();
display.add(view, 'hdr').name('HDR (h)').onChange(hdrChanged).listen();
display
  .add(settings, 'headroom', 1, 16, 0.5)
  .name('HDR headroom')
  .onChange(changed);

const sampling = advanced.addFolder('Sampling');
sampling
  .add(settings, 'sampling', {
    'both (MIS)': 'mis',
    'aim at lights': 'light',
    'random bounces': 'bsdf',
  })
  .name('method')
  .onChange(changed);
sampling
  .add(settings, 'clamp', 0, 100, 1)
  .name('indirect clamp (0: none)')
  .onChange(changed);
sampling
  .add(settings, 'scale', 0.25, 2, 0.25)
  .name('pixel scale')
  .onChange(() => {
    saveSettings();
    renderer.resize();
  });
sampling
  .add(settings, 'noise', 0, 0.1, 0.005)
  .name('noise target (0: none)')
  .onChange(keepGoing);
sampling
  .add(settings, 'spp', 16, 16384, 16)
  .name('max spp')
  .onChange(keepGoing);
sampling
  .add(view, 'showTiles')
  .name('show refining tiles (n)')
  .onChange(renderer.redraw)
  .listen();
