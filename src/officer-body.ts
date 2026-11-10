import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { officerMaterial } from "./officer-materials.ts";

type Ring = [y: number, width: number, depth: number, z?: number];
const templates = new WeakMap<Scene, Map<string, Mesh>>();
const blue = Color3.FromHexString("#4b6395").toLinearSpace();
const yoke = Color3.FromHexString("#8a9fc5").toLinearSpace();
const piping = Color3.FromHexString("#afbdd4").toLinearSpace();
const sidePanel = Color3.FromHexString("#3b507b").toLinearSpace();
const pants = Color3.FromHexString("#61749c").toLinearSpace();
const boot = Color3.FromHexString("#394354").toLinearSpace();
const sole = Color3.FromHexString("#252d3d").toLinearSpace();
const skin = Color3.FromHexString("#ffddc7").toLinearSpace();
const crease = Color3.FromHexString("#e4b59f").toLinearSpace();

function attach(scene: Scene, name: string, parent: TransformNode, build: () => Mesh) {
  let cache = templates.get(scene);
  if (!cache) { cache = new Map(); templates.set(scene, cache); }
  let source = cache.get(name);
  if (!source) {
    source = build(); source.name = `${name}-template`;
    source.isPickable = false; source.receiveShadows = true; source.setEnabled(false);
    cache.set(name, source);
  }
  const mesh = source.createInstance(name);
  mesh.parent = parent; mesh.isPickable = false; mesh.receiveShadows = true;
}

