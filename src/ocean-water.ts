import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

const vertexSource = `
precision highp float;
attribute vec3 position;
attribute float waterDepth;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float surfaceTime;
uniform float scroll;
varying vec3 vPosition;
varying vec2 vOcean;
varying float vDepth;
void main() {
  vec3 p = (world * vec4(position, 1.0)).xyz;
  vec2 ocean = vec2(p.x, p.z + scroll);
  float a = dot(ocean, vec2(0.38, 0.48)) + surfaceTime * 1.15;
  float b = dot(ocean, vec2(-0.63, 0.27)) - surfaceTime * 0.83;
  p.y += sin(a) * 0.075 + sin(b) * 0.045;
  vPosition = p; vOcean = ocean; vDepth = waterDepth;
  gl_Position = viewProjection * vec4(p, 1.0);
}`;

const fragmentSource = `
precision highp float;
uniform float surfaceTime;
uniform vec3 eye;
varying vec3 vPosition;
varying vec2 vOcean;
varying float vDepth;
void main() {
  if (vDepth < 0.015) discard;
  float a = dot(vOcean, vec2(0.38, 0.48)) + surfaceTime * 1.15;
  float b = dot(vOcean, vec2(-0.63, 0.27)) - surfaceTime * 0.83;
  float fine = sin(vOcean.x * 3.1 + surfaceTime) * cos(vOcean.y * 2.7 - surfaceTime * 0.8);
  vec3 normal = normalize(vec3(-cos(a) * 0.075 * 0.38 + cos(b) * 0.045 * 0.63 + fine * 0.035,
    1.0, -cos(a) * 0.075 * 0.48 - cos(b) * 0.045 * 0.27 + fine * 0.025));
  vec3 view = normalize(eye - vPosition);
  bool below = eye.y < vPosition.y;
  if (below) normal = -normal;
  float fresnel = 0.07 + 0.73 * pow(1.0 - max(dot(normal, view), 0.0), 3.0);
  vec3 reflected = reflect(-view, normal);
  vec3 sky = mix(vec3(0.58, 0.81, 0.85), vec3(0.29, 0.62, 0.78), clamp(reflected.y, 0.0, 1.0));
  vec3 body = mix(vec3(0.22, 0.72, 0.68), vec3(0.035, 0.34, 0.47), clamp(vDepth / 6.0, 0.0, 1.0));
  vec3 color = mix(body, sky, fresnel);
  vec3 sun = normalize(vec3(-0.4, 0.85, -0.3));
  float glint = pow(max(dot(reflect(-sun, normal), view), 0.0), 100.0);
  color += vec3(1.0, 0.94, 0.74) * glint * 0.9;
  float lace = sin(vOcean.x * 4.0 + sin(vOcean.y * 2.2 + surfaceTime))
    + sin(vOcean.y * 3.3 - surfaceTime * 1.5 + cos(vOcean.x * 1.8));
  float foam = (1.0 - smoothstep(0.08, 0.95, vDepth))
    * smoothstep(-0.45, 0.8, lace + sin(surfaceTime * 1.4 + vDepth * 9.0));
  color = mix(color, vec3(0.89, 0.97, 0.93), below ? 0.0 : foam * 0.88);
  if (below) color = mix(color, vec3(0.39, 0.82, 0.8), 0.35) + max(0.0, lace - 1.1) * 0.12;
  float haze = 1.0 - exp(-length(eye - vPosition) * 0.006);
  color = mix(color, vec3(0.42, 0.7, 0.75), haze);
  gl_FragColor = vec4(color, below ? 0.62 : 0.87);
}`;

export class OceanWater {
  readonly material: ShaderMaterial;
  readonly causticMaterial: ShaderMaterial;
  constructor(private scene: Scene) {
    this.material = new ShaderMaterial("moving-ocean-surface", scene, {vertexSource, fragmentSource}, {
      attributes: ["position", "waterDepth"],
      uniforms: ["world", "viewProjection", "surfaceTime", "scroll", "eye"],
      needAlphaBlending: true,
    });
    this.material.backFaceCulling = false;
    this.material.onBindObservable.add(() => {
      if (scene.activeCamera) this.material.setVector3("eye", scene.activeCamera.globalPosition);
    });
    this.causticMaterial = new ShaderMaterial("refracted-seabed-light", scene, {
      vertexSource: `precision highp float;
        attribute vec3 position; uniform mat4 world; uniform mat4 viewProjection;
        uniform float scroll; varying vec2 vOcean;
        void main() { vec4 p = world * vec4(position, 1.0); vOcean = vec2(p.x, p.z + scroll); gl_Position = viewProjection * p; }`,
      fragmentSource: `precision highp float;
        uniform float surfaceTime; varying vec2 vOcean;
        void main() {
          float a = sin(vOcean.x * 1.4 + sin(vOcean.y * 0.6 + surfaceTime * 0.7));
          float b = sin(vOcean.y * 1.6 + cos(vOcean.x * 0.7 - surfaceTime * 0.6));
          float net = 1.0 - smoothstep(0.03, 0.16, abs(a + b));
          gl_FragColor = vec4(0.67, 0.94, 0.81, net * 0.2);
        }`,
    }, {attributes: ["position"], uniforms: ["world", "viewProjection", "scroll", "surfaceTime"], needAlphaBlending: true});
  }

  caustics(parent: TransformNode, seabed: Mesh) {
    const mesh = seabed.clone("moving-seabed-caustics", parent)!;
    mesh.position.y += 0.025; mesh.material = this.causticMaterial; mesh.isPickable = false;
  }

  cell(parent: TransformNode, world: number, floor: (x: number, d: number) => number) {
    const mesh = CreateGround("continuous-moving-water", {width: 180, height: 10, subdivisionsX: 72, subdivisionsY: 5}, this.scene);
    mesh.parent = parent; mesh.position.set(0, -0.15, 5);
    const vertices = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const depths: number[] = [];
    for (let i = 0; i < vertices.length; i += 3)
      depths.push(-0.15 - floor(vertices[i], world + 5 + vertices[i + 2]));
    mesh.setVerticesData("waterDepth", depths, false, 1);
    mesh.material = this.material;
    mesh.isPickable = false;
    return mesh;
  }

  update(distance: number, time: number) {
    this.material.setFloat("scroll", distance).setFloat("surfaceTime", time);
    this.causticMaterial.setFloat("scroll", distance).setFloat("surfaceTime", time);
  }
}
