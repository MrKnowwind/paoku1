// Reproducible random walk through three cells; neighbouring targets differ by at most one.
export function safeRoute(row: number, seed: number, interval: number, salt: number): number {
  let level = 1;
  for (let step = 0; step <= Math.floor(Math.max(0, row) / interval); step++) {
    let n = Math.imul(seed ^ salt ^ Math.imul(step + 1, 374761393), 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    const random = ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    const low = Math.max(0, level - 1), high = Math.min(2, level + 1);
    level = low + Math.floor(random * (high - low + 1));
  }
  return level;
}
