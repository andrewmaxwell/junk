import {graphic} from './graphic.js';
import {imgGraphic} from './imgGraphic.js';

let width = 800,
  height = 580,
  extra = 20,
  mouseX,
  mouseY,
  gunX = width / 2,
  gunY = height / 2,
  killLife = 5,
  numColors = 4,
  moreNum,
  projectileTime = 40,
  starColor = Math.floor(Math.random() * numColors),
  health,
  maxHealth = 100,
  rank;
let canvas;
let T;
let mouseDown,
  menu = true,
  finished,
  shooting,
  clickedButton = false,
  begun = false,
  viewHighScores = false,
  gameOverScreen = false,
  sound = true;
let objRad = 25,
  gravity = 1000000,
  shootSpeed = 600,
  bounce = 0.5,
  spinSpeed = 20,
  entry,
  startingEntry = 1,
  entryIncrement,
  incrementSpeed = 0.03,
  waddleSpeed = 0.75,
  waddleSize = 0.1,
  gunAngle = 0,
  armAngle = 0,
  armSpeed = 25,
  maxSpeed = objRad * 12.5,
  frameRate = 15,
  killSpeed = 50,
  wallRepel = 30,
  friction = 0.5,
  maxFrameRate = 50,
  blastRad = objRad * 10,
  newBombTimer;

function getHSBColor(h, s, v) {
  let r, g, b, i, f, p, q, t;
  if (arguments.length === 1) {
    (s = h.s), (v = h.v), (h = h.h);
  }
  i = Math.floor(h * 6);
  f = h * 6 - i;
  p = v * (1 - s);
  q = v * (1 - f * s);
  t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      (r = v), (g = t), (b = p);
      break;
    case 1:
      (r = q), (g = v), (b = p);
      break;
    case 2:
      (r = p), (g = v), (b = t);
      break;
    case 3:
      (r = p), (g = q), (b = v);
      break;
    case 4:
      (r = t), (g = p), (b = v);
      break;
    case 5:
      (r = v), (g = p), (b = q);
      break;
  }
  return `rgb(${Math.floor(r * 256)},${Math.floor(g * 256)},${Math.floor(
    b * 256
  )})`;
}

const colors = [
  getHSBColor(0, 0, 0.25),
  getHSBColor(0.66, 0.5, 1),
  'white',
  getHSBColor(0.9, 0.5, 1)
];

