export class IterativeAStarSearch {
  constructor(nodes, start, destinations) {
    this.destinations = destinations;
    this.remainingDestinations = this.destinations.length;

    for (let i = 0; i < nodes.length; i++) {
      nodes[i].totalCost = Infinity;
      nodes[i].fScore = Infinity;
      nodes[i].visited = false;
      nodes[i].prev = false;
    }

    start.totalCost = 0;
    this.updateFScore(start);
    this.queue = [start];
  }
  updateFScore(node) {
    let minCostSquared = Infinity;
    for (let i = 0; i < this.destinations.length; i++) {
      let d = this.destinations[i];
      if (!d.visited) {
        let dx = node.x - d.x;
        let dy = node.y - d.y;
        minCostSquared = Math.min(minCostSquared, dx * dx + dy * dy);
      }
    }
    node.fScore = node.totalCost + Math.sqrt(minCostSquared);
  }
  iterate() {
    if (!this.remainingDestinations || !this.queue.length) return false;

    let currentIndex = 0;
    for (let i = 1; i < this.queue.length; i++) {
      if (this.queue[i].fScore < this.queue[currentIndex].fScore) {
        currentIndex = i;
      }
    }

    let current = this.queue[currentIndex];
    current.visited = true;
    this.queue.splice(currentIndex, 1);

    if (this.destinations.includes(current)) {
      this.remainingDestinations--;
      if (!this.remainingDestinations) return false;
      for (let j = 0; j < this.queue.length; j++) {
        this.updateFScore(this.queue[j]);
      }
    }

    for (let i = 0; i < current.neighbors.length; i++) {
      let cost = current.neighbors[i].cost;
      let neighbor = current.neighbors[i].node;
      if (neighbor.visited) continue;

      let tentativeCost = current.totalCost + cost;

      if (!this.queue.includes(neighbor)) {
        this.queue.push(neighbor);
      } else if (tentativeCost >= neighbor.totalCost) {
        continue;
      }

      neighbor.prev = current;
      neighbor.totalCost = tentativeCost;
      this.updateFScore(neighbor);
    }

    return true;
  }
}
