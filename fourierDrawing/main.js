// based on https://js1k.com/2018-coins/details/3124

import {debounce} from '../misc/debounce.js';
import {pointsToGears} from './pointsToGears.js';
import {render} from './render.js';

const canvas = document.querySelector('canvas');

const params = {speed: 0.02};

let time = 0;
let gears = [];
let points =
  '-236,-162;-218,-172;-201,-178;-183,-182;-166,-186;-148,-191;-128,-200;-112,-206;-86,-215;-56,-222;-38,-224;-21,-225;8,-225;25,-224;42,-217;52,-201;46,-184;32,-168;16,-154;-2,-144;-16,-136;-31,-128;-45,-119;-34,-102;-14,-95;9,-92;30,-91;49,-94;67,-98;83,-99;99,-100;119,-100;140,-97;162,-89;179,-79;190,-67;194,-50;195,-34;190,-17;177,-7;155,4;140,11;123,18;103,24;82,31;64,37;37,43;20,45;2,43;-15,39;-33,37;-50,37;-68,37;-93,42;-109,50;-111,69;-108,85;-97,101;-77,108;-58,110;-33,111;-7,113;12,114;33,116;53,120;72,124;91,130;113,137;131,141;148,148;162,164;166,186;165,203;150,219;127,229;112,235;83,245;57,253;40,257;20,260;-3,262;-29,264;-56,264;-81,260;-101,254;-117,244;-128,231;-137,216;-142,199;-145,180;-147,159;-151,141;-167,123;-191,108;-206,100;-228,91;-248,86;-264,84;-281,87;-295,96;-312,105;-329,115;-347,123;-363,128;-390,138;-412,145;-436,151;-461,156;-478,158;-502,159;-519,157;-538,155;-558,153;-575,151;-596,145;-610,133;-617,118;-619,94;-617,74;-609,58;-593,48;-577,41;-558,39;-536,39;-519,40;-497,43;-478,46;-457,48;-438,48;-421,43;-404,31;-393,16;-389,-3;-390,-19;-404,-36;-420,-44;-441,-48;-460,-48;-474,-37;-489,-28;-512,-23;-532,-26;-544,-40;-551,-55;-564,-75;-573,-97;-575,-114;-573,-130;-559,-144;-541,-155;-520,-162;-504,-164;-479,-164;-460,-164;-442,-161;-426,-154;-412,-145;-400,-133;-385,-119;-370,-108;-355,-97;-343,-86;-327,-79;-306,-76;-288,-76;-272,-81;-267,-99;-263,-117;-260,-133;-254,-148;-244,-161'
    .split(';')
    .map((p) => ({x: +p.split(',')[0], y: +p.split(',')[1]}));

const restart = debounce(() => {
  // console.log(points);
  gears = pointsToGears(points);
  time = 0;
});

const loop = () => {
  render(canvas, points, gears, time);
  time += params.speed;
  requestAnimationFrame(loop);
};

restart();
loop();

const clear = () => {
  points = [];
  restart();
};

const mouseMove = (e) => {
  const x = e.pageX - canvas.width / 2;
  const y = e.pageY - canvas.height / 2;
  const last = points[points.length - 1];
  if (last && Math.hypot(x - last.x, y - last.y) <= 8) return;
  points.push({x, y});
  gears = [];
  restart();
};

canvas.onmousedown = canvas.ontouchstart = clear;
canvas.addEventListener('mousemove', (e) => {
  if (e.buttons) mouseMove(e);
});
canvas.addEventListener('touchmove', (e) => mouseMove(e.touches[0]));

const gui = new window.dat.GUI();
gui.add(params, 'speed', 0, 1);
gui.add({restart}, 'restart');
gui.add({clear}, 'clear');