const penguin = new imgGraphic(
  Math.floor(objRad * 2),
  -0.2,
  0.2,
  10,
  colors,
  0.4,
  '7 -17920 6 461 347 484 351 503 362 474 371 443 372 423 353 ,-17920 6 349 347 326 351 307 362 336 371 367 372 387 353 ,-16777216 31 397 90 369 98 346 117 330 152 320 181 299 216 288 268 290 278 302 277 310 261 309 301 315 325 330 342 351 353 376 358 402 359 430 359 458 355 472 348 483 340 493 319 495 302 492 254 501 269 511 267 516 261 498 214 473 178 464 147 448 115 425 96 ,v 34 404 350 381 348 361 342 345 334 333 324 325 309 322 294 323 264 333 220 345 185 342 169 343 152 349 135 357 122 366 118 374 119 385 134 393 164 410 165 414 135 421 119 431 117 438 120 447 134 453 146 453 163 451 178 470 225 481 267 483 302 472 325 462 336 450 343 425 348 ,-17920 6 372 164 401 160 431 162 426 170 403 180 383 172 ,-16777216 3 421 156 434 156 427 146 ,-16777216 3 369 156 382 156 375 146 ,'
);
const star = new graphic(
  '3 -16777216 12 409 147 381 225 385 293 248 298 327 324 394 317 405 451 426 382 418 305 552 300 477 276 409 283 ,v 20 409 147 389 226 395 295 307 279 221 273 248 298 330 311 395 305 385 392 388 474 405 451 415 379 407 303 487 316 575 325 552 300 478 284 406 294 423 219 433 123 ,-2171170 8 407 253 396 294 352 295 394 305 397 344 407 303 447 301 408 291 ,'
);
const intStar = new imgGraphic(
  Math.floor(objRad * 2),
  0,
  2 * Math.PI,
  20,
  colors,
  0,
  '3 -16777216 12 409 147 381 225 385 293 248 298 327 324 394 317 405 451 426 382 418 305 552 300 477 276 409 283 ,v 20 409 147 389 226 395 295 307 279 221 273 248 298 330 311 395 305 385 392 388 474 405 451 415 379 407 303 487 316 575 325 552 300 478 284 406 294 423 219 433 123 ,-2171170 8 407 253 396 294 352 295 394 305 397 344 407 303 447 301 408 291 ,'
);
const ninja = new graphic(
  '4 -16777216 40 388 237 394 221 412 218 426 231 433 269 446 278 458 291 515 324 577 287 552 305 515 350 463 325 468 344 491 363 532 406 561 415 616 450 648 472 648 482 642 491 608 463 543 443 533 435 504 428 466 398 377 403 386 463 390 472 387 479 333 479 327 469 368 462 349 405 346 387 350 378 362 372 422 363 401 316 397 293 394 260 ,-12698050 57 388 237 394 221 412 218 426 231 419 242 401 251 404 258 425 252 424 267 415 275 400 267 407 293 425 284 435 273 458 291 515 324 544 294 542 278 547 270 550 283 569 262 577 287 561 303 550 309 514 343 446 313 431 323 419 325 439 331 459 349 490 369 532 406 562 419 616 450 648 472 648 482 642 491 608 463 548 440 535 432 507 423 466 387 370 399 386 463 390 472 387 479 363 474 334 478 327 469 375 459 353 403 353 388 362 372 430 365 405 315 395 279 394 260 ,-1 3 416 246 423 242 423 250 ,-1 3 400 250 407 246 407 254 ,'
);
const arm = new graphic(
  '2 -16777216 5 396 294 404 302 462 309 541 293 549.3072 296.87354 ,-12698050 16 394.02032 279.20056 386 282 387 293 393 298 405.3309 301.00116 449.5855 302.80795 464.15207 305.71698 523.8265 298.2961 551.0369 297.01218 556.092 277.3943 529.3786 284.82898 530.9373 276.24823 519.5862 287.52625 468.4116 285.16455 457.75412 287.79257 445.8518 284.22656 ,'
);
const surface = new graphic(
  '1 -4994323 15 441.1239 278.63965 451.5863 193.9888 405.93192 107.435974 417.34546 9.46936 410.6876 -155.07661 436.3682 -225.46048 438.27048 -121.78694 482.9738 -61.865982 478.21808 69.39081 534.33514 197.79312 604.71893 234.888 917.64075 265.32446 775.9226 284.34674 661.7864 277.68896 557.1624 291.00446 ,'
);
const bomb1 = new graphic(
  '6 -9803158 8 368 127 375 119 393 113 411 115 424 118 429 124 417 138 379 139 ,-12500671 23 364 154 322 171 284 201 259 246 249 309 262 364 297 411 346 442 405 452 459 440 507 410 529 383 545 346 550 308 549 282 543 255 519 205 481 173 435 154 430 124 415 131 383 132 367 127 ,-9803158 18 271 347 262 299 267 249 279 225 292 207 313 189 336 174 354 168 368 166 388 172 411 170 397 194 363 207 335 229 312 256 289 299 285 337 296 393 ,-9803158 7 412 439 456 429 498 400 528 359 539 310 511 355 470 402 ,-1584721 5 389 124 403 126 413 122 409 93 391 94 ,-196709 12 400 95 351 113 387 88 334 81 388 76 348 35 396 71 414 21 409 74 457 72 413 87 452 112 ,'
);
const bomb2 = new graphic(
  '6 -9803158 8 368 127 375 119 393 113 411 115 424 118 429 124 417 138 379 139 ,-12500671 23 364 154 322 171 284 201 259 246 249 309 262 364 297 411 346 442 405 452 459 440 507 410 529 383 545 346 550 308 549 282 543 255 519 205 481 173 435 154 430 124 415 131 383 132 367 127 ,-9803158 18 271 347 262 299 267 249 279 225 292 207 313 189 336 174 354 168 368 166 388 172 411 170 397 194 363 207 335 229 312 256 289 299 285 337 296 393 ,-9803158 7 412 439 456 429 498 400 528 359 539 310 511 355 470 402 ,-1584721 5 389 124 403 126 413 122 409 93 391 94 ,-196709 14 401 98 366 124 388 91 335 99 387 82 336 49 393 74 388 23 407 74 454 49 411 84 465 91 417 93 444 120 ,'
);

