export const addFood = (hashGrid, params, x, y) => {
  if (hashGrid.isOccupied(x, y, params.foodRad)) return;
  hashGrid.insert(new Food(params, x, y));
};

export class Food {
  constructor({foodEnergy, foodRad}, x, y) {
    this.x = x;
    this.y = y;
    this.energy = foodEnergy;
    this.rad = foodRad;
  }
  act(hashGrid, params) {
    const {foodSpreadProb, foodRad} = params;
    if (this.energy <= 0) hashGrid.remove(this);
    else if (Math.random() < foodSpreadProb) {
      const angle = Math.random() * 2 * Math.PI;
      const x = this.x + foodRad * 2 * Math.cos(angle);
      const y = this.y + foodRad * 2 * Math.sin(angle);
      addFood(hashGrid, params, x, y);
    }
  }
}
