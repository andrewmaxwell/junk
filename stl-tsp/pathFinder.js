import {IterativeAStarSearch} from './iterativeAStarSearch.js';

export class PathFinder {
  constructor(opts) {
    Object.keys(opts).forEach(key => (this[key] = opts[key]));
  }
  init(nodes, destinations) {
    this.nodes = nodes;
    this.destinations = destinations;
    this.currentIndex = 0;
    this.aStar = false;
  }
  iterate() {
    const currentNode = this.destinations[this.currentIndex];

    if (!currentNode) {
      for (let i = 0; i < this.nodes.length; i++) {
        delete this.nodes[i].totalCost;
        delete this.nodes[i].fScore;
        delete this.nodes[i].visited;
        delete this.nodes[i].prev;
      }
      return false;
    }

    if (!this.aStar) {
      this.aStar = new IterativeAStarSearch(
        this.nodes,
        this.destinations[this.currentIndex],
        this.destinations
      );
    }

    if (!this.aStar.iterate()) {
      currentNode.paths = {};
      this.destinations.forEach(destination => {
        if (destination != currentNode) {
          const path = [];
          let current = destination;
          while (current) {
            path.push(current);
            current = current.prev;
          }
          if (destination.totalCost == Infinity) {
            console.log('Infinity!', currentNode);
          }
          currentNode.paths[destination.id] = {
            path,
            cost: destination.totalCost
          };
        }
      });

      this.currentIndex++;
      this.aStar = false;
      this.onPathFound();
    }

    return true;
  }
}