let obj = [];
let index;

let maxBursts = 500;
let burst = [];
let bIndex;

let highscores;

let shadow = 'rgba(0,0,0,0.75)',
  ice = getHSBColor(0.6, 0.2, 1),
  fontColor = getHSBColor(0.6, 0.7, 0.5),
  orange = 'rgb(255, 188, 0)';

let logo;

let name = 'Andrew';

let gameTimer;

let bombs;
let shootBomb;

let kills;
let killsLength = 50,
  kIndex,
  newBombNum = 10,
  sum;

let pop = [];
let explode, swoosh;

const getImage = url => {
  const img = document.createElement('img');
  img.src = url;
  return img;
};

const getAudioClip = url => ({
  play: () => url
}); // TODO

const init = () => {
  canvas = document.querySelector('canvas');
  canvas.width = width;
  canvas.height = height + extra;
  T = canvas.getContext('2d');
  logo = getImage('http://www.amaxwellphoto.com/penguin-popper.png');
  pop[0] = getAudioClip('http://www.amaxwellphoto.com/penguin/pop1.wav');
  pop[1] = getAudioClip('http://www.amaxwellphoto.com/penguin/pop2.wav');
  pop[2] = getAudioClip('http://www.amaxwellphoto.com/penguin/pop3.wav');
  explode = getAudioClip('http://www.amaxwellphoto.com/penguin/explode.wav');
  swoosh = getAudioClip('http://www.amaxwellphoto.com/penguin/swoosh.wav');
};

const stringWidth = str => T.measureText(str).width;
const stringBoundsContain = (str, x, y) =>
  x > 0 && y > 0 && x < stringWidth(str) && y < parseInt(T.font);

const showHighScores = () => {
  T.fillStyle = fontColor;
  T.font = '42px Futura';
  T.fillText(
    'Leader Boards',
    width / 2 - stringWidth('Leader Boards') / 2,
    5 + 42
  );
  T.font = '18px Futura';
  let margin = 30,
    top = 75,
    bottom = 75,
    lines = 15,
    spacing = (height - top - bottom) / lines,
    shiftDown = top + spacing,
    tab1 = 80,
    tab2 = 125,
    shiftLeft = margin,
    line = 0;
  let current = '',
    mode = 'time',
    name = '',
    time = '';
  for (let i = 0; i < highscores.length; i++) {
    if (highscores.charAt(i) == ' ') {
      if (mode == 'time') {
        time = current;
        mode = 'name';
      } else if (mode == 'name') {
        name = current;
        mode = 'date';
      } else if (mode == 'date') {
        let timeSince = Date.now() / 1000 - parseFloat(current);
        let timeAgo;
        if (timeSince < 60) timeAgo = timeSince + ' seconds';
        else if (timeSince < 60 * 60)
          timeAgo = Math.round(timeSince / 60) + ' minutes';
        else if (timeSince < 60 * 60 * 24)
          timeAgo = Math.round(timeSince / (60 * 60)) + ' hours';
        else timeAgo = Math.round(timeSince / (60 * 60 * 24)) + ' days';
        T.fillText(toTime(parseInt(time)), shiftLeft, shiftDown);
        T.fillText(name, shiftLeft + tab1, shiftDown);
        T.fillText(timeAgo + ' ago', shiftLeft + tab1 + tab2, shiftDown);
        line++;
        if (line == lines) {
          shiftLeft = width / 2;
          shiftDown = top + spacing;
        } else shiftDown += spacing;
        mode = 'time';
      }
      current = '';
    } else current += highscores.charAt(i);
  }
  T.font = '24px Futura';
  if (button('back', width / 2 - stringWidth('back') / 2, height - 10, false)) {
    begun = false;
    viewHighScores = false;
  }
};
const reset = () => {
  index = 0;
  bIndex = 0;
  moreNum = 12;
  entry = 0;
  entryIncrement = startingEntry;
  finished = false;
  shooting = false;
  health = maxHealth;
  gameTimer = 0;
  bombs = 3;
  shootBomb = false;
  kills = [];
  kIndex = 0;
  sum = 0;
  newBombTimer = 0;
};
const getAngle = (x1, y1, x2, y2) =>
  x2 < x1
    ? Math.atan((y2 - y1) / (x2 - x1)) + 3.1415926536
    : Math.atan((y2 - y1) / (x2 - x1));
