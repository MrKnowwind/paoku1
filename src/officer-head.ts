import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";

type Point = [number, number, number];

// One face texture and two rigid meshes per scene, reused across character switches.
const headTemplates = new WeakMap<Scene, Mesh[]>();
const FACE_WIDTH = 0.8;
const FACE_HEIGHT = 0.74;
const FACE_TOP = 0.685;

function faceTexture(scene: Scene) {
  const size = 512;
  const texture = new DynamicTexture("officer-face-paint", size, scene, true);
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const skin = ctx.createLinearGradient(0, 0, 0, size);
  skin.addColorStop(0, "#ffe8d9");
  skin.addColorStop(0.65, "#ffdfcc");
  skin.addColorStop(1, "#f5c9b5");
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, size, size);
  ctx.setTransform(size / FACE_WIDTH, 0, 0, -size / FACE_HEIGHT, size / 2, FACE_TOP * size / FACE_HEIGHT);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const ellipse = (x: number, y: number, rx: number, ry: number, color: string | CanvasGradient) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
  };
  for (const side of [-1, 1]) {
    const x = side * 0.15, y = 0.292;
    const blush = ctx.createRadialGradient(side * 0.217, 0.18, 0.005, side * 0.217, 0.18, 0.078);
    blush.addColorStop(0, "#f79d9b9c"); blush.addColorStop(1, "#f79d9b00");
    ellipse(side * 0.217, 0.18, 0.078, 0.053, blush);
    for (let i = 0; i < 3; i++) {
      const at = side * 0.217 + (i - 1) * 0.017;
      ctx.beginPath(); ctx.moveTo(at - 0.004, 0.171); ctx.lineTo(at + 0.002, 0.187);
      ctx.strokeStyle = "#ed7779b3"; ctx.lineWidth = 0.006; ctx.stroke();
    }
    ellipse(x, y, 0.077, 0.096, "#fff9f4");
    const iris = ctx.createLinearGradient(0, y + 0.09, 0, y - 0.09);
    iris.addColorStop(0, "#21141c"); iris.addColorStop(0.55, "#39232c"); iris.addColorStop(1, "#79535b");
    ellipse(x, y, 0.064, 0.091, iris);
    ellipse(x, y + 0.012, 0.039, 0.058, "#24151e");
    ellipse(x - 0.018, y + 0.044, 0.021, 0.023, "#ffffff");
    ellipse(x + 0.028, y + 0.012, 0.0075, 0.0085, "#fff9ff");
    ellipse(x - 0.029, y - 0.045, 0.009, 0.01, "#d6abb9a6");
    ctx.beginPath();
    ctx.moveTo(x - side * 0.066, y + 0.046);
    ctx.bezierCurveTo(x - side * 0.044, y + 0.111, x + side * 0.042, y + 0.113, x + side * 0.072, y + 0.034);
    ctx.strokeStyle = "#2d1b25"; ctx.lineWidth = 0.012; ctx.stroke();
    for (let i = 0; i < 2; i++) {
      ctx.beginPath(); ctx.moveTo(x + side * 0.068, y + 0.043 + i * 0.017);
      ctx.quadraticCurveTo(x + side * 0.086, y + 0.041 + i * 0.02, x + side * (0.096 - i * 0.005), y + 0.055 + i * 0.021);
      ctx.lineWidth = 0.01 - i * 0.002; ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(x - 0.041, 0.414);
    ctx.quadraticCurveTo(x, 0.438, x + 0.04, 0.416);
    ctx.strokeStyle = "#44303a"; ctx.lineWidth = 0.009; ctx.stroke();
  }
  // The mouth stays at the existing drink animation's head-local contact point.
  const mouthShape = new Path2D(); mouthShape.moveTo(-0.052, 0.157);
  mouthShape.bezierCurveTo(-0.065, 0.158, -0.049, 0.066, 0, 0.064);
  mouthShape.bezierCurveTo(0.049, 0.066, 0.065, 0.158, 0.052, 0.157);
  mouthShape.quadraticCurveTo(0, 0.163, -0.052, 0.157); mouthShape.closePath();
  const mouth = ctx.createLinearGradient(0, 0.16, 0, 0.06);
  mouth.addColorStop(0, "#a33340"); mouth.addColorStop(1, "#e36573");
  ctx.fillStyle = mouth; ctx.fill(mouthShape);
  ctx.save(); ctx.clip(mouthShape);
  ellipse(0.006, 0.075, 0.047, 0.048, "#ff929d");
  ellipse(0.007, 0.065, 0.042, 0.034, "#ffa5ad");
  ctx.restore(); ctx.strokeStyle = "#b9454b"; ctx.lineWidth = 0.005; ctx.stroke(mouthShape);
  ellipse(-0.006, 0.217, 0.009, 0.005, "#fff0dfb3");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Reserved opaque color swatches for the ears, outside the face UV footprint.
  ctx.fillStyle = "#ffddc9"; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = "#ef9f99"; ctx.fillRect(size - 16, 0, 16, 16);
  texture.anisotropicFilteringLevel = 4;
  texture.update();
  return texture;
}

