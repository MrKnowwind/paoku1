// Fixed resolution, independent of device DPI. Pixel reads occur only on a new splat.
export class InkOverlay {
  private ctx: CanvasRenderingContext2D;
  private mask: Uint8Array;
  private total = 0;
  private left = 0;
  private pointer?: {id: number; x: number; y: number};
  constructor(readonly canvas: HTMLCanvasElement, private cleared: () => void) {
    canvas.width = 240; canvas.height = 240;
    this.ctx = canvas.getContext("2d", {willReadFrequently: true})!;
    this.mask = new Uint8Array(240 * 240);
  }
  reset() {
    this.cancel(); this.mask.fill(0); this.total = this.left = 0;
    this.ctx.clearRect(0, 0, 240, 240); this.canvas.hidden = true;
  }
  splat(random = Math.random) {
    const ctx = this.ctx;
    // Replace rather than accumulate: repeated ink never blankets the entire screen.
    ctx.clearRect(0, 0, 240, 240); ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(9, 12, 28, .91)";
    const cx=80+random()*80,cy=95+random()*50,rx=62+random()*14,ry=52+random()*12;
    const phase=random()*Math.PI*2,phase2=random()*Math.PI*2,lobes=5+Math.floor(random()*4);
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const a = i / 96 * Math.PI * 2, r = 1 + 0.15 * Math.sin(a * lobes+phase) + 0.09 * Math.cos(a * 11+phase2);
      const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    for (let i = 0; i < 15; i++) {
      const a = i * 2.39996+phase,r=1.12+random()*0.18;
      ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * rx*r, cy + Math.sin(a) * ry*r,
        2 + random()*5, 3 + random()*6, a, 0, Math.PI * 2); ctx.fill();
    }
    const data = ctx.getImageData(0, 0, 240, 240).data;
    this.total = 0;
    for (let i = 0; i < this.mask.length; i++) {
      this.mask[i] = data[i * 4 + 3] > 20 ? 1 : 0; this.total += this.mask[i];
    }
    this.left = this.total;
  }
  private point(event: PointerEvent) {
    return {x: event.clientX / innerWidth * 240, y: event.clientY / innerHeight * 240};
  }
  down(event: PointerEvent) {
    if (this.canvas.hidden || this.pointer || !event.isPrimary || event.button !== 0) return false;
    const p = this.point(event);
    this.pointer = {id: event.pointerId, ...p}; this.canvas.setPointerCapture(event.pointerId);
    this.move(event); return true;
  }
  move(event: PointerEvent) {
    const previous = this.pointer;
    if (!previous || previous.id !== event.pointerId) return false;
    const p = this.point(event), dx = p.x - previous.x, dy = p.y - previous.y;
    // Equal screen-space brush radius on both orientations, mapped into mask coordinates.
    const rx = 28 / innerWidth * 240, ry = 28 / innerHeight * 240;
    const ax = previous.x / rx, ay = previous.y / ry, bx = p.x / rx, by = p.y / ry;
    const vx = bx - ax, vy = by - ay, length = vx * vx + vy * vy;
    for (let y = Math.max(0, Math.floor(Math.min(previous.y, p.y) - ry)); y <= Math.min(239, Math.ceil(Math.max(previous.y, p.y) + ry)); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(previous.x, p.x) - rx)); x <= Math.min(239, Math.ceil(Math.max(previous.x, p.x) + rx)); x++) {
        const index = y * 240 + x;
        if (!this.mask[index]) continue;
        const px = (x + 0.5) / rx - ax, py = (y + 0.5) / ry - ay;
        const t = length ? Math.max(0, Math.min(1, (px * vx + py * vy) / length)) : 0;
        if ((px - t * vx) ** 2 + (py - t * vy) ** 2 <= 1) { this.mask[index] = 0; this.left--; }
      }
    }
    const ctx = this.ctx;
    ctx.save(); ctx.scale(rx, ry); ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#000"; ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx, by, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    this.pointer = {id: event.pointerId, x: previous.x + dx, y: previous.y + dy};
    if (this.left <= this.total * 0.15) {
      this.ctx.clearRect(0, 0, 240, 240); this.mask.fill(0); this.left = 0;
      this.canvas.hidden = true; this.cleared();
    }
    return true;
  }
  up(event: PointerEvent) {
    if (this.pointer?.id !== event.pointerId) return false;
    this.cancel(); return true;
  }
  cancel() {
    if (this.pointer && this.canvas.hasPointerCapture(this.pointer.id)) this.canvas.releasePointerCapture(this.pointer.id);
    this.pointer = undefined;
  }
}
