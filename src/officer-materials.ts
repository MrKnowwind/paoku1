import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { Color3 } from "@babylonjs/core/Maths/math.color";

type Surface = "cloth" | "trousers" | "hair" | "face" | "skin" | "leather" | "metal";
type Entry = {material: StandardMaterial; lift: number};
const surfaces: Record<Surface, {specular: number; power: number; lift: number}> = {
  cloth: {specular: 0.018, power: 32, lift: 0.3},
  trousers: {specular: 0.015, power: 32, lift: 0.32},
  hair: {specular: 0.12, power: 40, lift: 0.7},
  face: {specular: 0.015, power: 40, lift: 0.12},
  skin: {specular: 0.025, power: 40, lift: 0.12},
  leather: {specular: 0.22, power: 24, lift: 0.5},
  metal: {specular: 0.3, power: 48, lift: 0.15},
};
const sceneMaterials = new WeakMap<Scene, {entries: Map<string, Entry>; step: number}>();

export function officerMaterial(scene: Scene, surface: Surface, color = "#ffffff") {
  let state = sceneMaterials.get(scene);
  if (!state) {
    state = {entries: new Map(), step: -1}; sceneMaterials.set(scene, state);
  }
  const key = `${surface}-${color}`;
  const existing = state.entries.get(key);
  if (existing) return existing.material;
  const settings = surfaces[surface];
  const material = new StandardMaterial(`officer-${key}`, scene);
  material.diffuseColor = Color3.FromHexString(color).toLinearSpace();
  material.specularColor.setAll(settings.specular); material.specularPower = settings.power;
  // Preserve the texture/vertex colors, including the dark pupils and garment panels.
  material.linkEmissiveWithDiffuse = true;
  material.emissiveFresnelParameters = new FresnelParameters({
    leftColor: Color3.White(), rightColor: new Color3(0.26, 0.26, 0.26), power: 2.5,
  });
  state.entries.set(key, {material, lift: settings.lift}); state.step = -1;
  return material;
}

export function updateOfficerLighting(scene: Scene, night: number, darkness: number, immersed: number) {
  const state = sceneMaterials.get(scene);
  if (!state) return;
  const step = Math.round((0.08 + night * 0.92) * (1 - darkness * 0.72) * (1 - immersed * 0.55) * 64);
  if (state.step === step) return;
  state.step = step;
  for (const {material, lift} of state.entries.values()) {
    const strength = step / 64 * lift;
    material.emissiveColor.set(strength * 0.68, strength * 0.82, strength);
  }
}