function skinMesh(scene: Scene) {
  const material = new StandardMaterial("officer-skin", scene);
  material.diffuseTexture = faceTexture(scene);
  material.specularColor.setAll(0.015);
  const face = CreateSphere("officer-rounded-face", {diameter: 1, segments: 24, updatable: true}, scene);
  const positions = face.getVerticesData(VertexBuffer.PositionKind)!;
  const uvs = face.getVerticesData(VertexBuffer.UVKind)!;
  for (let i = 0; i < positions.length; i += 3) {
    const sx = positions[i] * 2, sy = positions[i + 1] * 2, sz = positions[i + 2] * 2;
    const x = sx * 0.365 * (1 + 0.06 * (1 - sy * sy) - 0.08 * Math.max(0, -sy));
    const y = 0.295 + sy * 0.33;
    const nose = sz > 0 ? 0.009 * Math.exp(-((x / 0.033) ** 2 + ((y - 0.205) / 0.045) ** 2)) : 0;
    positions[i] = x; positions[i + 1] = y;
    positions[i + 2] = 0.02 + Math.sign(sz) * Math.abs(sz) ** 0.65 * 0.298 + nose;
    // Planar painting follows the curved front; the back samples unpainted skin.
    uvs[i / 3 * 2] = sz >= 0 ? 0.5 + x / FACE_WIDTH : 0.03;
    uvs[i / 3 * 2 + 1] = sz >= 0 ? (y + FACE_HEIGHT - FACE_TOP) / FACE_HEIGHT : 0.5;
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, face.getIndices()!, normals);
  face.updateVerticesData(VertexBuffer.PositionKind, positions);
  face.updateVerticesData(VertexBuffer.NormalKind, normals);
  face.updateVerticesData(VertexBuffer.UVKind, uvs);
  face.material = material;
  const pieces = [face];
  for (const side of [-1, 1]) for (const inner of [false, true]) {
    const ear = CreateSphere("officer-ear", {diameter: 1, segments: 12, updatable: true}, scene);
    ear.scaling.set(inner ? 0.065 : 0.12, inner ? 0.106 : 0.16, inner ? 0.022 : 0.1);
    ear.position.set(side * 0.356, 0.225, inner ? 0.199 : 0.15);
    const earUvs = ear.getVerticesData(VertexBuffer.UVKind)!;
    for (let i = 0; i < earUvs.length; i += 2) {
      earUvs[i] = inner ? 0.985 : 0.015; earUvs[i + 1] = 0.985;
    }
    ear.updateVerticesData(VertexBuffer.UVKind, earUvs);
    ear.material = material; ear.bakeCurrentTransformIntoVertices(); pieces.push(ear);
  }
  const merged = Mesh.MergeMeshes(pieces, true, false)!;
  merged.name = "officer-skin-template";
  return merged;
}

