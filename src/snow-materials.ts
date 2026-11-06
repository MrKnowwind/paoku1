import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import type { ForestProps } from "./props.ts";

type WinterSurface = "snow" | "ice" | "water" | "glass" | "label" | "cloth" | "needles";
const cache = new WeakMap<Scene, Map<WinterSurface, StandardMaterial>>();

// Shared 1024px mipmapped surfaces are baked only on first snow/lesson use.
// Wood, end grain, rocks and woven cloth reuse the earlier terrain's materials.
export function snowMaterial(scene: Scene, surface: WinterSurface, forest: ForestProps) {
  let materials = cache.get(scene);
  if (!materials) { materials = new Map(); cache.set(scene, materials); }
  const cached = materials.get(surface);
  if (cached) return cached;
  const material = surface === "cloth" || surface === "needles"
    ? forest.surfaceMaterial(surface === "cloth" ? "fabric" : "foliage").clone("winter-" + surface)!
    : new StandardMaterial("winter-" + surface, scene);
  materials.set(surface, material);
  material.specularColor.setAll(0.06);
  if (surface === "cloth" || surface === "needles") {
    material.diffuseColor = Color3.FromHexString(surface === "cloth" ? "#a53e36" : "#41615b");
    return material;
  }
  if (surface === "glass") {
    material.diffuseColor = Color3.FromHexString("#496d4b");
    material.specularColor = Color3.FromHexString("#f1fbf3"); material.specularPower = 160;
    material.alpha = 0.88;
    material.emissiveFresnelParameters = new FresnelParameters({leftColor: Color3.FromHexString("#aec6a8").scale(0.25), rightColor: Color3.Black(), power: 3});
    return material;
  }
  const size = 1024;
  const texture = new DynamicTexture("winter-detail-" + surface, size, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  texture.anisotropicFilteringLevel = 16;
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  let seed = 738219;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  ctx.fillStyle = {snow: "#e5eef5", ice: "#85b8cf", water: "#173e51", label: "#ead7a8"}[surface];
  ctx.fillRect(0, 0, size, size);
  if (surface === "snow") {
    for (let i = 0; i < 38; i++) {
      const x = random() * size, y = random() * size, radius = 26 + random() * 92;
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        const glow = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
        glow.addColorStop(0, i % 3 ? "#ffffff32" : "#8caec345"); glow.addColorStop(1, "#dfeaf500");
        ctx.fillStyle = glow; ctx.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
      }
    }
    for (let i = 0; i < 32000; i++) {
      const x = random() * size, y = random() * size, r = 0.4 + random() * 1.9;
      ctx.fillStyle = i % 3 ? "#ffffff" : "#89a7be"; ctx.globalAlpha = 0.08 + random() * 0.18;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, random() * 6.28, 0, Math.PI * 2); ctx.fill();
    }
    // Wind-carved ripples retain world scale instead of stretching one flat fill.
    ctx.strokeStyle = "#b2c7d8"; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.12;
    for (let row = -50; row < size + 50; row += 32) {
      ctx.beginPath();
      for (let x = 0; x <= size; x += 8) {
        const y = row + Math.sin(x / size * Math.PI * 4 + row * 0.06) * 10;
        if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (surface === "ice") {
    for (let i = 0; i < 8500; i++) {
      ctx.globalAlpha = 0.05 + random() * 0.13; ctx.fillStyle = i % 2 ? "#ddf5ff" : "#3b789a";
      ctx.fillRect(random() * size, random() * size, 1 + random() * 3, 2 + random() * 10);
    }
    for (let i = 0; i < 17; i++) {
      let x = random() * size, y = random() * size;
      ctx.strokeStyle = i % 2 ? "#e6f8ff" : "#365c79"; ctx.lineWidth = 1.7 + random() * 2.2; ctx.globalAlpha = 0.66;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let n = 0; n < 8; n++) {
        x += (random() - 0.5) * 145; y += 20 + random() * 65; ctx.lineTo(x, y);
        if (n % 2 === 0) { ctx.lineTo(x + (i % 2 ? 1 : -1) * (32 + random() * 70), y + 34); ctx.moveTo(x, y); }
      }
      ctx.stroke();
    }
    material.specularColor.setAll(0.75); material.specularPower = 128;
    material.emissiveFresnelParameters = new FresnelParameters({leftColor: Color3.FromHexString("#c7e5f2").scale(0.35), rightColor: Color3.Black(), power: 4});
  } else if (surface === "water") {
    for (let i = 0; i < 100; i++) {
      ctx.strokeStyle = i % 3 ? "#4c8b9f" : "#9ad3de"; ctx.globalAlpha = 0.12 + random() * 0.18;
      ctx.lineWidth = 0.7 + random(); ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 12 + random() * 65, 2 + random() * 9, 0, 0, Math.PI * 2); ctx.stroke();
    }
    material.specularColor.setAll(0.7); material.specularPower = 112;
  } else {
    for (let i = 0; i < 16000; i++) { ctx.globalAlpha = random() * 0.12; ctx.fillStyle = i % 2 ? "#ffffff" : "#9a794b"; ctx.fillRect(random() * size, random() * size, 1, 1); }
    ctx.globalAlpha = 1; ctx.strokeStyle = "#795d36"; ctx.lineWidth = 6; ctx.strokeRect(35, 55, 954, 914);
    ctx.lineWidth = 2; ctx.strokeRect(48, 68, 928, 888);
    ctx.fillStyle = "#af6e36"; ctx.beginPath(); ctx.arc(512, 340, 95, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#536858"; ctx.lineWidth = 20; ctx.lineJoin = "round"; ctx.beginPath();
    ctx.moveTo(180, 690); ctx.lineTo(420, 390); ctx.lineTo(540, 540); ctx.lineTo(650, 420); ctx.lineTo(850, 690); ctx.stroke();
    for (let i = 0; i < 3; i++) { ctx.lineWidth = 5 - i; ctx.beginPath(); ctx.moveTo(230 + i * 30, 770 + i * 30); ctx.lineTo(794 - i * 30, 770 + i * 30); ctx.stroke(); }
  }
  ctx.globalAlpha = 1; texture.update(); material.diffuseTexture = texture;
  if (surface === "snow" || surface === "ice") {
    const bump = new DynamicTexture("winter-micro-normal-" + surface, 512, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    const context = bump.getContext() as CanvasRenderingContext2D;
    const data = context.createImageData(512, 512);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const u = x / 512 * Math.PI * 2, v = y / 512 * Math.PI * 2;
      const i = (y * 512 + x) * 4;
      data.data[i] = 128 + Math.round(11 * Math.sin(u * 19 + v * 13) + 5 * Math.cos(u * 43 - v * 22));
      data.data[i + 1] = 128 + Math.round(10 * Math.cos(v * 19 - u * 11) + 4 * Math.sin(v * 31 + u * 17));
      data.data[i + 2] = 254; data.data[i + 3] = 255;
    }
    context.putImageData(data, 0, 0); bump.update(); bump.level = surface === "snow" ? 0.22 : 0.35;
    bump.anisotropicFilteringLevel = 16; material.bumpTexture = bump;
  }
  return material;
}
