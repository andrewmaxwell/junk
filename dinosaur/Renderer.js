class SpriteSheet {
  constructor(src, numFrames, width, height) {
    this.img = Object.assign(new Image(), {src});
    this.numFrames = numFrames;
    this.width = width;
    this.height = height;
  }
  getFrame(x, y = 0) {
    const {img, width, height} = this;
    return [img, x * width, y * height, width, height];
  }
}

export class Renderer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.width = canvas.width = width;
    this.height = canvas.height = height;
    this.ctx = canvas.getContext('2d');

    this.dinoSprite = new SpriteSheet('dinosaur-walk.png', 24, 480, 240);
    this.asteroidSprite = new SpriteSheet('asteroid.png', 20, 200, 200);
    // this.translateY = 0;
  }
  render({dino, asteroids, debris, gameOver, score, ground}) {
    const {ctx, width, height} = this;

    ctx.clearRect(0, 0, width, height);

    ctx.putImageData(ground.imageData, 0, ground.groundLevel);

    ctx.fillStyle = 'red';
    ctx.fillRect(0, ground.groundLevel, width, 1);

    this.drawAsteroids(asteroids);
    this.drawDebris(debris);
    if (!gameOver) this.drawDino(dino);

    this.drawHud(score, gameOver);
  }
  drawDino({x, y, facingRight, w, h, distance}) {
    const {ctx, dinoSprite} = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facingRight ? 1 : -1, 1);
    ctx.drawImage(
      ...dinoSprite.getFrame(distance % dinoSprite.numFrames),
      -w / 2,
      -h / 2,
      w,
      h
    );
    ctx.restore();
  }
  drawAsteroids(asteroids) {
    const {ctx, asteroidSprite} = this;
    for (const {x, y, rad} of asteroids) {
      ctx.drawImage(
        ...asteroidSprite.getFrame(
          Math.floor(y / 5) % asteroidSprite.numFrames
        ),
        x - rad,
        y - rad,
        rad * 2,
        rad * 2
      );
    }
  }
  drawDebris(debris) {
    const {ctx} = this;
    ctx.strokeStyle = 'gray';
    ctx.beginPath();
    for (const {x, y, xs, ys} of debris) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + xs, y + ys);
    }
    ctx.stroke();
  }
  drawHud(score, gameOver) {
    const {ctx, width, height} = this;

    if (gameOver) {
      ctx.fillStyle = 'red';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '100px sans-serif';
      ctx.fillText('you dead', width / 2, height / 2);

      ctx.fillStyle = 'white';
      ctx.font = '32px sans-serif';
      ctx.fillText('press R to try again', width / 2, height / 2 + 50);
    }

    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '32px sans-serif';
    ctx.fillText(`Score: ${score}`, 10, 10);
  }
}