function hairMesh(scene: Scene) {
  const material = new StandardMaterial("officer-hair", scene);
  material.specularColor.set(0.065, 0.05, 0.065);
  material.specularPower = 64;
  const dark = Color3.FromHexString("#211b24").toLinearSpace();
  const shine = Color3.FromHexString("#66505d").toLinearSpace();
  const pieces: Mesh[] = [];
  // Closed curved sheets give the bob and fringe thickness without capsule seams.
  const sheet = (name: string, rows: number, columns: number, point: (u: number, v: number, inner: boolean) => Point) => {
    const positions: number[] = [], indices: number[] = [], colors: number[] = [], uvs: number[] = [];
    const stride = columns + 1, count = (rows + 1) * stride;
    for (const inner of [false, true]) for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
      const u = col / columns, v = row / rows;
      positions.push(...point(u, v, inner)); uvs.push(u, v);
      const highlight = inner ? 0 : Math.sin(v * Math.PI) ** 4 * (0.12 + 0.32 * Math.sin(u * Math.PI) ** 8);
      const color = Color3.Lerp(dark, shine, highlight);
      colors.push(color.r, color.g, color.b, 1);
    }
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const a = row * stride + col, b = a + 1, c = a + stride, d = c + 1;
      indices.push(a, b, c, b, d, c, a + count, c + count, b + count, b + count, c + count, d + count);
    }
    const edge: number[] = [];
    for (let col = 0; col <= columns; col++) edge.push(col);
    for (let row = 1; row <= rows; row++) edge.push(row * stride + columns);
    for (let col = columns - 1; col >= 0; col--) edge.push(rows * stride + col);
    for (let row = rows - 1; row > 0; row--) edge.push(row * stride);
    for (let i = 0; i < edge.length; i++) {
      const a = edge[i], b = edge[(i + 1) % edge.length];
      indices.push(a, a + count, b, b, a + count, b + count);
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions; data.indices = indices; data.normals = normals; data.colors = colors; data.uvs = uvs;
    const mesh = new Mesh(name, scene); data.applyToMesh(mesh);
    mesh.material = material; mesh.useVertexColors = true; pieces.push(mesh);
  };
  // y, half-width, depth, and opening angle: the front stays open around the face.
  const profile = [[0.625, 0.18, 0.17, 0.15], [0.57, 0.33, 0.28, 0.4], [0.47, 0.395, 0.34, 0.65],
    [0.31, 0.423, 0.36, 0.72], [0.13, 0.428, 0.35, 0.78], [0.015, 0.405, 0.33, 0.82], [-0.035, 0.355, 0.28, 0.89]];
  sheet("officer-bob-shell", 18, 40, (u, v, inner) => {
    const at = v * (profile.length - 1), row = Math.min(profile.length - 2, Math.floor(at)), t = at - row;
    const sample = (axis: number) => profile[row][axis] * (1 - t) + profile[row + 1][axis] * t;
    const y = sample(0), inset = inner ? 0.028 : 0, angle = sample(3) + u * (Math.PI * 2 - sample(3) * 2);
    const scallop = Math.sin(u * Math.PI * 10) ** 2 * Math.max(0, (v - 0.78) / 0.22) * 0.016;
    return [Math.sin(angle) * (sample(1) - inset), y + scallop,
      Math.cos(angle) * (sample(2) - inset) - 0.005];
  });
  for (let lock = 0; lock < 5; lock++) {
    const center = (lock - 2) * 0.123, width = lock === 2 ? 0.13 : 0.126;
    const tip = [0.437, 0.426, 0.421, 0.428, 0.439][lock];
    sheet("officer-shaped-fringe", 8, 8, (u, v, inner) => {
      const across = u * 2 - 1, rounding = Math.max(0, (v - 0.7) / 0.3);
      const x = center + across * width / 2 * (1 - 0.08 * rounding) + Math.sin(v * Math.PI) * (lock - 2) * 0.003;
      const y = 0.605 * (1 - v) + tip * v + Math.abs(across) ** 6 * 0.014 * rounding;
      const z = 0.319 - x * x * 0.34 + Math.sin(v * Math.PI) * 0.017 + (1 - across * across) * 0.005;
      return [x, y, z - (inner ? 0.027 : 0)];
    });
  }
  const merged = Mesh.MergeMeshes(pieces, true, false)!;
  merged.name = "officer-hair-template";
  merged.useVertexColors = true; merged.hasVertexAlpha = false;
  return merged;
}

export function createOfficerHead(scene: Scene, parent: TransformNode) {
  let sources = headTemplates.get(scene);
  if (!sources) {
    sources = [skinMesh(scene), hairMesh(scene)];
    for (const source of sources) {
      source.isPickable = false; source.receiveShadows = true; source.setEnabled(false);
    }
    headTemplates.set(scene, sources);
  }
  for (const source of sources) {
    const mesh = source.createInstance(source.name.replace("-template", ""));
    mesh.parent = parent; mesh.isPickable = false; mesh.receiveShadows = true;
  }
}
