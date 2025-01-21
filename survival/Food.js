export class Food {
  constructor(params, x, y) {
    this.x = x;
    this.y = y;
    this.energy = params.foodEnergy;
    this.rad = params.foodRad;
  }
  // act(hashGrid, {growSpeed}) {
  //   this.energy += growSpeed;
  // }
  act() {}
}
