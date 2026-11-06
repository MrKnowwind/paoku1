const clamp = (value: number) => Math.max(0, Math.min(1, value));
const SIXTH_TURN = Math.PI / 3;

type Point = {x: number; y: number};
type Crystal = {center: Point; radius: number; angle: number};
type Stroke = {from: Point; to: Point; start: number; end: number};
type Tint = {gradient: CanvasGradient; bounds: [number, number, number, number]; start: number; end: number; opacity: number};

const step = (point: Point, angle: number, distance: number): Point =>
  ({x: point.x + Math.cos(angle) * distance, y: point.y + Math.sin(angle) * distance});

const between = (a: Point, b: Point, fraction: number): Point =>
  ({x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction});

const bearing = (from: Point, to: Point) => Math.atan2(to.y - from.y, to.x - from.x);

const tipAngle = (crystal: Crystal, direction: number) =>
  crystal.angle + Math.round((direction - crystal.angle) / SIXTH_TURN) * SIXTH_TURN;

const facingTip = (crystal: Crystal, to: Point) =>
  step(crystal.center, tipAngle(crystal, bearing(crystal.center, to)), crystal.radius);

export class SnowFrost {
  private strokes: Stroke[][] = [[], [], []];
  private tints: Tint[] = [];
  private paths: Path2D[] = [];
  private lastGrowth = -1;
  private unit: number;

  constructor(ctx: CanvasRenderingContext2D, readonly width: number, readonly height: number) {
    const unit = this.unit = Math.min(width, height);
    const sides: Crystal[][] = [];
    for (let side = 0; side < 4; side++) {
      const length = side % 2 === 0 ? width : height;
      const count = Math.max(3, Math.min(7, Math.round(length / unit * 3.6)));
      const edgePoint = (along: number, inset: number): Point => {
        if (side === 0) return {x: along, y: inset};
        if (side === 1) return {x: width - inset, y: along};
        if (side === 2) return {x: width - along, y: height - inset};
        return {x: inset, y: height - along};
      };
      const seeds: Crystal[] = [];
      for (let i = 0; i < count; i++) {
        const variation = Math.sin(i * 19.3 + side * 7.9);
        const cornerGap = unit * 0.14;
        const along = cornerGap + i / (count - 1) * (length - 2 * cornerGap);
        const offset = i > 0 && i < count - 1 ? variation * unit * 0.022 : 0;
        const crystal = {
          center: edgePoint(along + offset, unit * (0.049 + 0.009 * variation)),
          radius: unit * (0.041 + 0.008 * variation),
          angle: side * Math.PI / 2 + variation * 0.22,
        };
        seeds.push(crystal);
        const start = i % 2 === 0 ? 0.05 : 0.10;
        this.addCrystal(crystal, start, 0.21, 0);
        this.addTint(ctx, crystal.center, crystal.radius * 2.15, start, 0.44, 0.49);

        if (i % 2 === 0) {
          const angle = tipAngle(crystal, (side + 1) * Math.PI / 2);
          const from = step(crystal.center, angle, crystal.radius);
          const center = step(from, angle, unit * 0.019);
          this.addStroke(from, center, 0.72, 0.82, 2);
          this.addCrystal({center, radius: unit * 0.018, angle: angle + 0.15}, 0.82, 0.17, 2);
        }
      }
      sides.push(seeds);
      for (let i = 1; i < seeds.length; i++) {
        const from = seeds[i - 1], to = seeds[i];
        const early = (i + side) % 2 === 0;
        this.connect(ctx, early ? from : to, early ? to : from, early ? 0.30 : 0.35, false);
      }
    }
    for (let i = 0; i < sides.length; i++) {
      const edge = sides[i], next = sides[(i + 1) % sides.length];
      this.connect(ctx, edge[edge.length - 1], next[0], 0.67, true);
    }
  }

  private addStroke(from: Point, to: Point, start: number, end: number, tier: number) {
    this.strokes[tier].push({from, to, start, end});
  }

