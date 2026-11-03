// All authored coast grids advance along +Z. Babylon's left-handed winding faces up.
export function coastGridIndices(columns: number, rows: number): number[] {
  const indices: number[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const a = row * (columns + 1) + col;
    indices.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1);
  }
  return indices;
}

export function reefRockGeometry(size: [number, number, number], seed: number) {
    const positions: number[] = [], indices: number[] = [], colors: number[] = [];
    const rings = [0.02, 0.65, 0.94, 0.86, 0.63, 0.06], sides = 14;
    for (let row = 0; row < rings.length; row++) {
      const t = row / (rings.length - 1);
      for (let j = 0; j < sides; j++) {
        const a = j * Math.PI * 2 / sides;
        const wear = 1 + Math.sin(a * 3 + seed) * 0.16 + Math.cos(a * 5 - row * 1.8 + seed) * 0.1;
        positions.push(Math.cos(a) * rings[row] * wear * size[0] / 2 + t * size[0] * Math.sin(seed) * 0.12,
          (t - 0.5 + Math.sin(a * 3 + seed) * Math.sin(t * Math.PI) * 0.045) * size[1],
          Math.sin(a) * rings[row] * wear * size[2] / 2);
        const shade = 0.72 + t * 0.25 + Math.cos(a * 3 + seed) * 0.04;
        colors.push(shade, shade, shade * 0.97, 1);
        if (row < rings.length - 1) {
          const a0 = row * sides + j, a1 = row * sides + (j + 1) % sides;
          indices.push(a0, a1, a0 + sides, a1, a1 + sides, a0 + sides);
        }
      }
    }
    // Close the small end rings, avoiding gaps when seen from above or below.
    for (let j = 1; j < sides - 1; j++) {
      indices.push(0, j + 1, j);
      const end = (rings.length - 1) * sides; indices.push(end, end + j, end + j + 1);
    }
  return {positions, indices, colors};
}