const dist = (x1, y1, x2, y2) =>
  Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
const sq = x => x * x;
const button = (str, xc, yc, cond) => {
  let over = stringBoundsContain(str, mouseX - xc, mouseY - yc);
  T.fillStyle = 'black';
  T.fillText(str, xc + 1, yc + 1);
  if (over) T.fillStyle = fontColor;
  else if (cond) T.fillStyle = 'green';
  else T.fillStyle = orange;
  T.fillText(str, xc, yc);
  if (over && mouseDown) clickedButton = true;
  return over && mouseDown;
};

window.addEventListener('mousemove', e => {
  mouseX = e.offsetX;
  mouseY = e.offsetY;
});
window.addEventListener('mousedown', () => {
  mouseDown = true;
});
window.addEventListener('keyup', e => {
  if (e.key === ' ' && bombs > 0) {
    shootBomb = !shootBomb;
  }
  //		else if (key==KeyEvent.VK_M){
  //			for (int i=0; i<moreNum; i++){
  //				obj[index++]=new Obj();
  //			}
  //		}
  //		else if (key==KeyEvent.VK_B && bombs>0) isBomb=!isBomb;
  //		else if (key==KeyEvent.VK_UP) maxFrameRate++;
  //		else if (key==KeyEvent.VK_DOWN && maxFrameRate>1) maxFrameRate--;
  if (menu && !begun && !viewHighScores && !gameOverScreen) {
    const c = e.keyCode;
    if (e.key == 'Backspace' && name.length > 0)
      name = name.substring(0, name.length - 1);
    else if (((c > 64 && c <= 90) || (c > 96 && c <= 122)) && name.length <= 12)
      name += e.key;
  }
});

window.addEventListener('mouseup', () => {
  mouseDown = false;
  if (clickedButton) clickedButton = false;
  else if (!finished && !menu) shooting = true;
});

