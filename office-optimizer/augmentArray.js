'use strict';
Array.prototype.flatten = function() {
  return [].concat(...this);
};
Array.prototype.swap = function(index1, index2) {
  var t = this[index1];
  this[index1] = this[index2];
  this[index2] = t;
  return this;
};
