class Node {
  left: Node = this;
  right: Node = this;
  up: Node = this;
  down: Node = this;

  readonly col: Node;
  size = 0; // header only
  rowIndex = -1; // data only

  constructor(col?: Node) {
    this.col = col ?? this;
  }

  // Links 'node' horizontally between 'this' and 'this.right'
  insertRight(node: Node) {
    node.left = this;
    node.right = this.right;
    this.right.left = node;
    this.right = node;
  }

  // Links 'node' vertically between 'this' and 'this.down'
  insertDown(node: Node) {
    node.up = this;
    node.down = this.down;
    this.down.up = node;
    this.down = node;
    node.col.size++;
  }

  appendRight(node: Node) {
    this.left.insertRight(node);
  }

  appendDown(node: Node) {
    this.up.insertDown(node);
  }

  cover() {
    this.left.right = this.right;
    this.right.left = this.left;
    for (let r = this.down; r !== this; r = r.down) {
      for (let j = r.right; j !== r; j = j.right) {
        j.down.up = j.up;
        j.up.down = j.down;
        j.col.size--;
      }
    }
  }

  uncover() {
    for (let r = this.up; r !== this; r = r.up) {
      for (let j = r.left; j !== r; j = j.left) {
        j.col.size++;
        j.down.up = j;
        j.up.down = j;
      }
    }
    this.left.right = this;
    this.right.left = this;
  }
}

export function solveExactCover(
  rows: string[][],
  optionalCols: string[] = [],
  maxSolutions = 1,
): string[][][] {
  const root = new Node();
  const headers = new Map<string, Node>();
  const solutions: string[][][] = [];
  const optionalSet = new Set(optionalCols);

  // 1. Build Headers
  const uniqueCols = new Set<string>();
  for (const row of rows) {
    for (const name of row) {
      if (!uniqueCols.has(name)) {
        uniqueCols.add(name);
        const col = new Node();
        headers.set(name, col);
        if (!optionalSet.has(name)) {
          root.appendRight(col);
        }
      }
    }
  }

  // 2. Build Matrix
  const seenInRow = new Set<string>();

  rows.forEach((row, index) => {
    seenInRow.clear();
    let first: Node | null = null;

    for (const name of row) {
      if (seenInRow.has(name)) {
        throw new Error(`Duplicate column "${name}" in row ${index}`);
      }
      seenInRow.add(name);

      const col = headers.get(name);
      if (!col) {
        throw new Error(`Column "${name}" not found`);
      }

      const node = new Node(col);
      node.rowIndex = index;

      col.appendDown(node);

      if (first) first.appendRight(node);
      else first = node;
    }
  });

  // 3. Search
  const stack: number[] = [];

  function search() {
    if (root.right === root) {
      solutions.push(stack.map((i) => rows[i]));
      return;
    }

    // Heuristic: Select column with smallest size
    // (This loop only sees Primary columns because secondary ones aren't in the ring)
    let c = root.right;
    for (let j = c.right; j !== root; j = j.right) {
      if (j.size < c.size) c = j;
    }

    if (c.size === 0) return;

    c.cover();
    for (let r = c.down; r !== c; r = r.down) {
      stack.push(r.rowIndex);

      // When we traverse the row, we cover ALL columns (primary and optional).
      // This prevents future rows from using the optional column if we just claimed it.
      for (let j = r.right; j !== r; j = j.right) j.col.cover();

      search();
      if (solutions.length >= maxSolutions) return;

      for (let j = r.left; j !== r; j = j.left) j.col.uncover();
      stack.pop();
    }
    c.uncover();
  }

  search();
  return solutions;
}