class Obj {
  constructor(x, y, xx, yy) {
    this.angle = 0;
    this.newTime = 0;
    this.kill = false;
    this.dead = false;
    this.projectile = false;
    this.waddleLeft = false;
    this.isBomb = false;
    if (!arguments.length) {
      this.attr = Math.floor(Math.random() * numColors);
      this.newTime = 2 * objRad;
      let xx,
        yy,
        rand = Math.random();
      if (rand < 0.25) {
        xx = -objRad;
        yy = Math.random() * height;
      } else if (rand < 0.5) {
        xx = width + objRad;
        yy = Math.random() * height;
      } else if (rand < 0.75) {
        xx = Math.random() * width;
        yy = -objRad;
      } else {
        xx = Math.random() * width;
        yy = height + objRad;
      }
      this.xc = xx;
      this.yc = yy;
    } else {
      this.xc = x;
      this.yc = y;
      this.xs = xx;
      this.ys = yy;
      this.attr = starColor;
      this.projectile = true;
      this.life = projectileTime;
      let newColor;
      do {
        newColor = Math.floor(Math.random() * numColors);
      } while (newColor == starColor);
      starColor = newColor;
      if (shootBomb) {
        this.isBomb = true;
        shootBomb = false;
        bombs--;
      }
      if (!this.isBomb && sound) swoosh.play();
    }
  }
  draw() {
    const {projectile, isBomb, xc, yc, angle, attr} = this;
    if (projectile && !isBomb) intStar.draw(T, xc, yc, angle, attr);
    else if (isBomb) {
      if ((Date.now() / 100) % 2 == 0)
        bomb1.draw(T, xc, yc, objRad, angle, false);
      else bomb2.draw(T, xc, yc, objRad, angle, false);
    } else penguin.draw(T, xc, yc, angle, attr);
  }
  increment() {
    this.xc += this.xs;
    this.yc += this.ys;
  }
  move() {
    if (this.projectile) {
      this.angle += spinSpeed / frameRate;
    } else {
      if (Math.abs(this.xs) > 0.1 || Math.abs(this.ys) > 0.1) {
        if (this.waddleLeft) {
          if (this.angle - waddleSpeed / frameRate < -waddleSize) {
            this.angle = -waddleSize;
            this.waddleLeft = false;
          } else this.angle -= waddleSpeed / frameRate;
        } else {
          if (this.angle + waddleSpeed / frameRate > waddleSize) {
            this.angle = waddleSize;
            this.waddleLeft = true;
          } else this.angle += waddleSpeed / frameRate;
        }
      } else {
        if (this.angle - waddleSpeed / frameRate >= 0)
          this.angle -= waddleSpeed / frameRate;
        else if (this.angle + waddleSpeed / frameRate <= 0)
          this.angle += waddleSpeed / frameRate;
      }
      this.xs *= 1 - friction / frameRate;
      this.ys *= 1 - friction / frameRate;
      let ang = getAngle(gunX, gunY, this.xc, this.yc),
        gunDist = sq(gunX - this.xc) + sq(gunY - this.yc);
      this.xs += ((gravity / sq(frameRate)) * Math.cos(ang)) / gunDist;
      this.ys += ((gravity / sq(frameRate)) * Math.sin(ang)) / gunDist;
      let fix = maxSpeed / frameRate / Math.sqrt(sq(this.xs) + sq(this.ys));
      if (fix < 1) {
        this.xs *= fix;
        this.ys *= fix;
      }
    }
  }
  walls() {
    const {newTime, projectile} = this;
    if (this.yc + objRad > height + newTime) {
      this.yc = height + newTime - objRad;
      if (newTime > 0) this.ys -= wallRepel / frameRate;
      else this.ys *= -bounce;
      if (projectile) this.life = 0;
    }
    if (this.yc - objRad < -newTime) {
      this.yc = -newTime + objRad;
      if (newTime > 0) this.ys += wallRepel / frameRate;
      else this.ys *= -bounce;
      if (projectile) this.life = 0;
    }
    if (this.xc + objRad > width + newTime) {
      this.xc = width + newTime - objRad;
      if (newTime > 0) this.xs -= wallRepel / frameRate;
      else this.xs *= -bounce;
      if (projectile) this.life = 0;
    }
    if (this.xc - objRad < -newTime) {
      this.xc = -newTime + objRad;
      if (newTime > 0) this.xs += wallRepel / frameRate;
      else this.xs *= -bounce;
      if (projectile) this.life = 0;
    }
    if (newTime > 0) this.newTime -= wallRepel / frameRate;
  }
  repel() {
    for (let i = 0; i < index; i++) {
      if (obj[i] != this && !obj[i].isBomb) {
        let x1 = this.xc,
          y1 = this.yc,
          x2 = obj[i].xc,
          y2 = obj[i].yc;
        let dist = Math.sqrt(
          sq(x1 + this.xs - x2 - obj[i].xs) + sq(y1 + this.ys - y2 - obj[i].ys)
        );
        if (
          this.attr == obj[i].attr &&
          !this.isBomb &&
          (((this.projectile || obj[i].projectile) && dist < 2 * objRad) ||
            ((this.kill || obj[i].kill) && dist < 2.5 * objRad))
        ) {
          if (!this.kill) {
            this.life = killLife;
            this.kill = true;
          }
          if (!obj[i].kill) {
            obj[i].life = killLife;
            obj[i].kill = true;
          }
        }
        if (2 * objRad - dist > 0 && dist > 0) {
          if (
            this.attr != obj[i].attr ||
            (!this.projectile && !obj[i].projectile)
          ) {
            let fix = (objRad / dist - 0.5) / 2;
            this.xs += (x1 - x2) * fix;
            this.ys += (y1 - y2) * fix;
            obj[i].xs += (x2 - x1) * fix;
            obj[i].ys += (y2 - y1) * fix;
            this.xc += (x1 - x2) * fix;
            this.yc += (y1 - y2) * fix;
            obj[i].xc += (x2 - x1) * fix;
            obj[i].yc += (y2 - y1) * fix;
          }
          if (this.isBomb) {
            if (sound) explode.play();
            for (let k = 0; k < (maxBursts - bIndex) / 3; k++) {
              burst[bIndex++] = new Burst(this);
            }
            for (let j = 0; j < index; j++) {
              if (
                !obj[j].projectile &&
                dist(this.xc, this.yc, obj[j].xc, obj[j].yc) < blastRad
              ) {
                obj[j].dead = true;
                for (let k = 0; k < (maxBursts - bIndex) / 10; k++) {
                  burst[bIndex++] = new Burst(obj[j]);
                }
                if (sound) pop[Math.floor(Math.random() * 3)].play();
              }
            }
            this.dead = true;
          }
        }
      }
    }
    if (!this.dead && (this.projectile || this.kill)) {
      if (this.life <= 0) {
        this.dead = true;
        if (!this.isBomb && this.projectile && !this.kill)
          for (let i = 0; i < moreNum; i++) obj[index++] = new Obj();
        else if (!this.projectile) {
          for (let i = 0; i < (maxBursts - bIndex) / 10; i++) {
            burst[bIndex++] = new Burst(this);
          }
          if (sound) pop[Math.floor(Math.random() * 3)].play();
          kills[kIndex]++;
        }
      } else this.life -= killSpeed / frameRate;
    }
  }
}

