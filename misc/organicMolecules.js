const elements = {
  H: {valence: 1, weight: 1, formulaOrder: 1, bondOrder: 4},
  B: {valence: 3, weight: 10.8, formulaOrder: 3, bondOrder: 3},
  C: {valence: 4, weight: 12, formulaOrder: 0, bondOrder: 0},
  N: {valence: 3, weight: 14, formulaOrder: 3, bondOrder: 3},
  O: {valence: 2, weight: 16, formulaOrder: 2, bondOrder: 2},
  F: {valence: 1, weight: 19, formulaOrder: 3, bondOrder: 3},
  Mg: {valence: 2, weight: 24.3, formulaOrder: 3, bondOrder: 3},
  P: {valence: 3, weight: 31, formulaOrder: 3, bondOrder: 3},
  S: {valence: 2, weight: 32.1, formulaOrder: 3, bondOrder: 3},
  Cl: {valence: 1, weight: 35.5, formulaOrder: 3, bondOrder: 3},
  Br: {valence: 1, weight: 80, formulaOrder: 3, bondOrder: 3}
};

class InvalidBond extends Error {}
class LockedMolecule extends Error {}
class UnlockedMolecule extends Error {}
class EmptyMolecule extends Error {}

class Atom {
  constructor(elt, id) {
    this.element = elt;
    this.id = id;
    this.bonds = [];
  }
  toString() {
    return `Atom(${this.element}.${this.id}${
      this.bonds.length ? ': ' : ''
    }${this.bonds
      .sort(
        (a, b) =>
          elements[a.element].bondOrder - elements[b.element].bondOrder ||
          a.element.localeCompare(b.element) ||
          a.id - b.id
      )
      .map(b => (b.element === 'H' ? 'H' : b.element + b.id))
      .join(',')})`;
  }
  bond(otherAtom) {
    if (
      this === otherAtom ||
      this.bonds.length === elements[this.element].valence ||
      otherAtom.bonds.length === elements[otherAtom.element].valence
    )
      throw new InvalidBond();
    this.bonds.push(otherAtom);
    otherAtom.bonds.push(this);
    return this;
  }
  mutate(elt) {
    if (this.bonds.length > elements[elt].valence) throw new InvalidBond();
    this.element = elt;
    return this;
  }
}

class Molecule {
  constructor(name = '') {
    console.log('new Molecule(', JSON.stringify(name), ')');
    this.name = name;
    this.atoms = [];
    this.branches = [];
  }
  get formula() {
    if (!this.locked) throw new UnlockedMolecule();
    const counts = {};
    this.atoms.forEach(({element}) => {
      counts[element] = (counts[element] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(
        ([a], [b]) =>
          elements[a].formulaOrder - elements[b].formulaOrder ||
          a.localeCompare(b)
      )
      .map(p => (p[1] === 1 ? p[0] : p.join('')))
      .join('');
  }
  get molecularWeight() {
    if (!this.locked) throw new UnlockedMolecule();
    return this.atoms.reduce((sum, a) => sum + elements[a.element].weight, 0);
  }
  addAtom(element) {
    const atom = new Atom(element, this.atoms.length + 1);
    this.atoms.push(atom);
    return atom;
  }
  getAtom(nc, nb) {
    return this.branches[nb - 1][nc - 1];
  }
  brancher(...args) {
    console.log('.brancher(', args.join(','), ')');
    if (this.locked) throw new LockedMolecule();
    args.forEach(n => {
      const branch = [];
      for (let i = 0; i < n; i++) {
        const atom = this.addAtom('C');
        if (i) atom.bond(branch[branch.length - 1]);
        branch.push(atom);
      }
      this.branches.push(branch);
    });
    return this;
  }
  bounder(...bonds) {
    console.log('.bounder(', bonds.map(JSON.stringify).join(','), ')');
    if (this.locked) throw new LockedMolecule();
    bonds.forEach(([c1, b1, c2, b2]) => {
      this.getAtom(c1, b1).bond(this.getAtom(c2, b2));
    });
    return this;
  }
  mutate(...mutations) {
    console.log('.mutate(', mutations.map(JSON.stringify).join(','), ')');
    if (this.locked) throw new LockedMolecule();
    mutations.forEach(([nc, nb, elt]) => {
      this.getAtom(nc, nb).mutate(elt);
    });
    return this;
  }
  add(...additions) {
    console.log('.add(', additions.map(JSON.stringify).join(','), ')');
    if (this.locked) throw new LockedMolecule();
    additions.forEach(([nc, nb, elt]) => {
      const origLen = this.atoms.length;
      try {
        this.addAtom(elt).bond(this.getAtom(nc, nb));
      } catch (e) {
        this.atoms.length = origLen;
        throw e;
      }
    });
    return this;
  }
  addChaining(nc, nb, ...elts) {
    console.log('.addChaining(', [nc, nb, ...elts].join(','), ')');
    if (this.locked) throw new LockedMolecule();
    const prevAtomsLength = this.atoms.length;
    const startingAtom = this.getAtom(nc, nb);
    const prevBondsLength = startingAtom.bonds.length;
    try {
      elts.reduce((prev, e) => this.addAtom(e).bond(prev), startingAtom);
    } catch (e) {
      this.atoms.length = prevAtomsLength;
      startingAtom.bonds.length = prevBondsLength;
      throw e;
    }
    return this;
  }
  closer() {
    console.log('.closer()');
    if (this.locked) throw new LockedMolecule();
    this.atoms.forEach(a => {
      const num = elements[a.element].valence - a.bonds.length;
      for (let i = 0; i < num; i++) this.addAtom('H').bond(a);
    });
    this.locked = true;
    return this;
  }
  unlock() {
    console.log('.unlock()');
    this.locked = false;
    this.branches = this.branches
      .map(b => b.filter(a => a.element !== 'H'))
      .filter(b => b.length > 0);
    if (!this.branches.length) throw new EmptyMolecule();
    this.atoms = this.atoms.filter(a => a.element !== 'H');
    this.atoms.forEach((a, i) => {
      a.bonds = a.bonds.filter(b => b.element !== 'H');
      a.id = i + 1;
    });
    return this;
  }
}
