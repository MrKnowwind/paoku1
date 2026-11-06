import { SnowFrost } from "./snow-frost.ts";

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const wrap = (v: number) => v - Math.floor(v);

export class SnowWeather {
  private paint: CanvasRenderingContext2D | null;
  private flakes?: {x: number; y: number; phase: number}[];
  private lastFrame = "";
  private chill = 0;
  private frost?: SnowFrost;

  constructor(private canvas: HTMLCanvasElement) {
    this.paint = canvas.getContext("2d");
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
    if (this.chill > 0.05) {
      if (this.frost?.width !== width || this.frost.height !== height)
        this.frost = new SnowFrost(ctx, width, height);
      this.frost.draw(ctx, this.chill);
    }
    ctx.globalAlpha = 1;
  }
}
