import {Grid} from './grid.js';
import {randomIndex, noise} from './utils.js';

export function makeSim(params) {
  var grid, grassCells, sheeps, raptors, stats;

  function reset() {
    grid = new Grid({
      width: params.width,
      height: params.height,
      initCell: cell => {
        cell.grass = 1;
        cell.raptorDist = params.smellDistance + 1;
        cell.occupant =
          noise(cell.x / params.rockScale, cell.y / params.rockScale) <
          params.rockThreshold;
      }
    });

    grassCells = grid.getCells().filter(c => c.occupant !== true);
    sheeps = [];
    raptors = [];

    for (var i = 0; i < params.startingSheep; i++) {
      addSheep(grid.randomEmptySpace());
    }

    stats = {
      births: 0,
      deaths: 0,
      killed: 0,
      population: sheeps.length,
      grass: 0,
      age: 0
    };
  }

  function addSheep(coord) {
    var s = {
      x: coord.x,
      y: coord.y,
      energy: params.newbornEnergy,
      age: 0
    };
    grid.setOccupant(s);
    sheeps.push(s);
  }

  function addRaptor(coord) {
    var s = {
      x: coord.x,
      y: coord.y,
      path: []
    };
    grid.setOccupant(s);
    raptors.push(s);
  }

  function killSheep(sheepIndex) {
    if (sheepIndex > -1) {
      var s = sheeps[sheepIndex];
      grid.removeOccupant(s);
      sheeps.splice(sheepIndex, 1);
      return true;
    }
    return false;
  }

  function cellIsNearRaptor(cell) {
    return cell.raptorDist <= params.smellDistance;
  }
  function cellQualityForSheep(cell) {
    return !cell.occupant && cell.raptorDist + cell.grass * 0.5;
  }
  function moveSheep(s) {
    var currentCell = grid.getCell(s);
    var isRunning = currentCell.neighbors.some(cellIsNearRaptor);
    var moveTo = grid.getBestNeighbor(currentCell, cellQualityForSheep);

    if (moveTo) {
      if (s.energy >= 1) {
        s.energy = params.newbornEnergy;
        stats.births++;
        addSheep(moveTo);
      } else {
        currentCell.occupant = null;
        currentCell = moveTo;
        s.x = currentCell.x;
        s.y = currentCell.y;
      }
    }

    var eatAmount = isRunning ? 0 : currentCell.grass * params.eatAmountMult;
    s.energy = Math.max(
      0,
      s.energy +
        -params.energyLossRate +
        eatAmount * params.grassEnergyMult * Math.exp(-s.age)
    );
    s.age += params.ageAmt;
    currentCell.grass -= eatAmount;
    currentCell.occupant = s;
    return s.energy > 0;
  }

  function cellContainsASheep(cell) {
    return cell.occupant && sheeps.includes(cell.occupant);
  }
  function cellIsUnoccupied(cell) {
    return !cell.occupant;
  }
  function moveRaptor(w) {
    if (w.eating) {
      w.eating--;
      return;
    }

    var currentCell = grid.getCell(w);
    var path = (w.path = grid.getPath(
      currentCell,
      cellContainsASheep,
      params.smellDistance
    ));
    var moveTo =
      (Math.random() < params.raptorSpeed && path[path.length - 2]) ||
      path[path.length - 1] ||
      randomIndex(currentCell.neighbors.filter(cellIsUnoccupied));

    if (moveTo) {
      currentCell.occupant = null;
      w.x = moveTo.x;
      w.y = moveTo.y;
      if (moveTo.occupant) {
        killSheep(sheeps.indexOf(moveTo.occupant));
        stats.killed++;
        w.eating = params.eatDuration;
        w.path = [];
      }
      moveTo.occupant = w;
    }
  }

  function setRaptorDist(cell, dist) {
    cell.raptorDist = Math.min(cell.raptorDist, dist);
    return false;
  }
  function calculateRaptorDists() {
    if (!raptors.length && sheeps.length >= params.raptorAppears) {
      addRaptor(grid.randomEmptySpace());
    }

    for (var i = 0; i < raptors.length; i++) {
      grid.getPath(
        grid.getCell(raptors[i]),
        setRaptorDist,
        params.smellDistance
      );
    }
  }

  function iterateSheeps() {
    for (var i = 0; i < sheeps.length; i++) {
      if (!moveSheep(sheeps[i])) {
        killSheep(i--);
        stats.deaths++;
      }
    }
  }

  function iterateRaptors() {
    for (var i = 0; i < raptors.length; i++) {
      moveRaptor(raptors[i]);
    }
  }

  function iterateGrass() {
    stats.grass = 0;
    for (var i = 0; i < grassCells.length; i++) {
      var cell = grassCells[i];
      cell.raptorDist = params.smellDistance + 1;
      cell.grass = Math.min(1, cell.grass + params.grassGrowthRate);
      stats.grass += cell.grass;
    }
  }

  return {
    reset,
    iterate() {
      calculateRaptorDists();
      iterateSheeps();
      iterateRaptors();
      iterateGrass();
    },
    getSheeps() {
      return sheeps;
    },
    getRaptors() {
      return raptors;
    },
    getGrassCells() {
      return grassCells;
    },
    getStats() {
      var totalAge = 0;
      for (var i = 0; i < sheeps.length; i++) {
        totalAge += sheeps[i].age;
      }
      stats.age = totalAge / sheeps.length;
      stats.population = sheeps.length;

      return stats;
    }
  };
}
