import { snowMaterial } from "./snow-materials.ts";
import type { ForestProps } from "./props.ts";
import { Scene } from "@babylonjs/core/scene";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

export class CoastSurface {
  readonly material: ShaderMaterial;
  readonly fallback: StandardMaterial;
  private snowReady = false;
  constructor(private scene: Scene, private forest: ForestProps) {
    this.fallback = new StandardMaterial("coastal-ground-fallback", scene);
    this.fallback.specularColor.setAll(0);
    this.material = new ShaderMaterial("world-scale-coastal-surface", scene, {
      vertexSource: `precision highp float;
        attribute vec3 position; attribute vec3 normal; attribute vec2 uv; attribute vec4 coastWeights;
        uniform mat4 world; uniform mat4 viewProjection; uniform float scroll;
        varying vec3 vPosition; varying vec3 vNormal; varying vec2 vSandUV; varying vec4 vWeights; varying vec2 vWorldUV;
        void main() {
          vec4 p = world * vec4(position, 1.0); vPosition = p.xyz;
          vNormal = normalize(mat3(world) * normal); vSandUV = uv; vWeights = coastWeights;
          vWorldUV = vec2(p.x, p.z + scroll); gl_Position = viewProjection * p;
        }`,
      fragmentSource: `precision highp float;
        uniform sampler2D sand; uniform sampler2D trail; uniform sampler2D stone; uniform sampler2D grass; uniform sampler2D packedSnow;
        uniform vec3 eye; uniform vec3 fogColor; uniform float fogDensity;
        varying vec3 vPosition; varying vec3 vNormal; varying vec2 vSandUV; varying vec4 vWeights; varying vec2 vWorldUV;
        void main() {
          vec3 sandColor = texture2D(sand, vSandUV).rgb;
          vec3 pathColor = texture2D(trail, vWorldUV / 8.0).rgb * vec3(0.89, 0.86, 0.8);
          vec3 grassColor = texture2D(grass, vWorldUV / 2.5).rgb;
          float road = 1.0 - smoothstep(4.25, 4.4, abs(vWorldUV.x));
          vec3 forestColor = mix(grassColor, pathColor, road);
          vec3 color = forestColor * vWeights.r + texture2D(stone, vWorldUV / 6.0).rgb * vWeights.g + sandColor * vWeights.b;
          float grain = sin(vWorldUV.x * 13.0 + sin(vWorldUV.y * 5.0)) * sin(vWorldUV.y * 19.0) * 0.018;
          vec3 snowGrain = texture2D(packedSnow, vWorldUV / 2.8).rgb;
          vec3 snow = snowGrain * mix(vec3(0.88, 0.94, 1.0), vec3(1.0), smoothstep(3.8, 5.5, abs(vWorldUV.x))) + grain;
          color += snow * vWeights.a;
          float light = 0.68 + max(0.0, dot(normalize(vNormal), normalize(vec3(-0.4, 1.0, -0.3)))) * 0.32;
          float haze = 1.0 - exp(-pow(length(eye - vPosition) * fogDensity, 2.0));
          gl_FragColor = vec4(mix(color * light, fogColor, haze), 1.0);
        }`,
    }, {attributes: ["position", "normal", "uv", "coastWeights"],
      uniforms: ["world", "viewProjection", "scroll", "eye", "fogColor", "fogDensity"], samplers: ["sand", "trail", "stone", "grass", "packedSnow"]});
    for (const [name, file] of Object.entries({sand: "beach-sand-v2.webp", trail: "woodland-trail.webp", stone: "canyon-trail.webp", grass: "woodland-grass.webp"})) {
      const texture = new Texture(import.meta.env.BASE_URL + "art/" + file, scene);
      texture.anisotropicFilteringLevel = 8;
      if (name === "sand") {
        texture.wrapU = texture.wrapV = Texture.MIRROR_ADDRESSMODE;
        texture.onLoadObservable.addOnce(() => { this.fallback.diffuseTexture = texture; });
      }
      if (name === "grass") this.material.setTexture("packedSnow", texture);
      this.material.setTexture(name, texture);
    }
    this.material.onBindObservable.add(() => {
      if (scene.activeCamera) this.material.setVector3("eye", scene.activeCamera.globalPosition);
      this.material.setColor3("fogColor", scene.fogColor).setFloat("fogDensity", scene.fogDensity);
    });
  }

  useSnow() {
    if (this.snowReady) return;
    this.material.setTexture("packedSnow", snowMaterial(this.scene, "snow", this.forest).diffuseTexture!);
    this.snowReady = true;
  }

  update(distance: number) { this.material.setFloat("scroll", distance); }
}
