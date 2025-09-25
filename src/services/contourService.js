// src/services/contourService.js
import * as d3 from "d3-contour";

function idwInterpolate(x, y, points, power = 2) {
  if (points.length === 0) return 0;

  let weightedSum = 0;
  let weightSum = 0;

  for (const p of points) {
    const dx = x - p.x;
    const dy = y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1e-8) {
      return p.z;
    }

    const weight = 1 / Math.pow(dist, power);
    weightedSum += weight * p.z;
    weightSum += weight;
  }

  return weightSum > 0 ? weightedSum / weightSum : 0;
}

export function generateContours(points, options = {}) {
  const { interval = 1.0, minDepth = -20, maxDepth = 0, gridWidth = 100, gridHeight = 100 } = options;

  if (points.length === 0) {
    throw new Error("Tidak ada titik sampling");
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);

  const grid = [];
  for (let j = 0; j < gridHeight; j++) {
    const row = [];
    for (let i = 0; i < gridWidth; i++) {
      const x = xMin + (xMax - xMin) * (i / (gridWidth - 1));
      const y = yMin + (yMax - yMin) * (j / (gridHeight - 1));
      const depth = idwInterpolate(x, y, points);
      row.push(depth);
    }
    grid.push(row);
  }

  const thresholds = [];
  for (let d = minDepth; d <= maxDepth; d += interval) {
    thresholds.push(d);
  }

  const contours = d3.contours().size([gridWidth, gridHeight]).thresholds(thresholds)(grid);

  const features = contours.map((c) => {
    const coords = c.coordinates.map((ring) =>
      ring.map(([i, j]) => {
        const x = xMin + (xMax - xMin) * (i / (gridWidth - 1));
        const y = yMin + (yMax - yMin) * (j / (gridHeight - 1));
        return [x, y];
      })
    );
    return {
      type: "Feature",
      geometry: {
        type: "MultiLineString",
        coordinates: coords,
      },
      properties: {
        depth: c.value,
      },
    };
  });

  return {
    type: "FeatureCollection",
    features,
  };
}
