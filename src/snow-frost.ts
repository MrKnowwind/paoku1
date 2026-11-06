const clamp = (value: number) => Math.max(0, Math.min(1, value));

type Point = {x: number; y: number};
type Stroke = {from: Point; to: Point; start: number; end: number};
type Fleck = {center: Point; radius: number; angle: number; start: number};
type Patch = {
  origin: Point;
  rim: {base: Point; tip: Point}[];
  gradient: CanvasGradient;
  bounds: [number, number, number, number];
  start: number;
  end: number;
  shape: Path2D;
};

const step = (point: Point, angle: number, distance: number): Point =>
  ({x: point.x + Math.cos(angle) * distance, y: point.y + Math.sin(angle) * distance});

const between = (a: Point, b: Point, fraction: number): Point =>
  ({x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction});

export class SnowFrost {
  private strokes: Stroke[][] = [[], []];
  private flecks: Fleck[] = [];
  private patches: Patch[] = [];
  private paths: Path2D[] = [];
  private grain = new Path2D();
  private lastGrowth = -1;
  private unit: number;
  private seed = 183247;

  constructor(ctx: CanvasRenderingContext2D, readonly width: number, readonly height: number, readonly high: boolean) {
    const unit = this.unit = Math.min(width, height);
    for (let side = 0; side < 4; side++) {
      const length = side % 2 === 0 ? width : height;
      const count = Math.max(7, Math.min(18, Math.round(length / (unit * 0.108))));
      const spacing = length / count;
      const inward = (side + 1) * Math.PI / 2;
      const edgePoint = (along: number, inset: number): Point => {
        if (side === 0) return {x: along, y: inset};
        if (side === 1) return {x: width - inset, y: along};
        if (side === 2) return {x: width - along, y: height - inset};
        return {x: inset, y: height - along};
      };
      for (let i = 0; i < count; i++) {
        const along = spacing * (i + 0.24 + this.random() * 0.52);
        const corner = i === 0 || i === count - 1;
        const depth = unit * ((corner ? 0.125 : 0.063) + this.random() * (corner ? 0.031 : 0.075));
        const start = (corner ? 0.09 : 0.14 + i % 3 * 0.07) + this.random() * 0.105;
        const duration = 0.29 + this.random() * 0.12;
        const halfWidth = spacing * (0.63 + this.random() * 0.38);
        const origin = edgePoint(along, 0);
        const rim = Array.from({length: 13}, (_, index) => {
          const t = index / 12;
          const x = along + (t * 2 - 1) * halfWidth;
          const rise = Math.sin(t * Math.PI) ** 0.63 * (0.56 + this.random() * 0.38);
          return {base: edgePoint(x, 0), tip: edgePoint(x, depth * rise)};
        });
        const radius = Math.max(depth, halfWidth) * 1.2;
        const gradient = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, radius);
        gradient.addColorStop(0, "#72c5f4ec");
        gradient.addColorStop(0.42, "#91d4f5a8");
        gradient.addColorStop(0.8, "#bce7fc3d");
        gradient.addColorStop(1, "#bce7fc00");
        this.patches.push({origin, rim, gradient, bounds: [origin.x - radius, origin.y - radius, 2 * radius, 2 * radius],
          start, end: start + duration, shape: new Path2D()});

        const sideBias = i % 2 === 0 ? -1 : 1;
        const stems = high && i % 3 === 0 ? [0, sideBias, -sideBias] : [0, sideBias];
        for (const stem of stems) {
          const root = edgePoint(along + stem * halfWidth * 0.34, depth * this.random() * 0.11);
          const angle = inward + stem * 0.63 + (this.random() - 0.5) * 0.5;
          const reach = depth * (stem === 0 ? 0.91 : 0.62) * (0.84 + this.random() * 0.23);
          this.addFern(root, angle, reach, start + 0.035 + this.random() * 0.07, duration * 0.88, stem === 0);
        }
        for (let fleck = 0; fleck < (high ? 26 : 15); fleck++) {
          const t = this.random();
          const inset = depth * Math.sin(t * Math.PI) * this.random() * 0.86;
          this.flecks.push({
            center: edgePoint(along + (t * 2 - 1) * halfWidth, inset),
            radius: unit * (0.0008 + this.random() * 0.003),
            angle: this.random() * Math.PI,
            start: start + inset / depth * duration * 0.72 + this.random() * 0.08,
          });
        }
        if (i % 4 === 1) {
          this.addCrystal(edgePoint(along, depth * 0.56), depth * 0.28,
            inward + this.random(), 0.06 + this.random() * 0.14);
        }
      }
    }
  }

  private random() {
    this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private addStroke(from: Point, to: Point, start: number, end: number, tier: number) {
    this.strokes[tier].push({from, to, start, end});
  }

  private addFern(root: Point, angle: number, length: number, start: number, duration: number, main: boolean) {
    const bend = (this.random() - 0.5) * 0.52;
    const knee = step(root, angle, length * 0.49);
    const tip = step(knee, angle + bend, length * 0.51);
    const at = (t: number) => t < 0.49 ? between(root, knee, t / 0.49) : between(knee, tip, (t - 0.49) / 0.51);
    const stemTime = duration * 0.75;
    this.addStroke(root, knee, start, start + stemTime * 0.49, 0);
    this.addStroke(knee, tip, start + stemTime * 0.49, start + stemTime, 0);
    const branches = main ? (this.high ? 8 : 6) : 5;
    const twigs = main ? [0.34, 0.68] : [0.52];
    for (let branch = 0; branch < branches; branch++) {
      const t = 0.14 + branch * (0.67 / (branches - 1));
      for (const side of [-1, 1]) {
        const joint = t + this.random() * 0.035;
        const base = at(joint);
        const offshoot = angle + (t > 0.49 ? bend : 0) + side * (0.57 + this.random() * 0.4);
        const reach = length * (1 - t) * (0.43 + this.random() * 0.21);
        const birth = start + stemTime * joint;
        const branchTime = duration * (0.28 - t * 0.1);
        this.addStroke(base, step(base, offshoot, reach), birth, birth + branchTime, 1);
        for (const twig of twigs) {
          const needle = step(base, offshoot, reach * twig);
          const direction = offshoot - side * (0.55 + this.random() * 0.35);
          const twigBirth = birth + branchTime * twig;
          this.addStroke(needle, step(needle, direction, reach * (0.46 - 0.27 * twig)), twigBirth, twigBirth + duration * 0.1, 1);
        }
      }
    }
  }

  private addCrystal(center: Point, radius: number, angle: number, start: number) {
    for (let arm = 0; arm < 6; arm++) {
      const direction = angle + arm * Math.PI / 3;
      this.addStroke(center, step(center, direction, radius), start, start + 0.14, 1);
      for (const t of [0.43, 0.67]) {
        const fork = step(center, direction, radius * t);
        for (const side of [-1, 1])
          this.addStroke(fork, step(fork, direction + side * Math.PI / 3, radius * (1 - t) * 0.46),
            start + 0.14 * t, start + 0.14 * t + 0.09, 1);
      }
    }
  }

  private updatePaths(growth: number) {
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
    for (const patch of this.patches) {
      const amount = clamp((growth - patch.start) / (patch.end - patch.start));
      const spread = 0.35 + 0.65 * amount;
      patch.shape = new Path2D();
      if (amount === 0) continue;
      patch.shape.moveTo(patch.origin.x, patch.origin.y);
      for (const {base, tip} of patch.rim) {
        const edge = between(patch.origin, base, spread);
        patch.shape.lineTo(edge.x + (tip.x - base.x) * amount, edge.y + (tip.y - base.y) * amount);
      }
      patch.shape.closePath();
    }
    this.grain = new Path2D();
    for (const {center, radius, angle, start} of this.flecks) {
      if (growth <= start) continue;
      const size = radius * clamp((growth - start) / 0.08);
      const a = step(center, angle, size);
      const b = step(center, angle + 2.4, size * 0.75);
      const c = step(center, angle - 2.4, size * 0.75);
      this.grain.moveTo(a.x, a.y);
      this.grain.lineTo(b.x, b.y);
      this.grain.lineTo(c.x, c.y);
      this.grain.closePath();
    }
  }

  draw(ctx: CanvasRenderingContext2D, chill: number) {
    const growth = Math.round(chill * 400) / 400;
    if (this.lastGrowth !== growth) {
      this.lastGrowth = growth;
      this.updatePaths(growth);
    }
    for (const {gradient, bounds, start, end, shape} of this.patches) {
      if (chill <= start) continue;
      const amount = clamp((chill - start) / (end - start));
      ctx.fillStyle = gradient;
      ctx.globalAlpha = amount * 0.22;
      ctx.fillRect(...bounds);
      ctx.globalAlpha = amount * 0.58;
      ctx.fill(shape);
    }
    ctx.globalAlpha = 0.46;
    ctx.fillStyle = "#e3f7ff";
    ctx.fill(this.grain);
    for (const [tier, path] of this.paths.entries()) {
      const line = Math.max(0.44, this.unit * 0.0025) * (tier === 0 ? 1.14 : 0.57);
      ctx.lineWidth = line * 2.7;
      ctx.globalAlpha = tier === 0 ? 0.24 : 0.16;
      ctx.strokeStyle = "#86c9f3";
      ctx.stroke(path);
      ctx.lineWidth = line;
      ctx.globalAlpha = tier === 0 ? 0.76 : 0.58;
      ctx.strokeStyle = "#e8faff";
      ctx.stroke(path);
    }
  }
}