  private addCrystal(crystal: Crystal, start: number, duration: number, tier: number) {
    const {center, radius, angle} = crystal;
    for (let arm = 0; arm < 6; arm++) {
      const direction = angle + arm * SIXTH_TURN;
      const armStart = start + duration * Math.min(arm, 6 - arm) * 0.07;
      const reach = duration * 0.57;
      this.addStroke(center, step(center, direction, radius), armStart, armStart + reach, tier);
      for (const [at, size] of [[0.44, 0.2], [0.73, 0.16]]) {
        const fork = step(center, direction, radius * at);
        const forkStart = armStart + reach * at;
        for (const sign of [-1, 1]) {
          const end = step(fork, direction + sign * SIXTH_TURN, radius * size * 1.15);
          this.addStroke(fork, end, forkStart, forkStart + duration * 0.21, tier);
        }
      }
    }
  }

  private connect(ctx: CanvasRenderingContext2D, from: Crystal, to: Crystal, start: number, corner: boolean) {
    const angle = bearing(from.center, to.center);
    const duration = corner ? 0.30 : 0.55;
    const fractions = corner ? [0.5] : [0.34, 0.69];
    let parent = from;
    for (const [index, fraction] of fractions.entries()) {
      const center = between(from.center, to.center, fraction);
      const crystal = {center, radius: this.unit * (corner ? 0.021 : index === 0 ? 0.027 : 0.022), angle};
      const stemStart = start + index * duration * 0.43;
      const sprout = stemStart + duration * 0.20;
      this.addStroke(facingTip(parent, center), center, stemStart, sprout, 1);
      this.addCrystal(crystal, sprout, duration * 0.23, 1);
      this.addTint(ctx, center, this.unit * (corner ? 0.067 : 0.072), sprout, sprout + duration * 0.23, 0.34);
      parent = crystal;
    }
    this.addStroke(facingTip(parent, to.center), facingTip(to, parent.center), start + duration * 0.86, start + duration, 1);
  }

  private addTint(ctx: CanvasRenderingContext2D, center: Point, radius: number, start: number, end: number, opacity: number) {
    const {x, y} = center;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "#456fa8dc");
    gradient.addColorStop(0.47, "#648fc396");
    gradient.addColorStop(1, "#648fc300");
    this.tints.push({gradient, bounds: [x - radius, y - radius, radius * 2, radius * 2], start, end, opacity});
  }

  draw(ctx: CanvasRenderingContext2D, chill: number) {
    if (chill < 0.05) return;
    for (const {gradient, bounds, start, end, opacity} of this.tints) {
      if (chill <= start) continue;
      ctx.globalAlpha = clamp((chill - start) / (end - start)) * opacity;
      ctx.fillStyle = gradient;
      ctx.fillRect(...bounds);
    }
    // A fixed layout lets the same paths grow forward and retreat when the player warms up.
    const growth = Math.round(chill * 400) / 400;
    if (this.lastGrowth !== growth) {
      this.lastGrowth = growth;
      this.paths = this.strokes.map(strokes => {
        const path = new Path2D();
        for (const {from, to, start, end} of strokes) {
          if (growth <= start) continue;
          const point = between(from, to, clamp((growth - start) / (end - start)));
          path.moveTo(from.x, from.y);
          path.lineTo(point.x, point.y);
        }
        return path;
      });
    }
    for (const [tier, path] of this.paths.entries()) {
      const line = Math.max(0.46, this.unit * 0.0019) * [1, 0.76, 0.62][tier];
      ctx.lineWidth = line * 2.2;
      ctx.globalAlpha = tier === 0 ? 0.63 : 0.43;
      ctx.strokeStyle = "#345781";
      ctx.stroke(path);
      ctx.lineWidth = line;
      ctx.globalAlpha = tier === 0 ? 0.94 : 0.82;
      ctx.strokeStyle = "#ebfaff";
      ctx.stroke(path);
    }
  }
}
