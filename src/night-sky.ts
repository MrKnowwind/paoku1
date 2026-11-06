import { Layer } from "@babylonjs/core/Layers/layer";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Scene } from "@babylonjs/core/scene";

export class NightSky {
  private layer: Layer;
  private texture: DynamicTexture;
  private aspect = 0;

  constructor(scene: Scene) {
    this.layer = new Layer("night-sky", null, scene, true);
    this.texture = new DynamicTexture("night-sky-art", 512, scene, false);
    this.texture.hasAlpha = true;
    this.texture.isBlocking = false;
    this.layer.texture = this.texture;
  }

  update(opacity: number, aspect: number) {
    this.layer.isEnabled = opacity > 0.002;
    this.layer.color.a = opacity;
    if (!this.layer.isEnabled || Math.abs(this.aspect - aspect) < 0.015) return;
    this.aspect = aspect;
    const ctx = this.texture.getContext();
    const size = 512;
    ctx.clearRect(0, 0, size, size);
    const gradient = ctx.createLinearGradient(0, 0, 0, size * 0.65);
    gradient.addColorStop(0, "rgba(6, 12, 34, 0.92)");
    gradient.addColorStop(0.52, "rgba(24, 40, 77, 0.45)");
    gradient.addColorStop(1, "rgba(57, 75, 117, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const rand = (i: number) => {
      const v = Math.sin(i * 127.1 + 311.7) * 43758.5453123;
      return v - Math.floor(v);
    };
    const scale = Math.min(1, aspect);
    for (let i = 0; i < 76; i++) {
      const x = 14 + rand(i * 3) * 484;
      const y = 10 + rand(i * 3 + 1) * 205;
      const strength = rand(i * 3 + 2);
      const radius = (0.58 + strength ** 3 * 1.3) * scale;
      ctx.fillStyle = `rgba(218, 234, 255, ${(0.2 + strength * 0.7) * (1 - y / 320)})`;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1 / aspect, 1);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(size * 0.72, size * 0.17);
    ctx.scale(scale / aspect, scale);
    const halo = ctx.createRadialGradient(0, 0, 11, 0, 0, 66);
    halo.addColorStop(0, "rgba(175, 213, 255, 0.65)");
    halo.addColorStop(0.32, "rgba(126, 178, 252, 0.24)");
    halo.addColorStop(1, "rgba(126, 178, 252, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-66, -66, 132, 132);
    const moon = ctx.createLinearGradient(-14, -14, 12, 16);
    moon.addColorStop(0, "#fff5d9");
    moon.addColorStop(1, "#abc7eb");
    ctx.fillStyle = moon;
    ctx.beginPath();
    ctx.arc(0, 0, 15.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(83, 117, 164, 0.18)";
    for (const [x, y, width, height] of [[-5, 2, 5, 3], [5, 7, 3, 2], [2, -6, 4, 2], [-9, -4, 2, 2]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.38);
      ctx.scale(width, height);
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    this.texture.update();
  }
}
