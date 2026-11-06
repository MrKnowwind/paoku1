import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";

const winterMaterials = new WeakMap<StandardMaterial, StandardMaterial>();
export const WINTER_VERTEX = "winterUVAndCover";

// The original material still supplies the lighting, shadows, and uncovered
// ground. Snow changes the surface of that mesh, without a second skin above it.
class SnowLayer extends MaterialPluginBase {
  constructor(material: StandardMaterial, private texture: BaseTexture) {
    super(material, "SnowLayer", 110, {}, true, true);
  }
  override getAttributes(attributes: string[]) { attributes.push(WINTER_VERTEX); }
  override getSamplers(samplers: string[]) { samplers.push("winterSnowSampler"); }
  override bindForSubMesh(buffer: UniformBuffer) { buffer.setTexture("winterSnowSampler", this.texture); }
  override getCustomCode(stage: string): Record<string, string> {
    if (stage === "vertex") return {
      CUSTOM_VERTEX_DEFINITIONS: `attribute vec3 ${WINTER_VERTEX}; varying vec3 vWinterSurface;`,
      CUSTOM_VERTEX_MAIN_END: `vWinterSurface = ${WINTER_VERTEX};`,
    };
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "uniform sampler2D winterSnowSampler; varying vec3 vWinterSurface;",
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
        float cover = vWinterSurface.z;
        vec2 winterUV = vWinterSurface.xy;
        float drift = sin(winterUV.x * 4.1 + winterUV.y * 2.7) * sin(winterUV.y * 1.6 - winterUV.x * 3.5);
        cover = clamp(cover + drift * cover * (1.0 - cover) * 0.8, 0.0, 1.0);
        baseColor.rgb = mix(baseColor.rgb, texture2D(winterSnowSampler, winterUV).rgb, cover);
        diffuseColor = mix(diffuseColor, vec3(1.0), cover);
      `,
    };
  }
}
export function withSnowLayer(base: StandardMaterial, snow: BaseTexture) {
  let material = winterMaterials.get(base);
  if (!material) {
    material = base.clone(`${base.name}-winter`)!;
    new SnowLayer(material, snow);
    winterMaterials.set(base, material);
  }
  return material;
}

export function refreshSnowLayer(base: StandardMaterial) {
  const material = winterMaterials.get(base);
  if (!material) return;
  material.diffuseTexture = base.diffuseTexture;
  material.emissiveTexture = base.emissiveTexture;
  material.diffuseColor.copyFrom(base.diffuseColor);
  material.emissiveColor.copyFrom(base.emissiveColor);
}
