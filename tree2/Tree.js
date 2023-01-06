const growSpeed = 1; // make it faster or slower
const branchProbability = 0.01; // higher will make a smaller, denser tree.
const branchAngleMultiplier = 1; // smaller will make it a straighter tree, bigger will make it get weird looking
const thicknessMultiplier = 0.2; // bigger make chonky tree
const swayAmount = 1; // how far does it sway
const swaySpeed = 1; // how fast does it sway

export class Tree {
  constructor(angle) {
    this.angle = angle;
    this.length = 1;
    this.size = 1;
    this.branches = [];
    this.leafColor = `hsl(
      ${Math.round(90 + 30 * Math.random())},
      ${Math.round(50 + 20 * Math.random())}%,
      ${Math.round(25 + 15 * Math.random())}%
    )`;
  }
  grow() {
    // make longer
    this.length += growSpeed / this.length; // the longer it is, the slower it grows

    // make branches grow
    for (const branch of this.branches) {
      branch.grow();
    }

    // if it has no branches and the probability is just right, add two branches to the end of this one
    if (
      !this.branches.length &&
      Math.random() < branchProbability * growSpeed
    ) {
      this.branches.push(
        new Tree((Math.random() - 0.5) * branchAngleMultiplier),
        new Tree((Math.random() - 0.5) * branchAngleMultiplier)
      );
    }
  }
  draw(ctx, startX, startY, frameCounter, parentAngle = 0) {
    const angle =
      parentAngle +
      this.angle +
      (Math.sin((frameCounter * swaySpeed) / this.length) * swayAmount) /
        this.length;
    // calculate where the end of the branch should be using some simple trigonometry
    const endX = startX + this.length * Math.cos(angle);
    const endY = startY + this.length * Math.sin(angle);

    for (const branch of this.branches) {
      branch.draw(ctx, endX, endY, frameCounter, angle);
    }

    // if it has branches, draw a stick
    if (this.branches.length) {
      const branchThickness =
        0.2 + Math.sqrt(this.numDescendants()) * thicknessMultiplier;

      ctx.strokeStyle = '#210';
      ctx.lineCap = 'round';
      ctx.lineWidth = branchThickness;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // otherwise draw a leaf
    } else {
      ctx.fillStyle = this.leafColor;
      ctx.beginPath();
      ctx.ellipse(
        (startX + endX) / 2,
        (startY + endY) / 2,
        this.length / 2,
        this.length / 4,
        angle,
        0,
        2 * Math.PI
      );
      ctx.fill();
    }
  }
  // this calculates how many descendents a tree has
  numDescendants() {
    let num = 1;
    for (const branch of this.branches) {
      num += branch.numDescendants();
    }
    return num;
  }
}
