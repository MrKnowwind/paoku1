export interface RockShelf {
  side: -1 | 1;
  laneCount: 1 | 2 | 3;
}

export function rockShelfSpan(shelf: RockShelf) {
  const wallX = shelf.side * 5.85;
  const innerLane = shelf.side * (2 - shelf.laneCount);
  const tipX = innerLane * 2.5 - shelf.side * 1.02;
  return {
    wallX,
    tipX,
    minX: Math.min(wallX, tipX),
    maxX: Math.max(wallX, tipX),
    length: Math.abs(wallX - tipX),
    lanes: Array.from(
      { length: shelf.laneCount },
      (_, i) => shelf.side * (1 - i),
    ),
  };
}

export function underRockShelf(shelf: RockShelf, x: number) {
  const span = rockShelfSpan(shelf);
  return x >= span.minX - 0.28 && x <= span.maxX + 0.28;
}
