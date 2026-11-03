import { Scene } from "@babylonjs/core/scene";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

export class CoastSurface {
  readonly material: ShaderMaterial;
  constructor(scene: Scene) {
    this.material = new ShaderMaterial("world-scale-coastal-surface", scene, {
      vertexSource: `precision highp float;
        attribute vec3 position; attribute vec3 normal; attribute vec2 uv; attribute vec4 color;
        uniform mat4 world; uniform mat4 viewProjection; uniform float scroll;
        varying vec3 vPosition; varying vec3 vNormal; varying vec2 vSandUV; varying vec3 vWeights; varying vec2 vWorldUV;
        void main() {
          vec4 p = world * vec4(position, 1.0); vPosition = p.xyz;
          vNormal = normalize(mat3(world) * normal); vSandUV = uv; vWeights = color.rgb;
          vWorldUV = vec2(p.x, p.z + scroll); gl_Position = viewProjection * p;
        }`,
      fragmentSource: `precision highp float;
        uniform sampler2D sand; uniform sampler2D trail; uniform sampler2D stone; uniform sampler2D grass;
        uniform vec3 eye; uniform vec3 fogColor; uniform float fogDensity;
        varying vec3 vPosition; varying vec3 vNormal; varying vec2 vSandUV; varying vec3 vWeights; varying vec2 vWorldUV;
        void main() {
          vec3 sandColor = texture2D(sand, vSandUV).rgb;
          vec3 pathColor = texture2D(trail, vWorldUV / 8.0).rgb * vec3(0.89, 0.86, 0.8);
          vec3 grassColor = texture2D(grass, vWorldUV / 2.5).rgb;
          float road = 1.0 - smoothstep(4.25, 4.4, abs(vWorldUV.x));
          vec3 forestColor = mix(grassColor, pathColor, road);
          vec3 color = forestColor * vWeights.r + texture2D(stone, vWorldUV / 6.0).rgb * vWeights.g + sandColor * vWeights.b;
          float light = 0.68 + max(0.0, dot(normalize(vNormal), normalize(vec3(-0.4, 1.0, -0.3)))) * 0.32;
          float haze = 1.0 - exp(-pow(length(eye - vPosition) * fogDensity, 2.0));
          gl_FragColor = vec4(mix(color * light, fogColor, haze), 1.0);
        }`,
    }, {attributes: ["position", "normal", "uv", "color"],
      uniforms: ["world", "viewProjection", "scroll", "eye", "fogColor", "fogDensity"], samplers: ["sand", "trail", "stone", "grass"]});
    for (const [name, file] of Object.entries({sand: "beach-sand-v2.webp", trail: "woodland-trail.webp", stone: "canyon-trail.webp", grass: "woodland-grass.webp"})) {
      const texture = new Texture(import.meta.env.BASE_URL + "art/" + file, scene);
      texture.anisotropicFilteringLevel = 8;
      if (name === "sand") texture.wrapU = texture.wrapV = Texture.MIRROR_ADDRESSMODE;
      this.material.setTexture(name, texture);
    }
    this.material.onBindObservable.add(() => {
      if (scene.activeCamera) this.material.setVector3("eye", scene.activeCamera.globalPosition);
      this.material.setColor3("fogColor", scene.fogColor).setFloat("fogDensity", scene.fogDensity);
    });
  }
  update(distance: number) { this.material.setFloat("scroll", distance); }
}