let burstGravity = 1000,
  burstSpeed = 500,
  burstRad = Math.floor(objRad / 3),
  shrinkSpeed = 1.2;

class Burst {
  constructor(b) {
    this.fromBomb = false;
    this.xc = b.xc;
    this.yc = b.yc;
    this.attr = b.attr;
    let ang = Math.random() * 2 * Math.PI,
      sp = Math.random() * burstSpeed;
    this.rad = burstRad;
    if (b.isBomb) {
      this.fromBomb = true;
      sp *= 2;
    }
    this.xs = sp * Math.cos(ang);
    this.ys = sp * Math.sin(ang);
  }
  draw() {
    this.rad *= 1 - shrinkSpeed / frameRate;
    this.ys += burstGravity / frameRate;
    this.xc += this.xs / frameRate;
    this.yc += this.ys / frameRate;

    const {xc, yc, rad, attr, fromBomb} = this;
    T.fillStyle = shadow;
    T.fillOval(xc - rad + 1, yc - rad + 2, 2 * rad, 2 * rad);
    if (fromBomb) T.fillStyle = orange;
    else T.fillStyle = colors[attr];
    T.fillOval(xc - rad, yc - rad, 2 * rad, 2 * rad);
  }
  alive() {
    const {rad, xc, yc} = this;
    return rad > 0.5 && xc > 0 && xc < width && yc < height && yc > 0;
  }
}

const toTime = n => {
  let result = Math.floor(n / 60) + ':';
  if (n % 60 < 10) result += '0';
  return result + Math.floor(n % 60);
};

