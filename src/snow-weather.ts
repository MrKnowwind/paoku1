const clamp = (v: number) => Math.max(0, Math.min(1, v));
const wrap = (v: number) => v - Math.floor(v);

export class SnowWeather {
  private paint: CanvasRenderingContext2D | null;
  private flakes?: {x: number; y: number; phase: number}[];
  private crystal = new Path2D();
  private lastFrame = "";
  private chill = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.paint = canvas.getContext("2d");
    this.crystal.moveTo(0, 0);
    this.crystal.lineTo(0, 1);
    for (let i = 1; i <= 5; i++) for (const side of [-1, 1]) {
      const at = i * 0.15, reach = (0.36 - at * 0.26) * side;
      this.crystal.moveTo(0, at);
      this.crystal.lineTo(reach, at + 0.2);
      this.crystal.moveTo(reach * 0.58, at + 0.116);
      this.crystal.lineTo(reach * 0.56, at + 0.24);
    }
  }

  update(visible: boolean, storm: number, time: number, cold: number, high: boolean, dt: number, rewinding: boolean) {
    this.canvas.hidden = !visible;
    if (!visible) { this.lastFrame = ""; this.chill = 0; return; }
    const ctx = this.paint;
    if (!ctx) return;
    this.chill = rewinding ? cold : this.chill + (cold - this.chill) * (1 - Math.exp(-dt * 9));
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
      const opacity = layer === 0 ? 0.39 : gust * (layer === 1 ? 0.24 : 0.38);
      if (opacity < 0.01) continue;
      const travel = (0.025 + depth ** 2 * 0.64) * unit;
      const x = wrap(f.x + (time * travel + Math.sin(time * 1.6 + f.phase * 6.28) * unit * 0.024) / (width + 60)) * (width + 60) - 30;
      const y = wrap(f.y + time * (0.045 + 0.16 * depth) * unit / (height + 30)) * (height + 30) - 15;
      const side = clamp(Math.abs(x / width - 0.5) * 2.4);
      ctx.globalAlpha = opacity * (layer === 2 ? side ** 2 : 0.48 + side * 0.52);
      ctx.beginPath();
      const streak = gust * (0.004 + 0.036 * depth ** 2) * unit;
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
    for (const x of [0, width]) for (const y of [0, height]) {
      const radius = unit * (0.12 + 0.24 * this.chill);
      const mist = ctx.createRadialGradient(x, y, 0, x, y, radius);
      mist.addColorStop(0, "#c7ecffb8");
      mist.addColorStop(1, "#b1deff00");
      ctx.globalAlpha = this.chill;
      ctx.fillStyle = mist;
      ctx.fillRect(x ? x - radius : x, y ? y - radius : y, radius, radius);
    }
    ctx.strokeStyle = "#e1f7ff";
    for (let edge = 0; edge < 4; edge++) {
      const horizontal = edge % 2 === 0;
      const length = horizontal ? width : height;
      for (let i = 0; i <= 15; i++) {
        const t = i / 15;
        const growth = clamp((this.chill - Math.min(t, 1 - t) * 1.36) * 2.1);
        if (growth <= 0) continue;
        const size = unit * (0.026 + 0.058 * (0.5 + 0.5 * Math.sin(i * 27.6 + edge))) * (0.4 + 0.6 * growth);
        ctx.save();
        ctx.translate(horizontal ? length * t : edge === 1 ? width : 0, horizontal ? edge === 0 ? 0 : height : length * t);
        ctx.rotate(edge * Math.PI / 2 + Math.sin(i * 9.2 + edge) * 0.54);
        ctx.scale(size, size);
        ctx.lineWidth = Math.max(0.6, unit * 0.0018) / size;
        ctx.globalAlpha = growth * 0.68;
        ctx.stroke(this.crystal);
        ctx.restore();
      }
    }
  }
}
