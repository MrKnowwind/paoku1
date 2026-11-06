const clamp = (v: number) => Math.max(0, Math.min(1, v));
const wrap = (v: number) => v - Math.floor(v);

type FrostMask = { gradient: CanvasGradient; bounds: [number, number, number, number] };

export class SnowWeather {
  private paint: CanvasRenderingContext2D | null;
  private flakes?: {x: number; y: number; phase: number}[];
  private crystal = new Path2D();
  private lastFrame = "";
  private chill = 0;
  private masks?: {width: number; height: number; corners: FrostMask[]; edges: FrostMask[]};

  constructor(private canvas: HTMLCanvasElement) {
    this.paint = canvas.getContext("2d");
    for (let arm = 0; arm < 6; arm++) {
      const angle = arm * Math.PI / 3;
      const x = Math.cos(angle), y = Math.sin(angle);
      this.crystal.moveTo(0, 0);
      this.crystal.lineTo(x, y);
      for (const [at, reach] of [[0.44, 0.2], [0.73, 0.16]]) {
        const tip = at + reach / Math.sqrt(3);
        this.crystal.moveTo(tip * x - reach * y, tip * y + reach * x);
        this.crystal.lineTo(at * x, at * y);
        this.crystal.lineTo(tip * x + reach * y, tip * y - reach * x);
      }
    }
  }

  update(visible: boolean, storm: number, time: number, cold: number, high: boolean, dt: number, rewinding: boolean) {
    this.canvas.hidden = !visible;
    if (!visible) { this.lastFrame = ""; this.chill = 0; return; }
    const ctx = this.paint;
    if (!ctx) return;
    const frostResponse = cold < this.chill ? 7 : 9;
    this.chill = rewinding ? cold : this.chill + (cold - this.chill) * (1 - Math.exp(-dt * frostResponse));
    if (Math.abs(this.chill - cold) < 0.001) this.chill = cold;
    const scale = Math.min(high ? 1 : 0.65, 1500 / Math.max(innerWidth, innerHeight));
    const width = Math.max(1, Math.round(this.canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * scale));
    const frame = [width, height, time, this.chill, storm, high].join("/");
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    const unit = Math.min(width, height);
    const gust = storm * (0.86 + 0.14 * Math.sin(time * 2));
    const flakes = this.flakes ??= Array.from({length: 120}, () => ({x: Math.random(), y: Math.random(), phase: Math.random()}));
    ctx.strokeStyle = ctx.fillStyle = "#eef9ff";
    ctx.lineCap = "round";
    for (const [i, f] of flakes.entries()) {
      if (!high && i % 2) continue;
      const layer = i < 46 ? 0 : i < 108 ? 1 : 2;
      const depth = (layer + f.phase) / 3;
      const opacity = layer === 0 ? 0.39 : gust * (layer === 1 ? 0.38 : 0.55);
      if (opacity < 0.01) continue;
      const travel = (0.025 + depth ** 2 * 0.64) * unit;
      const x = wrap(f.x + (time * travel + Math.sin(time * 1.6 + f.phase * 6.28) * unit * 0.024) / (width + 60)) * (width + 60) - 30;
      const y = wrap(f.y + time * (0.045 + 0.16 * depth) * unit / (height + 30)) * (height + 30) - 15;
      const side = clamp(Math.abs(x / width - 0.5) * 2.4);
      ctx.globalAlpha = opacity * (layer === 2 ? side ** 2 : 0.5 + side * 0.5);
      ctx.beginPath();
      const streak = gust * (0.006 + 0.053 * depth ** 2) * unit;
      if (layer === 0) {
        ctx.ellipse(x, y, scale * (0.75 + gust * 1.1), scale * 0.75, 0.2, 0, 2 * Math.PI);
        ctx.fill();
      } else {
        ctx.lineWidth = (0.75 + depth * 1.6) * scale;
        ctx.moveTo(x, y);
        ctx.lineTo(x - streak, y - streak * 0.24);
        ctx.stroke();
      }
    }
    this.frost(ctx, width, height, unit);
    ctx.globalAlpha = 1;
  }

  private frost(ctx: CanvasRenderingContext2D, width: number, height: number, unit: number) {
    if (this.chill <= 0.01) return;
    const masks = this.masks?.width === width && this.masks.height === height
      ? this.masks : this.makeFrostMasks(ctx, width, height, unit);
    ctx.globalAlpha = this.chill ** 0.76;
    for (const {gradient, bounds} of masks.corners) {
      ctx.fillStyle = gradient;
      ctx.fillRect(...bounds);
    }
    ctx.globalAlpha = clamp((this.chill - 0.17) / 0.7);
    if (ctx.globalAlpha > 0) for (const {gradient, bounds} of masks.edges) {
      ctx.fillStyle = gradient;
      ctx.fillRect(...bounds);
    }
    for (let edge = 0; edge < 4; edge++) {
      const horizontal = edge % 2 === 0;
      const length = horizontal ? width : height;
      const count = Math.min(18, Math.round(length / unit * 10));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const growth = clamp((this.chill - 0.06 - Math.min(t, 1 - t) * 0.48) * 2.3);
        if (growth <= 0) continue;
        const radius = Math.min(unit * (0.024 + 0.037 * (0.5 + 0.5 * Math.sin(i * 27.6 + edge))), length / count * 0.43);
        const size = radius * (0.35 + 0.65 * growth);
        const inset = size * (1.02 + 0.16 * (0.5 + 0.5 * Math.cos(i * 13.7 + edge)));
        ctx.save();
        ctx.translate(horizontal ? length * t : edge === 1 ? width - inset : inset,
          horizontal ? edge === 0 ? inset : height - inset : length * t);
        ctx.rotate(edge * Math.PI / 2 + Math.sin(i * 9.2 + edge) * 0.54);
        ctx.scale(size, size);
        const line = Math.max(0.55, unit * 0.0017) / size;
        ctx.strokeStyle = "#365e8a";
        ctx.lineWidth = line * 2.25;
        ctx.globalAlpha = growth * 0.57;
        ctx.stroke(this.crystal);
        ctx.strokeStyle = "#e9faff";
        ctx.lineWidth = line;
        ctx.globalAlpha = growth * 0.91;
        ctx.stroke(this.crystal);
        ctx.restore();
      }
    }
  }

  private makeFrostMasks(ctx: CanvasRenderingContext2D, width: number, height: number, unit: number) {
    const corners: FrostMask[] = [];
    const radius = unit * 0.32;
    for (const x of [0, width]) for (const y of [0, height]) {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "#4f80bcd9");
      gradient.addColorStop(0.45, "#6e9bcd64");
      gradient.addColorStop(1, "#6e9bcd00");
      corners.push({gradient, bounds: [x ? x - radius : 0, y ? y - radius : 0, radius, radius]});
    }
    const edges: FrostMask[] = [];
    const depth = unit * 0.15;
    for (let side = 0; side < 4; side++) {
      const horizontal = side < 2;
      const start = side === 1 ? height : side === 3 ? width : 0;
      const end = start === 0 ? depth : start - depth;
      const gradient = horizontal ? ctx.createLinearGradient(0, start, 0, end) : ctx.createLinearGradient(start, 0, end, 0);
      gradient.addColorStop(0, "#385d97b8");
      gradient.addColorStop(0.32, "#6a9bd270");
      gradient.addColorStop(1, "#6a9bd200");
      const min = Math.min(start, end);
      edges.push({gradient, bounds: horizontal ? [0, min, width, depth] : [min, 0, depth, height]});
    }
    return this.masks = {width, height, corners, edges};
  }
}
