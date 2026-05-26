export function generateLattice(width, height, diameter) {
  const points = [];
  const rowHeight = (diameter * Math.sqrt(3)) / 2;
  const numRows = Math.floor(height / rowHeight);
  
  for (let row = 0; row <= numRows; row++) {
    const y = row * rowHeight;
    // Stagger every other row
    const xOffset = (row % 2 === 0) ? 0 : diameter / 2;
    // Calculate how many circles fit in this row
    const numCols = Math.floor((width - xOffset) / diameter);
    
    for (let col = 0; col <= numCols; col++) {
      const x = col * diameter + xOffset;
      // Ensure the entire circle fits inside the frame vertically as well? 
      // It's center coordinates, so let's make sure it doesn't cross boundaries if that matters.
      // Usually the boundaries are for the frame. We can center the whole lattice in the frame later.
      points.push({ x, y });
    }
  }
  
  // Center the lattice perfectly within the bounding box
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  
  const offsetX = (width - (maxX - minX)) / 2 - minX;
  const offsetY = (height - (maxY - minY)) / 2 - minY;
  
  const radius = diameter / 2;
  
  return points
    .map(p => ({
      x: p.x + offsetX,
      y: p.y + offsetY
    }))
    .filter(p => 
      // Ensure the entire straw fits within the frame
      p.x - radius >= 0 && 
      p.x + radius <= width && 
      p.y - radius >= 0 && 
      p.y + radius <= height
    );
}

export function calculateHeights(points, params) {
  const { frequency, damping, centerAmp, sideAmp, minHeight, maxHeight, complexity = 1.0 } = params;
  
  const epicenters = [
    { x: 292.5, y: 75, amp: sideAmp },
    { x: 585.0, y: 75, amp: centerAmp },
    { x: 877.5, y: 75, amp: sideAmp }
  ];

  let minZ = Infinity;
  let maxZ = -Infinity;

  const rawPoints = points.map(p => {
    let z = 0;
    for (const ep of epicenters) {
      const dist = Math.hypot(p.x - ep.x, p.y - ep.y);
      
      // Base wave (using cos so the epicenter starts at a peak if distance is 0)
      let wave = Math.cos(dist * frequency);
      
      // Add harmonics for a more natural, liquid look
      if (complexity > 0) {
        wave += complexity * 0.4 * Math.cos(dist * frequency * 1.618 + Math.PI / 4);
        wave += complexity * 0.2 * Math.cos(dist * frequency * 2.718 + Math.PI / 3);
      }
      
      // Damped wave
      z += ep.amp * wave * Math.exp(-dist * damping);
    }
    
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
    
    return { ...p, rawZ: z };
  });
  
  // Normalize the raw heights to fit perfectly into the [minHeight, maxHeight] range
  const rangeZ = maxZ - minZ;
  
  return rawPoints.map(p => {
    // If range is 0 (e.g. flat), just use midpoint
    const normalizedZ = rangeZ === 0 ? 0.5 : (p.rawZ - minZ) / rangeZ;
    const height = Math.round(minHeight + normalizedZ * (maxHeight - minHeight));
    
    return {
      x: p.x,
      y: p.y,
      z: height
    };
  });
}

export function calculateCutList(straws, uncutLength = 259) {
  // Extract just the lengths needed
  const lengths = straws.map(s => s.z);
  
  // First-Fit Decreasing algorithm
  // Sort descending
  lengths.sort((a, b) => b - a);
  
  const bins = []; // Each bin represents one uncut straw
  
  for (const length of lengths) {
    let placed = false;
    // Find the first bin that can accommodate this length
    for (const bin of bins) {
      if (bin.remaining >= length) {
        bin.cuts.push(length);
        bin.remaining -= length;
        placed = true;
        break;
      }
    }
    
    // If no bin fits, start a new one
    if (!placed) {
      if (length > uncutLength) {
        throw new Error(`Straw length ${length} exceeds uncut length ${uncotLength}`);
      }
      bins.push({
        remaining: uncutLength - length,
        cuts: [length]
      });
    }
  }
  
  // Also provide a grouped tally of cuts for the UI
  const tally = {};
  for (const length of lengths) {
    tally[length] = (tally[length] || 0) + 1;
  }
  
  const sortedTally = Object.entries(tally)
    .map(([len, count]) => ({ length: parseInt(len), count }))
    .sort((a, b) => b.length - a.length);

  const totalWaste = bins.reduce((sum, bin) => sum + bin.remaining, 0);
  const totalLength = bins.length * uncutLength;
  const wastePercentage = totalLength > 0 ? (totalWaste / totalLength) * 100 : 0;

  return {
    uncutStrawsNeeded: bins.length,
    totalStrawsNeeded: lengths.length,
    tally: sortedTally,
    wastePercentage: wastePercentage.toFixed(1),
    bins: bins // if we wanted to show exactly how to cut each one
  };
}
