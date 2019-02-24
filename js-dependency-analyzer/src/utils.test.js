import {nodesWhere} from './utils.js';
import {expect} from 'chai';

describe('nodesWhere', () => {
  it('should return an array of nodes that match a predicate from a structure', () => {
    const struct = {
      a: 3,
      b: {c: 3, d: ['a', {findMe: true, val: 5}]},
      e: [{stuff: {findMe: true, val: 3}}]
    };
    expect(nodesWhere(n => n.findMe, struct)).to.deep.equal([
      {findMe: true, val: 5},
      {findMe: true, val: 3}
    ]);
    expect(nodesWhere(n => n === 3, struct)).to.have.lengthOf(3);
    expect(nodesWhere(() => true, struct)).to.have.lengthOf(14);
  });
});
