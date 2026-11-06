import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { WINTER_VERTEX, withSnowLayer } from "./snow-layer.ts";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { CreateLathe } from "@babylonjs/core/Meshes/Builders/latheBuilder";
import { snowMaterial } from "./snow-materials.ts";
import type { ForestProps } from "./props.ts";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CONFIG } from "./config.ts";
import { POOL_WATER_Y, WINTER_HAZARD_HALF_WIDTH, WINTER_ROAD_Y } from "./snow-layout.ts";
import type { ItemType } from "./game.ts";

// Shared meshes/materials for both the live course and its real 3D lesson.
// Created on demand; no image requests or startup asset dependency.
export class SnowProps {
  private materials = new Map<string, StandardMaterial>();
  private hearthGlow?: StandardMaterial;
  private fires = new WeakMap<TransformNode, {glow: Mesh; flames: Mesh[]}>();
  private poolTexture?: DynamicTexture;
  constructor(private scene: Scene, private forest: ForestProps) {}
  private mat(color: string, glow = false) {
    const key = color + glow;
    if (!this.materials.has(key)) {
      const m = new StandardMaterial("snow-" + key, this.scene);
      m.diffuseColor = Color3.FromHexString(color);
      m.specularColor.setAll(color === "#89c9e5" ? 0.8 : 0.08);
      m.specularPower = 96;
      if (glow) m.emissiveColor = m.diffuseColor.scale(0.85);
      this.materials.set(key, m);
    }
    return this.materials.get(key)!;
  }
  private surface(name: string, color: string) {
    if (/scarf|knitted/.test(name)) return snowMaterial(this.scene, "cloth", this.forest);
    if (/bark|trunk|twig|firewood|stump-root/.test(name)) return this.forest.surfaceMaterial("bark");
    if (name === "cut-wood") return this.forest.surfaceMaterial("cut");
    if (name === "hearth-stone") return this.forest.surfaceMaterial("stone");
    if (name === "pine-boughs") return snowMaterial(this.scene, "needles", this.forest);
    if (/snow|frozen-bank|frozen-end/.test(name)) return snowMaterial(this.scene, "snow", this.forest);
    return this.mat(color);
  }
  private ball(name: string, parent: TransformNode, size: number[], at: number[], color = "#eef7ff") {
    const m = CreateSphere(name, {diameter: 1, segments: /snow|frozen/.test(name) ? 32 : 24}, this.scene);
    m.parent = parent; m.scaling.set(size[0], size[1], size[2]); m.position.set(at[0], at[1], at[2]);
    m.material = this.surface(name, color); m.receiveShadows = true;
    if (/snowman|hearth-stone|settled-snow/.test(name)) {
      const points = m.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < points.length; i += 3) {
        const x = points[i], y = points[i + 1], z = points[i + 2];
        const grain = 1 + Math.sin(x * 19 + z * 13) * Math.cos(y * 17 + z * 7) * 0.035 + Math.sin(x * 7 - y * 8) * 0.02;
        points[i] *= grain; points[i + 1] *= grain; points[i + 2] *= grain;
      }
      const normals: number[] = []; VertexData.ComputeNormals(points, m.getIndices()!, normals);
      m.setVerticesData(VertexBuffer.PositionKind, points); m.setVerticesData(VertexBuffer.NormalKind, normals);
    }
    return m;
  }
  private cylinder(name: string, parent: TransformNode, height: number, bottom: number, top: number, at: number[], color: string) {
    const m = CreateCylinder(name, {height, diameterBottom: bottom, diameterTop: top, tessellation: 32}, this.scene);
    m.parent = parent; m.position.set(at[0], at[1], at[2]); m.material = this.surface(name, color); m.receiveShadows = true;
    return m;
  }
  private snowCoat(mesh: Mesh, coverage: (x: number, y: number, z: number) => number) {
    const points = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const weights: number[] = [];
    for (let i = 0; i < points.length; i += 3) {
      const [x, y, z] = [points[i], points[i + 1], points[i + 2]];
      weights.push((x + y * 0.24) * 1.7, (z + y * 0.32) * 1.7, coverage(x, y, z));
    }
    mesh.setVerticesData(WINTER_VERTEX, weights, false, 3);
    mesh.material = withSnowLayer(mesh.material as StandardMaterial, snowMaterial(this.scene, "snow", this.forest).diffuseTexture!);
  }

  drift(parent: TransformNode) {
    const root = new TransformNode("wind-sculpted-snowdrift", this.scene);
    root.parent = parent;
    const drift = CreateGround("snowdrift-crust", {width: 2.18, height: 2.1, subdivisions: 18}, this.scene);
    const positions = drift.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], z = positions[i + 2];
      const radius = Math.hypot(x + z * 0.19, z * 0.99);
      const edge = 0.94 + Math.sin(z * 7.7 + x * 3.4) * 0.09;
      const falloff = Math.max(0, 1 - radius / edge);
      const lee = Math.max(0, 1 - Math.hypot((x - 0.34) * 1.4, (z - 0.27) * 1.65));
      positions[i + 1] = -0.018 + falloff ** 1.4 * (0.64 + 0.11 * Math.sin(x * 6 - z * 2.7)) + lee ** 2 * 0.18;
    }
    this.shape(drift, positions);
    drift.material = snowMaterial(this.scene, "snow", this.forest);
    drift.parent = root; drift.receiveShadows = true;
    return root;
  }

  private shape(mesh: Mesh, positions: number[] | Float32Array) {
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, mesh.getIndices()!, normals);
    mesh.setVerticesData(VertexBuffer.PositionKind, positions);
    mesh.setVerticesData(VertexBuffer.NormalKind, normals);
  }

  private firelight() {
    if (this.hearthGlow) return this.hearthGlow;
    const texture = new DynamicTexture("hearth-falloff", 64, this.scene, true);
    const ctx = texture.getContext();
    const fade = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
    fade.addColorStop(0, "#ed9c57ad");
    fade.addColorStop(0.55, "#df976267");
    fade.addColorStop(1, "#ed9c5700");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 64, 64);
    texture.hasAlpha = true;
    texture.update();
    const mat = this.hearthGlow = new StandardMaterial("hearth-reflected-light", this.scene);
    mat.diffuseTexture = texture;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.emissiveColor = Color3.FromHexString("#b8754b");
    return mat;
  }

  outcrop(parent: TransformNode, seed: number, snow: number) {
    const root = new TransformNode("glacial-erratics", this.scene);
    root.parent = parent;
    for (let i = 0; i < 3; i++) {
      const height = 1.1 + Math.cos(seed + i * 2.7) * 0.55;
      const stone = this.forest.sandstone("frosted-glacial-boulder", [2.5 - i * 0.43, height, 2.2 - i * 0.32], seed + i * 3, root);
      stone.material = this.forest.surfaceMaterial("stone");
      stone.position.set((i - 1) * 1.1, height * 0.35, (i % 2) * 0.8);
      this.snowCoat(stone, (x, y, z) => Math.max(0, Math.min(1, (y / height + 0.16 + Math.sin(x * 4 + z * 3) * 0.13) * 2.7)) * snow);
    }
    return root;
  }

  vergeDetails(parent: TransformNode, seed: number) {
    const stone = this.forest.sandstone("verge-exposed-rock", [0.74, 0.36, 0.55], seed, parent);
    stone.material = this.forest.surfaceMaterial("stone");
    stone.position.set(-0.43, 0.16, 0.08);
    const fork = new Vector3(0.34, 0.56, -0.15);
    for (const path of [
      [new Vector3(0.18, 0.37, 0), fork, new Vector3(0.46, 0.72, -0.28)],
      [fork, new Vector3(0.56, 0.64, -0.06)],
    ]) {
      const twig = CreateTube("verge-twig", {path, radius: 0.022, tessellation: 5}, this.scene);
      twig.parent = parent; twig.material = this.forest.surfaceMaterial("bark");
    }
  }

  pine(parent: TransformNode, snow: number, seed = 0) {
    const root = new TransformNode("snow-pine", this.scene);
    root.parent = parent;
    this.cylinder("pine-trunk", root, 4.2, 0.38, 0.16, [0, 2.1, 0], "#615042");
    const lean = Math.sin(seed * 0.37) * 0.26;
    const tiers = Math.sin(seed) > 0.35 ? 4 : 5;
    for (let i = 0; i < tiers; i++) {
      const radius = (1.56 - i * 0.26) * (1 + 0.16 * Math.sin(seed + i * 3.4));
      const height = 1.69 - i * 0.1;
      const shape = [[0, 0], [radius * 0.74, 0.02], [radius, 0.16], [radius * 0.76, height * 0.35], [radius * 0.38, height * 0.68], [0, height]].map(([r, y]) => new Vector3(r, y, 0));
      const tier = CreateLathe("drooping-pine-boughs", {shape, tessellation: 26}, this.scene);
      tier.parent = root;
      tier.position.set(lean * i * 0.55, 0.94 + i * (tiers === 4 ? 0.91 : 0.72), 0);
      tier.rotation.y = seed + i * 0.87;
      tier.material = snowMaterial(this.scene, "needles", this.forest);
      const points = tier.getVerticesData(VertexBuffer.PositionKind)!;
      for (let n = 0; n < points.length; n += 3) {
        const x = points[n], z = points[n + 2], a = Math.atan2(z, x);
        const branch = Math.sin(a * 5 + i + seed) * 0.22 + Math.cos(a + seed * 0.71) * 0.21;
        const spread = 1 + branch + Math.cos(a * 9 - i) * 0.08;
        points[n] *= spread; points[n + 2] *= spread;
        points[n + 1] += Math.hypot(x, z) * (Math.sin(a * 6 + i) * 0.14 - snow * (0.1 + branch * 0.3));
      }
      this.shape(tier, points);
      this.snowCoat(tier, (x, y, z) => snow * Math.max(0, Math.min(1, (y / height - 0.09 + 0.23 * Math.sin(x * 4 + z * 3 + i)) * 3.2)));
    }
    return root;
  }
  create(type: ItemType, pickupHalo = true) {
    const root = new TransformNode("snow-" + type, this.scene);
    if (type === "snowdrift") {
      this.drift(root);
    } else if (type === "snowman") {
      this.ball("snowman-base", root, [1.6, 1.3, 1.4], [0, 0.6, 0]);
      this.ball("snowman-body", root, [1.15, 1.04, 1.05], [-0.08, 1.43, 0.02]).rotation.z = -0.2;
      this.ball("snowman-head", root, [0.81, 0.84, 0.77], [0, 2.22, -0.025]).rotation.z = 0.17;
      this.ball("snowman-compressed-seam", root, [1.15, 0.18, 1.06], [-0.07, 1.05, 0.02]).rotation.z = 0.13;
      this.cylinder("knitted-hat-cuff", root, 0.15, 0.77, 0.76, [0, 2.57, 0], "#a53e36");
      this.ball("knitted-hat-crown", root, [0.7, 0.38, 0.7], [0, 2.71, 0], "#a53e36");
      this.ball("snow-hat-pom", root, [0.2, 0.2, 0.2], [0.06, 2.93, 0]);
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.2;
        this.ball("coal-smile", root, [0.045, 0.045, 0.04], [Math.sin(a) * 0.34, 2.06 + Math.abs(a) * 0.09, -0.35], "#263f4b");
      }
      for (const side of [-1, 1]) this.ball("coal-eye", root, [0.08, 0.08, 0.06], [side * 0.16, 2.33, -0.36], "#263f4b");
      const nose = this.cylinder("carrot-nose", root, 0.34, 0.15, 0, [0, 2.19, -0.48], "#e88a3e"); nose.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 3; i++) this.ball("coal-button", root, [0.09, 0.09, 0.07], [0, 1.12 + i * 0.24, -0.49], "#263f4b");
      this.cylinder("snowman-scarf", root, 0.15, 0.84, 0.84, [0, 1.88, 0], "#b54d40");
      const scarf = this.ball("scarf-tail", root, [0.23, 0.55, 0.065], [0.25, 1.62, -0.48], "#a53e36"); scarf.rotation.z = 0.2;
      for (let i = 0; i < 4; i++) this.cylinder("scarf-fringe", root, 0.08, 0.022, 0.018, [0.19 + i * 0.045, 1.33, -0.49], "#a53e36");
      for (const side of [-1, 1]) {
        const tip = new Vector3(side * 1.15, 1.82, 0.03);
        for (const [start, end] of [
          [new Vector3(side * 0.39, 1.41, 0.04), tip],
          [tip, new Vector3(side * 1.36, 2.02, 0.05)],
          [tip, new Vector3(side * 1.39, 1.77, -0.14)],
        ]) {
          const twig = CreateTube("forked-snowman-twig", {path: [start, end], radius: 0.028, tessellation: 8, cap: 3}, this.scene);
          twig.parent = root; twig.material = this.forest.surfaceMaterial("bark");
        }
      }
    } else if (type === "liquor") {
      const shape = [[0,-0.25],[0.1,-0.25],[0.14,-0.22],[0.145,-0.12],[0.145,0.19],[0.135,0.26],[0.095,0.32],[0.058,0.37],[0.055,0.54],[0.064,0.55]].map(([r,y]) => new Vector3(r,y,0));
      const glass = CreateLathe("moulded-green-glass-bottle", {shape, tessellation: 48, cap: 3}, this.scene);
      glass.parent = root; glass.material = snowMaterial(this.scene, "glass", this.forest);
      this.cylinder("amber-spirit", root, 0.43, 0.255, 0.255, [0, 0.018, 0], "#ae7338");
      this.cylinder("spirit-meniscus", root, 0.011, 0.255, 0.255, [0, 0.235, 0], "#e8ad63");
      const label = CreateCylinder("wraparound-bottle-label", {height: 0.22, diameter: 0.305, tessellation: 48, cap: Mesh.NO_CAP}, this.scene);
      label.parent = root;
      label.position.y = 0.015;
      label.material = snowMaterial(this.scene, "label", this.forest);
      this.cylinder("bottle-lip", root, 0.04, 0.136, 0.136, [0, 0.54, 0], "#c2a66b");
      const cork = this.cylinder("cork", root, 0.08, 0.105, 0.105, [0, 0.6, 0], "#c7aa76");
      cork.setEnabled(pickupHalo);
      const glint = CreateTube("glass-edge-glint", {path: [new Vector3(-0.065,-0.17,-0.128), new Vector3(-0.065,0.19,-0.128), new Vector3(-0.04,0.3,-0.08)], radius: 0.005, tessellation: 8}, this.scene);
      glint.parent = root; glint.material = this.mat("#bdd6c4");
      if (pickupHalo) {
        const halo = CreateTorus("warm-pickup-ring", {diameter: 0.85, thickness: 0.025, tessellation: 48}, this.scene);
        halo.parent = root; halo.position.y = -0.3; halo.material = this.mat("#ffc877", true);
      }
    } else if (type === "ice" || type === "pool") {
      const pool = type === "pool", halfWidth = WINTER_HAZARD_HALF_WIDTH;
      const length = pool ? CONFIG.poolLength : 6;
      const surface = CreateGround(pool ? "open-dark-water" : "reflective-ice", {width: 2 * halfWidth, height: length, subdivisions: pool ? 12 : 16}, this.scene);
      surface.parent = root;
      const material = snowMaterial(this.scene, pool ? "water" : "ice", this.forest);
      surface.material = material;
      if (pool && material.diffuseTexture instanceof DynamicTexture)
        this.poolTexture = material.diffuseTexture;
      const profile = (z: number) => 1 + 0.025 * Math.sin(z * 1.65) + 0.018 * Math.cos(z * 4.1);
      const wave = surface.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < wave.length; i += 3) {
        if (!pool) wave[i] *= profile(wave[i + 2]);
        wave[i + 1] = pool ? POOL_WATER_Y + Math.sin(wave[i] * 8 + wave[i + 2] * 3.7) * 0.008 : WINTER_ROAD_Y + 0.004;
      }
      this.shape(surface, wave);
      const rim = [
        ...Array.from({length: 17}, (_, i) => [-halfWidth, (i / 16 - 0.5) * length]),
        [0, length / 2],
        ...Array.from({length: 17}, (_, i) => [halfWidth, (0.5 - i / 16) * length]),
        [0, -length / 2], [-halfWidth, -length / 2],
      ];
      const vertices: number[] = [], indices: number[] = [], uv: number[] = [], colors: number[] = [];
      for (const [i, [x, z]] of rim.entries()) {
        const chip = 0.024 + 0.066 * (0.5 + 0.5 * Math.sin(i * 7.1));
        const edgeX = pool ? x : x * profile(z);
        const edgeY = WINTER_ROAD_Y + 0.006;
        const insetX = Math.sign(x) * (Math.abs(edgeX) - (x === 0 ? 0 : chip));
        const insetZ = Math.abs(z) === length / 2 ? z - Math.sign(z) * chip : z;
        vertices.push(edgeX, edgeY, z, insetX, pool ? -0.064 - chip : edgeY + 0.001, insetZ);
        uv.push(i / 5, 0, i / 5, 0.35);
        colors.push(1, 1, 1, 1, 0.81, 0.9, 0.97, 1);
        if (pool) {
          vertices.push(insetX * 0.96, POOL_WATER_Y - 0.12, insetZ * 0.999);
          uv.push(i / 5, 1);
          colors.push(0.25, 0.41, 0.53, 1);
        }
        const stride = pool ? 3 : 2, a = i * stride;
        if (i < rim.length - 1) for (let j = 0; j < stride - 1; j++)
          indices.push(a + j, a + j + stride, a + j + 1, a + j + 1, a + j + stride, a + j + stride + 1);
      }
      const edge = new Mesh(pool ? "eroded-pool-wall" : "thin-frost-rim", this.scene);
      const data = new VertexData();
      const normals: number[] = [];
      VertexData.ComputeNormals(vertices, indices, normals);
      data.positions = vertices; data.indices = indices; data.normals = normals; data.uvs = uv; data.colors = colors;
      data.applyToMesh(edge);
      edge.parent = root; edge.receiveShadows = true;
      const rimMat = this.mat(pool ? "#bed6e4" : "#e1f3fa");
      rimMat.backFaceCulling = false; rimMat.twoSidedLighting = true;
      edge.material = rimMat;
    } else if (type === "fire") {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        this.ball("hearth-stone", root, [0.35, 0.24, 0.35], [Math.cos(a) * 0.68, 0.12, Math.sin(a) * 0.68], "#687581");
      }
      for (const side of [-1, 1]) {
        const log = this.cylinder("firewood", root, 1.1, 0.23, 0.2, [0, side < 0 ? 0.13 : 0.25, 0], "#664935");
        log.rotation.z = Math.PI / 2; log.rotation.y = side * 0.6;
      }
      this.ball("charcoal-heart", root, [0.78, 0.22, 0.62], [0, 0.15, 0], "#4c2a21");
      const glow = CreateGround("hearth-snow-glow", {width: 2.9, height: 3.3}, this.scene);
      glow.parent = root; glow.position.y = WINTER_ROAD_Y + 0.008;
      glow.material = this.firelight();
      const flames: Mesh[] = [];
      for (let i = 0; i < 7; i++) {
        const flame = CreateLathe("living-flame", {shape: [[0,0],[0.14,0.08],[0.18,0.22],[0.11,0.44],[0.08,0.6],[0,0.78]].map(([r,y]) => new Vector3(r,y,0)), tessellation: 24, cap: 3}, this.scene);
        flame.parent = root; flame.position.set(Math.sin(i * 2) * 0.24, 0.18, Math.cos(i * 2) * 0.24);
        flame.scaling.set(0.86 + i % 3 * 0.18, 0.9 - (i % 3) * 0.08, 0.48 + i % 3 * 0.12);
        flame.material = this.mat(i % 2 ? "#ffdb74" : "#f18a3a", true);
        flames.push(flame);
      }
      this.fires.set(root, {glow, flames});
      for (let i = 0; i < 6; i++) this.ball("glowing-ember", root, [0.08, 0.04, 0.08], [Math.sin(i * 2) * 0.35, 0.18, Math.cos(i * 2) * 0.35], "#f18a3a").material = this.mat("#f18a3a", true);
    } else if (type === "stump" || type === "snow-log") {
      const log = type === "snow-log";
      const wood = new TransformNode("bark-and-cut-wood", this.scene); wood.parent = root;
      const length = log ? 8.6 : 0.8;
      const bark = CreateCylinder("scored-bark", {height: length, diameterBottom: 0.95, diameterTop: 0.88, tessellation: 48, subdivisions: 7, cap: Mesh.NO_CAP}, this.scene);
      bark.parent = wood; bark.material = this.forest.surfaceMaterial("bark");
      const points = bark.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < points.length; i += 3) {
        const a = Math.atan2(points[i + 2], points[i]);
        const y = points[i + 1] / length + 0.5;
        const roughness = 1 + Math.sin(Math.PI * y) * (Math.sin(a * 13 + y * 3) * 0.04 + Math.cos(a * 17) * 0.025);
        points[i] *= roughness; points[i + 2] *= roughness;
      }
      this.shape(bark, points);
      for (const side of [-1, 1]) {
        const knot = this.cylinder("bark-branch-knot", wood, 0.34, 0.22, 0.14, [side * 0.43, -length * 0.16, 0.08], "#654939"); knot.rotation.z = side * -1.2;
        this.ball("snow-on-branch-knot", wood, [0.26, 0.12, 0.2], [side * 0.5, -length * 0.16 + 0.11, 0.08]);
      }
      for (const side of [-1, 1]) {
        const cut = CreateDisc("single-end-grain", {radius: side > 0 ? 0.44 : 0.475, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE}, this.scene);
        cut.parent = wood; cut.position.y = side * length / 2;
        cut.rotation.x = Math.PI / 2; cut.material = this.forest.surfaceMaterial("cut");
      }
      if (log) wood.rotation.z = Math.PI / 2;
      wood.position.y = log ? 0.48 : 0.4;
      this.ball("settled-snow-cap", root, log ? [8.2, 0.15, 0.7] : [0.85, 0.11, 0.8], [0, log ? 0.85 : 0.81, 0]);
      for (let i = 0; i < 4; i++) {
        const splinter = this.cylinder("bark-splinter", wood, 0.18 + i * 0.028, 0.14, 0.012, [
          Math.sin(i * 2.4) * 0.34, length / 2 - 0.025, Math.cos(i * 2.4) * 0.34,
        ], "#674f3a");
        splinter.rotation.z = Math.sin(i * 2.4) * 0.42;
        if (!log) { splinter.position.y -= 0.07; splinter.rotation.z += 0.9; }
      }
      if (!log) for (const side of [-1, 1]) this.ball("stump-root", root, [1.3, 0.24, 0.3], [0, 0.1, 0], "#654939").rotation.y = side * 0.7;
    }
    return root;
  }
  animateFire(root: TransformNode, time: number) {
    const {glow, flames} = this.fires.get(root)!;
    glow.visibility = 0.79 + Math.sin(time * 9) * 0.1 + Math.sin(time * 16) * 0.07;
    for (const flame of flames) {
      flame.scaling.y = 0.85 + Math.sin(time * 12 + flame.position.x * 8) * 0.15;
      flame.rotation.z = Math.sin(time * 8 + flame.position.z * 9) * 0.13;
    }
  }

  animateWater(time: number) {
    if (!this.poolTexture) return;
    this.poolTexture.uOffset = Math.sin(time * 0.04) * 0.03;
    this.poolTexture.vOffset = time * 0.012;
  }
}
