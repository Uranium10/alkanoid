const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./src/sigungu.json', 'utf8'));

const adjacency = {};

// Extract all points for each feature
const featurePoints = {};

data.features.forEach(f => {
  const code = f.properties.code;
  featurePoints[code] = new Set();
  
  const extractPoints = (coords) => {
    if (typeof coords[0] === 'number') {
      // It's a point [lon, lat]
      // Use toFixed to handle minor float differences, e.g. 4 decimals (~11m)
      featurePoints[code].add(`${coords[0].toFixed(4)},${coords[1].toFixed(4)}`);
    } else {
      coords.forEach(extractPoints);
    }
  };
  
  extractPoints(f.geometry.coordinates);
  adjacency[code] = [];
});

const codes = Object.keys(featurePoints);

for (let i = 0; i < codes.length; i++) {
  for (let j = i + 1; j < codes.length; j++) {
    const codeA = codes[i];
    const codeB = codes[j];
    const ptsA = featurePoints[codeA];
    const ptsB = featurePoints[codeB];
    
    let isAdjacent = false;
    for (let p of ptsA) {
      if (ptsB.has(p)) {
        isAdjacent = true;
        break;
      }
    }
    
    if (isAdjacent) {
      adjacency[codeA].push(codeB);
      adjacency[codeB].push(codeA);
    }
  }
}

// Print some stats
let totalNeighbors = 0;
for (const code of codes) {
  totalNeighbors += adjacency[code].length;
}
console.log(`Average neighbors: ${(totalNeighbors / codes.length).toFixed(2)}`);

fs.writeFileSync('./src/adjacency.json', JSON.stringify(adjacency, null, 2));
console.log('adjacency.json created successfully.');
