import { reefRockGeometry } from "./ocean-geometry.ts";
import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder.js";
import { CreateLathe } from "@babylonjs/core/Meshes/Builders/latheBuilder.js";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { CONFIG } from "./config.ts";
import { makeCoral, coralPath } from "./coral.ts";
import type { CoralPlan } from "./coral.ts";
import { mergeSceneryMeshes } from "./scenery-mesh.ts";

// Shared materials keep reef detail inexpensive when terrain cells are batched.
export class OceanProps {
  private materials = new Map<string, StandardMaterial>();
  private fishTemplates = new Map<string, {body: Mesh; tail: Mesh}>();
  private scene: Scene;
  constructor(scene: Scene) { this.scene = scene; }

  material(kind: string, color: string) {
    const key = kind + color;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const mat = new StandardMaterial(`ocean-${key}`, this.scene);
    mat.diffuseColor = Color3.FromHexString(color).toLinearSpace();
    mat.specularColor.setAll(kind === "shell" ? 0.22 : 0.06);
    const texture = new DynamicTexture(`ocean-grain-${key}`, 256, this.scene, true);
    const ctx = texture.getContext();
    let seed = 43931;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    ctx.fillStyle = "#d9d5ca"; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) {
      const x = random() * 256, y = random() * 256;
      const shade = 85 + Math.floor(random() * 160);
      ctx.fillStyle = `rgba(${shade},${shade},${shade},0.4)`;
      ctx.fillRect(x, y, kind === "sand" ? 1 : 2, 1 + random());
    }
    if (kind === "coral") {
      for (let i = 0; i < 470; i++) {
        const x = random() * 256, y = random() * 256, r = 1 + random() * 2;
        ctx.fillStyle = "#f6e5d5";
        ctx.beginPath(); ctx.arc(x, y, r + 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#786159";
        ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (kind === "basalt") {
      for (let i = 0; i < 22; i++) {
        let x = random() * 256, y = random() * 256;
        ctx.strokeStyle = "rgba(50,63,67,0.6)"; ctx.lineWidth = 0.8 + random();
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let j = 0; j < 7; j++) { x += random() * 16 - 8; y += 5 + random() * 8; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    if (kind === "sand") {
      ctx.strokeStyle = "rgba(130,115,90,0.12)";
      for (let row = -1; row < 22; row++) {
        ctx.beginPath();
        for (let x = 0; x <= 256; x += 4) {
          const y = row * 13 + Math.sin(x * Math.PI / 64) * 3;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    texture.update(); mat.diffuseTexture = texture;
    if (kind === "coral" || kind === "basalt") {
      const height = ctx.getImageData(0, 0, 256, 256).data;
      const normal = new DynamicTexture(`ocean-normal-${key}`, 256, this.scene, true);
      const normalCtx = normal.getContext();
      const pixels = normalCtx.getImageData(0, 0, 256, 256);
      const sample = (x: number, y: number) => height[(((y + 256) % 256) * 256 + (x + 256) % 256) * 4] / 255;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const nx = (sample(x - 1, y) - sample(x + 1, y)) * 1.4;
        const ny = (sample(x, y - 1) - sample(x, y + 1)) * 1.4;
        const length = Math.hypot(nx, ny, 1), i = (y * 256 + x) * 4;
        pixels.data[i] = (nx / length * 0.5 + 0.5) * 255;
        pixels.data[i + 1] = (ny / length * 0.5 + 0.5) * 255;
        pixels.data[i + 2] = (1 / length * 0.5 + 0.5) * 255;
        pixels.data[i + 3] = 255;
      }
      normalCtx.putImageData(pixels, 0, 0); normal.update();
      mat.bumpTexture = normal; mat.bumpTexture.level = kind === "coral" ? 0.24 : 0.32;
    }
    mat.emissiveColor.setAll(0.025);
    this.materials.set(key, mat);
    return mat;
  }

  private tube(name: string, path: Vector3[], radius: number, mat: StandardMaterial, parent: TransformNode) {
    const mesh = CreateTube(name, {path, radius, tessellation: 7, cap: 3}, this.scene);
    mesh.material = mat; mesh.parent = parent;
    return mesh;
  }

  grownCoral(parent: TransformNode, plan: CoralPlan, color = "#da8b9f") {
    const root = new TransformNode("rooted-branching-reef", this.scene); root.parent = parent;
    const mat = this.material("coral", color);
    for (const b of plan.branches) {
      const path = coralPath(b).map(p => new Vector3(p.x, p.y, p.z));
      const mesh = CreateTube("tapered-porous-coral-branch", {path, tessellation: 20, cap: 3,
        radiusFunction: i => b.radius + (b.tipRadius - b.radius) * i / (path.length - 1)}, this.scene);
      mesh.parent = root; mesh.material = mat;
      this.naturalUV(mesh, 0.45);
      if (b.tipRadius < 0.08) {
        const crown = CreateSphere("rounded-coral-tip", {diameter: b.tipRadius * 2, segments: 10}, this.scene);
        crown.parent = root; crown.position.copyFrom(path[path.length - 1]); crown.material = mat;
        this.naturalUV(crown, 0.45);
      }
    }
    const batch = mergeSceneryMeshes(root.getChildMeshes() as Mesh[]);
    batch.parent = root; batch.name = "textured-coral-branches";
    return root;
  }

  coral(parent: TransformNode, shape: number, height = 1.3, color = "#da8b9f") {
    const root = this.grownCoral(parent, makeCoral(0, 3), color);
    root.scaling.set(shape % 3 === 2 ? 1.6 : 1, height / (CONFIG.waterHeights[2] + 0.65 - CONFIG.seabedHeight + 0.06), shape % 3 === 2 ? 0.55 : 1);
    root.rotation.y = shape * 0.7;
    return root;
  }

  private naturalUV(mesh: Mesh, scale: number) {
    const p = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
    const uv: number[] = [];
    for (let i = 0; i < p.length; i += 3)
      uv.push((Math.abs(n[i]) > Math.abs(n[i + 2]) ? p[i + 2] : p[i]) / scale,
        (Math.abs(n[i + 1]) > 0.75 ? p[i + 2] : p[i + 1]) / scale);
    mesh.setVerticesData(VertexBuffer.UVKind, uv);
  }

  rock(parent: TransformNode, size: [number, number, number], seed: number, color = "#6b8990") {
    const mesh = new Mesh("fractured-reef-rock", this.scene);
    const {positions, indices, colors} = reefRockGeometry(size, seed);
    const normals: number[] = []; VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals; data.colors = colors;
    data.applyToMesh(mesh); this.naturalUV(mesh, 1.3);
    mesh.parent = parent; mesh.material = this.material("basalt", color); mesh.receiveShadows = true;
    return mesh;
  }

  kelp(parent: TransformNode, height: number, phase: number) {
    const root = new TransformNode("ribbon-kelp", this.scene); root.parent = parent;
    const mat = this.material("kelp", phase % 2 ? "#498568" : "#6e9b69");
    for (let strand = 0; strand < 3; strand++) {
      const path = Array.from({length: 7}, (_, i) => new Vector3(
        Math.sin(i * 0.8 + phase + strand) * i * 0.055 + strand * 0.17,
        height * i / 6, Math.cos(i * 0.6 + phase) * i * 0.04));
      const blade = this.tube("kelp-frond", path, 0.09, mat, root);
      blade.scaling.z = 0.24;
    }
    return root;
  }

  fish(parent: TransformNode, color = "#efb762") {
    let template = this.fishTemplates.get(color);
    if (!template) {
      template = this.createFishTemplate(color);
      this.fishTemplates.set(color, template);
    }
    const root = new TransformNode("reef-fish", this.scene); root.parent = parent;
    const body = template.body.createInstance("reef-fish-body");
    body.parent = root;
    const tail = template.tail.createInstance("fish-fan-tail");
    tail.parent = root;
    return root;
  }

  private createFishTemplate(color: string) {
    const root = new TransformNode("reef-fish-template", this.scene);
    const mat = this.material("shell", color);
    const body = CreateSphere("fish-streamlined-body", {diameter: 1, segments: 12}, this.scene);
    body.parent = root; body.material = mat; body.scaling.set(0.28, 0.36, 0.74);
    const tail = CreateSphere("fish-fan-tail", {diameter: 1, segments: 8}, this.scene);
    tail.parent = root; tail.material = mat; tail.position.z = -0.43; tail.scaling.set(0.045, 0.38, 0.28);
    for (const side of [-1, 1]) {
      const fin = CreateSphere("fish-pectoral-fin", {diameter: 1, segments: 8}, this.scene);
      fin.parent = root; fin.material = mat; fin.position.set(side * 0.15, -0.04, -0.05);
      fin.scaling.set(0.28, 0.045, 0.19); fin.rotation.z = side * 0.3;
      const eye = CreateSphere("fish-eye", {diameter: 0.09, segments: 8}, this.scene);
      eye.parent = root; eye.position.set(side * 0.115, 0.07, 0.23);
      eye.material = this.material("eye", "#233c4a");
    }
    const dorsal = CreateSphere("fish-dorsal-fin", {diameter: 1, segments: 8}, this.scene);
    dorsal.parent = root; dorsal.material = mat; dorsal.position.set(0, 0.2, -0.06);
    dorsal.scaling.set(0.04, 0.2, 0.36);
    const merged = mergeSceneryMeshes(root.getChildMeshes(false, mesh => mesh !== tail) as Mesh[]);
    merged.parent = tail.parent = null;
    merged.setEnabled(false);
    tail.setEnabled(false);
    root.dispose();
    return {body: merged, tail};
  }

  vent(parent: TransformNode) {
    const root = new TransformNode("eroded-vent", this.scene); root.parent = parent;
    const mat = this.material("basalt", "#6e6878");
    const profile = [new Vector3(0.65, -0.65, 0), new Vector3(0.6, -0.4, 0),
      new Vector3(0.44, -0.1, 0), new Vector3(0.36, 0.35, 0),
      new Vector3(0.31, 0.61, 0), new Vector3(0.2, 0.59, 0), new Vector3(0.15, 0.3, 0)];
    const body = CreateLathe("hollow-volcanic-chimney", {shape: profile, tessellation: 18, sideOrientation: 2}, this.scene);
    body.parent = root; body.material = mat;
    for (let i = 0; i < 7; i++) {
      const rock = this.rock(root, [0.38, 0.7, 0.35], i + 8, "#6e6878");
      const a = i * Math.PI * 2 / 7;
      rock.position.set(Math.cos(a) * 0.32, -0.25, Math.sin(a) * 0.32);
    }
    const lip = CreateTorus("vent-glowing-minerals", {diameter: 0.5, thickness: 0.065, tessellation: 20}, this.scene);
    lip.parent = root; lip.position.y = 0.59;
    lip.material = this.material("mineral", "#dd9d68");
    const batch = mergeSceneryMeshes(root.getChildMeshes() as Mesh[]);
    batch.parent = root;
    const material = batch.material;
    if (material instanceof MultiMaterial)
      batch.onDisposeObservable.addOnce(() => material.dispose(false, false, false));
    return root;
  }
}