// Closed, smooth profiles replace the stacked capsules and shoe blocks.
function loft(scene: Scene, name: string, profile: Ring[], material: StandardMaterial,
  paint: (y: number, angle: number) => Color3) {
  const columns = 32, positions: number[] = [], indices: number[] = [], colors: number[] = [], uvs: number[] = [];
  for (let row = 0; row < profile.length; row++) {
    const [y, width, depth, z = 0] = profile[row];
    for (let col = 0; col < columns; col++) {
      const angle = col / columns * Math.PI * 2;
      positions.push(Math.sin(angle) * width / 2, y, z + Math.cos(angle) * depth / 2);
      const color = paint(y, angle); colors.push(color.r, color.g, color.b, 1);
      uvs.push(col / columns, row / (profile.length - 1));
      if (row < profile.length - 1) {
        const a = row * columns + col, b = row * columns + (col + 1) % columns, c = a + columns, d = b + columns;
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  // Profiles run from top to bottom; close both ends of every rigid piece.
  for (const row of [0, profile.length - 1]) {
    const [y, , , z = 0] = profile[row], center = positions.length / 3;
    positions.push(0, y, z); uvs.push(0.5, 0.5);
    const color = paint(y, 0); colors.push(color.r, color.g, color.b, 1);
    for (let col = 0; col < columns; col++) {
      const a = row * columns + col, b = row * columns + (col + 1) % columns;
      if (row === 0) indices.push(center, b, a); else indices.push(center, a, b);
    }
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions; data.indices = indices; data.normals = normals; data.colors = colors; data.uvs = uvs;
  const mesh = new Mesh(name, scene); data.applyToMesh(mesh);
  mesh.material = material; mesh.useVertexColors = true; mesh.hasVertexAlpha = false;
  return mesh;
}

export function createOfficerTorso(scene: Scene, hips: TransformNode, torso: TransformNode) {
  attach(scene, "officer-tailored-jacket", torso, () => loft(scene, "jacket", [
    [0.775, 0.23, 0.23], [0.735, 0.43, 0.32], [0.67, 0.61, 0.405], [0.59, 0.66, 0.44],
    [0.53, 0.65, 0.435], [0.505, 0.64, 0.425], [0.48, 0.62, 0.415], [0.37, 0.565, 0.385],
    [0.25, 0.53, 0.365], [0.15, 0.56, 0.385], [0.055, 0.61, 0.43], [-0.028, 0.6, 0.43],
  ], officerMaterial(scene, "cloth"), (y, angle) => {
    const back = Math.cos(angle) < -0.2;
    if (back && y >= 0.53) return yoke;
    if (back && y >= 0.505) return piping;
    if (back && Math.abs(Math.sin(angle)) < 0.025) return sidePanel;
    return Math.abs(Math.sin(angle)) > 0.8 ? sidePanel : blue;
  }));
  attach(scene, "officer-tailored-hips", hips, () => loft(scene, "hips", [
    [0.055, 0.48, 0.36], [0.015, 0.57, 0.405], [-0.065, 0.585, 0.41], [-0.13, 0.52, 0.36], [-0.16, 0.38, 0.26],
  ], officerMaterial(scene, "trousers"), () => pants));
}

export function createOfficerLeg(scene: Scene, upper: TransformNode, lower: TransformNode, foot: TransformNode) {
  attach(scene, "officer-fitted-thigh", upper, () => loft(scene, "thigh", [
    [0.055, 0.17, 0.21], [0.015, 0.225, 0.265], [-0.1, 0.23, 0.265], [-0.25, 0.205, 0.24],
    [-0.37, 0.18, 0.215], [-0.435, 0.135, 0.16],
  ], officerMaterial(scene, "trousers"), () => pants));
  attach(scene, "officer-fitted-shin", lower, () => loft(scene, "shin", [
    [0.055, 0.13, 0.16], [0.025, 0.185, 0.215], [-0.035, 0.19, 0.22], [-0.14, 0.18, 0.205],
    [-0.25, 0.158, 0.18], [-0.32, 0.145, 0.16],
  ], officerMaterial(scene, "trousers"), () => pants));
  attach(scene, "officer-rounded-boot", foot, () => loft(scene, "boot", [
    [0.205, 0.168, 0.19, -0.005], [0.18, 0.184, 0.205, -0.005], [0.12, 0.195, 0.225, 0.005],
    [0.075, 0.212, 0.28, 0.045], [0.025, 0.238, 0.365, 0.09], [-0.025, 0.253, 0.415, 0.1],
    [-0.062, 0.26, 0.44, 0.1], [-0.079, 0.262, 0.442, 0.1], [-0.105, 0.25, 0.43, 0.095],
    [-0.1175, 0.222, 0.385, 0.095],
  ], officerMaterial(scene, "leather"), (y, angle) => {
    if (y <= -0.079) return sole;
    if (y >= 0.18) return sidePanel;
    return Math.cos(angle) < -0.6 ? sidePanel : boot;
  }));
}

function handMesh(scene: Scene, side: number) {
  const mesh = CreateSphere("officer-soft-hand", {diameter: 1, segments: 20, updatable: true}, scene);
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!, colors: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const sx = positions[i] * 2, sy = positions[i + 1] * 2, sz = positions[i + 2] * 2;
    const thumb = Math.exp(-(((sx + side * 0.68) / 0.32) ** 2 + ((sy - 0.18) / 0.5) ** 2 + ((sz - 0.5) / 0.55) ** 2));
    const x = sx * 0.084 - side * thumb * 0.026, y = -0.345 + sy * 0.108 + thumb * 0.008;
    const fold = Math.max(0, 1 - Math.abs((y + 0.385) / 0.045)) * Math.max(0, sz);
    const grooves = Math.exp(-(((x - 0.028) / 0.007) ** 2)) + Math.exp(-(((x + 0.028) / 0.007) ** 2));
    positions[i] = x; positions[i + 1] = y;
    positions[i + 2] = 0.025 + sz * 0.083 * (1 + 0.12 * Math.max(0, -sy)) + thumb * 0.012 - grooves * fold * 0.002;
    const tint = Color3.Lerp(skin, crease, Math.min(0.45, grooves * fold * 0.45));
    colors.push(tint.r, tint.g, tint.b, 1);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, mesh.getIndices()!, normals);
  mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
  mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  mesh.material = officerMaterial(scene, "skin"); mesh.useVertexColors = true; mesh.hasVertexAlpha = false;
  return mesh;
}

export function createOfficerArm(scene: Scene, upper: TransformNode, lower: TransformNode, side: number) {
  attach(scene, "officer-fitted-sleeve", upper, () => loft(scene, "sleeve", [
    [0.085, 0.065, 0.08], [0.06, 0.16, 0.19], [0.015, 0.205, 0.225], [-0.12, 0.195, 0.21],
    [-0.245, 0.17, 0.19], [-0.325, 0.13, 0.155],
  ], officerMaterial(scene, "cloth"), (y, angle) => y > -0.035 && Math.cos(angle) < 0 ? yoke : blue));
  attach(scene, "officer-fitted-forearm", lower, () => loft(scene, "forearm", [
    [0.055, 0.12, 0.14], [0.02, 0.174, 0.195], [-0.055, 0.175, 0.195], [-0.17, 0.151, 0.17],
    [-0.235, 0.148, 0.16], [-0.255, 0.156, 0.17], [-0.277, 0.145, 0.155],
  ], officerMaterial(scene, "cloth"), y => y < -0.235 ? yoke : blue));
  attach(scene, `officer-rounded-hand-${side}`, lower, () => handMesh(scene, side));
}