const showGameOverScreen = () => {
  T.fillStyle = shadow;
  T.fillRect(0, 0, width, height);
  T.fillStyle = 'white';
  T.font = '42px Futura';
  let s1 = "You've been trampled. You dead.",
    s2 =
      'Final Time: ' +
      toTime(Math.floor(gameTimer / 1000)) +
      '   Rank: ' +
      rank;
  T.fillText(s1, width / 2 - stringWidth(s1) / 2, height / 3);
  T.fillText(s2, width / 2 - stringWidth(s2) / 2, height / 3 + 42 + 5);
  if (
    button(
      'Try Again',
      width / 2 - stringWidth('Try Again') / 2,
      (height / 3) * 2,
      false
    )
  ) {
    reset();
    menu = false;
    gameOverScreen = false;
  }
  if (
    button(
      'Leader Boards',
      width / 2 - stringWidth('Leader Boards') / 2,
      (height / 3) * 2 + 60,
      false
    )
  ) {
    viewHighScores = true;
    gameOverScreen = false;
  }
};
const mainMenu = () => {
  T.drawImage(logo, width / 2 - logo.width / 2, 35);
  let s = '';
  T.font = '24px Futura';
  T.fillStyle = fontColor;
  let str =
    'How long can you survive? Defend yourself from the onslaught of penguins by hitting them with like-colored ninja stars. Press the space bar for bombs! ';
  let shiftDown = height / 2 + 50,
    lineLength = 400;
  for (let j = 0; j < str.length; j++) {
    if (str.charAt(j) == ' ' && stringWidth(s) >= lineLength) {
      T.fillText(s, width / 2 - stringWidth(s) / 2, shiftDown);
      shiftDown += 25;
      s = '';
    } else s += str.charAt(j);
  }
  T.fillText(s, width / 2 - stringWidth(s) / 2, shiftDown);
  shiftDown += 25;
  if (begun) {
    if (
      button('resume', width / 2 - stringWidth('resume') / 2, shiftDown, false)
    )
      menu = false;
    shiftDown += 25;
    if (
      button(
        'restart',
        width / 2 - stringWidth('restart') / 2,
        shiftDown,
        false
      )
    ) {
      reset();
      menu = false;
    }
    shiftDown += 25;
    if (sound) {
      if (
        !clickedButton &&
        button(
          'sound off',
          width / 2 - stringWidth('sound off') / 2,
          shiftDown,
          false
        )
      )
        sound = false;
    } else {
      if (
        !clickedButton &&
        button(
          'sound on',
          width / 2 - stringWidth('sound on') / 2,
          shiftDown,
          false
        )
      )
        sound = true;
    }
    shiftDown += 25;
    if (button('quit', width / 2 - stringWidth('quit') / 2, shiftDown, false))
      begun = false;
  } else {
    shiftDown += 15;
    if ((Date.now() / 500) % 2 == 0)
      T.fillRect(
        width / 4 + stringWidth('Your name: ' + name),
        shiftDown + 3 - 25 + 5,
        2,
        25
      );
    T.fillText('Your name: ' + name, width / 4, shiftDown);
    if (name.length > 0) {
      if (
        button(
          'Start!',
          (width / 4) * 3 - stringWidth('Start!'),
          shiftDown,
          false
        )
      ) {
        reset();
        menu = false;
        begun = true;
      }
    }
    shiftDown += 40;
    if (
      button(
        'View the leader boards!',
        width / 2 - stringWidth('View the leader boards!') / 2,
        shiftDown,
        false
      )
    ) {
      viewHighScores = true;
    }
  }
};
const hud = () => {
  T.font = '18px Futura';
  let tab = 5,
    spacing = 15;
  if (button('pause', tab, height + extra - 5, false)) menu = true;
  tab += stringWidth('pause') + spacing;

  T.fillStyle = colors[1];
  let ticWidth = 2,
    ticDist = 2;
  T.fillText('HEALTH', tab, height + extra - 3);
  tab += stringWidth('HEALTH') + 5;
  for (let i = 0; i < health; i++) {
    T.fillRect(tab + i * (ticWidth + ticDist), height + 2, ticWidth, extra - 4);
  }
  tab += health * (ticWidth + ticDist) + 3;
  T.fillText(health + '%', tab, height + extra - 3);

  let s = 'Time: ' + toTime(gameTimer / 1000);
  tab =
    width -
    stringWidth(s) -
    2 * spacing -
    stringWidth('x' + bombs) -
    (extra / 4) * 3;

  if (newBombTimer > 0) newBombTimer -= 0.02;
  bomb1.draw(
    T,
    tab,
    height + extra / 2 - 2 * newBombTimer * height,
    (((objRad * newBombTimer + 1) * extra) / 5) * 4,
    Math.PI / 4,
    false
  );
  tab += (extra / 4) * 3;
  T.fillStyle = 'white';
  T.fillText('x' + bombs, tab, height + extra - 3);

  T.fillText(s, width - stringWidth(s) - spacing, height + extra - 3);
};

