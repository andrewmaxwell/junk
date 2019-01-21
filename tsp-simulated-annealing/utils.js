Array.prototype.shuffle = function() {
  let counter = this.length;
  while (counter > 0) {
    let index = Math.floor(Math.random() * counter);
    counter--;
    let temp = this[counter];
    this[counter] = this[index];
    this[index] = temp;
  }
  return this;
};