const loop = () => {
  let frameTimer = Date.now();
  T.fillStyle = ice;
  T.fillRect(0, 0, width, height + extra);
  surface.draw(T, 0, height - extra, height / 2, 0, false);
  surface.draw(T, width, extra, height / 2, Math.PI, false);
  if (!menu || gameOverScreen) {
    sum -= kills[kIndex];
    kills[kIndex] = 0;
    for (let i = 0; i < index; i++) obj[i].draw();
    for (let i = 0; i < bIndex; i++) burst[i].draw();
    for (let i = 0; i < index; i++) obj[i].increment();
    for (let i = 0; i < index; i++) obj[i].move();
    // for (let i = 0; i < index; i++) obj[i].repel();
    for (let i = 0; i < index; i++) obj[i].walls();
    for (let i = 0; i < index; i++) {
      if (obj[i].dead) {
        index--;
        obj[i] = obj[index];
        i--;
      }
    }
    for (let i = 0; i < bIndex; i++) {
      if (!burst[i].alive()) {
        bIndex--;
        burst[i] = burst[bIndex];
        i--;
      }
    }
    sum += kills[kIndex];
    if (sum > newBombNum) {
      bombs++;
      for (let i = 0; i < killsLength; i++) kills[i] = 0;
      sum = 0;
      newBombTimer = 0.5;
    }
    kIndex = (kIndex + 1) % killsLength;
  }
  if (!menu) {
    if (begun) {
      if (!finished) {
        ninja.draw(T, gunX, gunY, objRad * 3, 0, false);
        gunAngle = getAngle(gunX, gunY, mouseX, mouseY);
        if (shooting) {
          armAngle += armSpeed / frameRate;
          if (armAngle >= Math.PI) {
            obj[index++] = new Obj(
              gunX + objRad * 1.5 * Math.cos(gunAngle),
              gunY + objRad * 1.5 * Math.sin(gunAngle),
              (shootSpeed / frameRate) * Math.cos(gunAngle),
              (shootSpeed / frameRate) * Math.sin(gunAngle)
            );
            shooting = false;
            armAngle = 0;
          }
        }
        arm.draw(
          T,
          gunX,
          gunY,
          objRad * 3,
          armAngle + gunAngle + Math.PI,
          false
        );
        if (shootBomb) {
          if ((Date.now() / 100) % 2 == 0)
            bomb1.draw(
              T,
              gunX + objRad * 1.5 * Math.cos(armAngle + gunAngle + Math.PI),
              gunY + objRad * 1.5 * Math.sin(armAngle + gunAngle + Math.PI),
              objRad,
              armAngle + gunAngle,
              false
            );
          else
            bomb2.draw(
              T,
              gunX + objRad * 1.5 * Math.cos(armAngle + gunAngle + Math.PI),
              gunY + objRad * 1.5 * Math.sin(armAngle + gunAngle + Math.PI),
              objRad,
              armAngle + gunAngle,
              false
            );
        } else
          star.draw(
            T,
            gunX + objRad * 1.5 * Math.cos(armAngle + gunAngle + Math.PI),
            gunY + objRad * 1.5 * Math.sin(armAngle + gunAngle + Math.PI),
            2 * objRad,
            armAngle + gunAngle,
            false,
            colors[starColor]
          );
        for (let i = 0; i < index; i++) {
          if (!obj[i].projectile) {
            let d = dist(gunX, gunY, obj[i].xc, obj[i].yc);
            if (d < 2 * objRad) health--;
          }
        }
        if (health <= 0 && !finished) {
          finished = true;
          // try {
          //   let url =
          //     'http://www.amaxwellphoto.com/matchingdb.php?penguin=yes&name=' +
          //     name +
          //     '&time=' +
          //     gameTimer / 1000;
          //   rank = Integer.parseInt(
          //     new java.io.BufferedReader(
          //       new java.io.InputStreamReader(
          //         new java.io.BufferedInputStream(url.openStream())
          //       )
          //     ).readLine()
          //   );
          // } catch (e) {}
          gameOverScreen = true;
          menu = true;
        }
      }
    }
    while (entry > 0 && !finished) {
      obj[index++] = new Obj();
      entry--;
    }
    entry += entryIncrement / frameRate;
    entryIncrement += incrementSpeed / frameRate;
  } else if (gameOverScreen) showGameOverScreen();
  else if (viewHighScores) showHighScores();
  else mainMenu();
  T.fillStyle = shadow;
  T.fillRect(0, height, width, extra);
  if (!menu) hud();
  frameRate = Math.min(
    1000 / Math.min(Date.now() - frameTimer, 100),
    maxFrameRate
  );
  if (!menu && begun) gameTimer += 1000 / frameRate;
  requestAnimationFrame(loop);
  // setTimeout(loop, 500);
};

init();
loop();
