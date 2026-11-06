import { CoastSurface } from "./coast-surface.ts";
import { coastFloor, coastWeights, coastSandUV } from "./coast-layout.ts";
import type { Material } from "@babylonjs/core/Materials/material";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { coastGridIndices } from "./ocean-geometry.ts";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { OceanWater } from "./ocean-water.ts";
import { OceanProps } from "./ocean-props.ts";
import { CONFIG } from "./config.ts";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { defaultTrack, gapsNear, roadSpans, sectionAt, snowBlend } from "./track.ts";
import { snowMaterial } from "./snow-materials.ts";
import { WINTER_VERTEX, withSnowLayer } from "./snow-layer.ts";
import { WINTER_HAZARD_HALF_WIDTH, winterGroundHeight, winterShoulder } from "./snow-layout.ts";
import type { TrackItem } from "./game.ts";
import { SnowProps } from "./snow-props.ts";
import { mergeSceneryMeshes } from "./scenery-mesh";
import type { ForestProps } from "./props.ts";

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const TUNNEL_HALF_WIDTH = 5.65;

export class TerrainScene {
  private seed = 0;
  private plan = defaultTrack;
  private planRevision = 0;
  private snow?: SnowProps;
  private pendingSurfaces = new Map<Mesh, Material>();
  private cells = new Map<number, TransformNode>();
  private poolCuts = new Map<number, string>();
  private windRibbons = new Map<number, Mesh>();
  private snowWind?: StandardMaterial;
  private coastSurface?: CoastSurface;
  private get sand(): ShaderMaterial {
    this.coastSurface ??= new CoastSurface(this.scene, this.props);
    return this.coastSurface.material;
  }
  private water: OceanWater;
  private ocean: OceanProps;
  private grass: StandardMaterial;
  private trail: StandardMaterial;
  private stone: StandardMaterial;
  private cliff: StandardMaterial;
  private tunnel: StandardMaterial;
  private tunnelTrail: StandardMaterial;
  private tunnelStone: StandardMaterial;
  private guide: StandardMaterial;
  constructor(
    private scene: Scene,
    private props: ForestProps,
  ) {
    const material = (name: string, color: string, file?: string) => {
      const mat = new StandardMaterial(name, scene);
      mat.diffuseColor = Color3.FromHexString(color).toLinearSpace();
      mat.specularColor = Color3.Black();
      if (file) {
        mat.diffuseTexture = new Texture(
          import.meta.env.BASE_URL + "art/" + file,
          scene,
        );
        mat.diffuseTexture.anisotropicFilteringLevel = 8;
        if (mat.diffuseTexture instanceof Texture) mat.diffuseTexture.isBlocking = false;
      }
      return mat;
    };
    this.ocean = new OceanProps(scene);
    this.water = new OceanWater(scene);

    this.grass = material("grass-floor", "#ffffff", "woodland-grass.webp");
    this.trail = material("forest-trail", "#e3dccc", "woodland-trail.webp");
    this.stone = material("canyon-road", "#ffffff", "canyon-trail.webp");
    this.cliff = material(
      "layered-sandstone",
      "#ffffff",
      "canyon-sandstone.webp",
    );
    this.cliff.backFaceCulling = false;
    this.cliff.twoSidedLighting = true;
    this.tunnel = material("cave-interior", "#9e9586", "canyon-sandstone.webp");
    this.tunnel.backFaceCulling = false;
    this.tunnel.twoSidedLighting = true;
    this.tunnelTrail = material(
      "cave-trail-floor",
      "#e3dccc",
      "woodland-trail.webp",
    );
    this.tunnelStone = material(
      "cave-canyon-floor",
      "#ffffff",
      "canyon-trail.webp",
    );
    this.guide = material("chalk-wall-route", "#ead8ac");
    this.guide.backFaceCulling = false;
    // Exterior surfaces remain faintly readable through a dark cave mouth.
    for (const mat of [this.grass, this.trail, this.stone, this.cliff]) {
      mat.emissiveTexture = mat.diffuseTexture;
      mat.emissiveColor.setAll(0.09);
    }
  }

  private surface(
    name: string,
    positions: number[],
    indices: number[],
    uvs: number[],
    colors: number[],
    parent: TransformNode,
    material: Material,
  ) {
    const mesh = new Mesh(name, this.scene);
    const data = new VertexData();
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    data.positions = positions;
    data.indices = indices;
    data.uvs = uvs;
    data.colors = colors;
    data.normals = normals;
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.parent = parent;
    mesh.receiveShadows = true;
    return mesh;
  }

  private ground(
    width: number,
    length: number,
    x: number,
    y: number,
    z: number,
    parent: TransformNode,
    material: Material,
    world: number,
  ) {
    const mesh = CreateGround(
      "terrain-surface",
      { width, height: length },
      this.scene,
    );
    const uv = mesh.getVerticesData(VertexBuffer.UVKind)!;
    const tile =
      material === this.grass
        ? 2.5
        : material === this.trail || material === this.tunnelTrail
          ? 8
          : 6;
    for (let i = 0; i < uv.length; i += 2) {
      uv[i] = (uv[i] * width + x - width / 2) / tile;
      uv[i + 1] = (uv[i + 1] * length + world) / tile;
    }
    mesh.setVerticesData(VertexBuffer.UVKind, uv);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.receiveShadows = true;
  }

  private prepareSurface(mesh: Mesh, preferred: Material, fallback: Material) {
    mesh.material = fallback;
    this.pendingSurfaces.set(mesh, preferred);
  }

  private canyonProfile(world: number, distance: number) {
    const section = this.plan.at(world + 0.1);
    const exit = this.plan.at(section.end).biome;
    const entry = this.plan.at(section.start - 1).biome;
    const leave = exit === "beach" || exit === "snow-transition" ? smooth((section.end - distance) / 80) : 1;
    const enter = entry === "snow-transition" || entry === "shore" ? smooth((distance - section.start) / 80) : 1;
    return Math.max(0.004, leave * enter);
  }

  private winterCell(world: number, index: number, root: TransformNode, pools: readonly TrackItem[]) {
    const section = this.plan.at(world + 5);
    const canyonSide = section.biome === "snow-transition" && (section.from === "canyon" || section.to === "canyon");
    const roadEdge = (snow: number) => canyonSide ? 4.3 + 1.4 * (1 - snow) : 4.3;
    const snowTexture = snowMaterial(this.scene, "snow", this.props).diffuseTexture!;
    const halfLength = CONFIG.poolLength / 2;
    const sorted = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
    const zCuts = sorted([
      ...Array.from({length: 9}, (_, i) => i * 1.25),
      ...pools.flatMap(pool => [-halfLength, halfLength].map(end => pool.worldZ + end - world)).filter(z => z > 0 && z < 10),
    ]);
    const roadCuts = sorted([
      ...Array.from({length: 17}, (_, i) => i / 16),
      ...pools.flatMap(pool => [-WINTER_HAZARD_HALF_WIDTH, WINTER_HAZARD_HALF_WIDTH].map(edge => (pool.lane * 2.5 + edge + 4.3) / 8.6)),
    ]);
    for (const band of [-1, 0, 1]) {
      const pos: number[] = [], uv: number[] = [], coverage: number[] = [], colors: number[] = [];
      const base = band === 0 ? (canyonSide ? this.stone : this.trail) : (canyonSide ? this.stone : this.grass);
      const tile = band === 0 ? (canyonSide ? 6 : 8) : (canyonSide ? 6 : 2.5);
      const columns = band === 0 ? roadCuts.length - 1 : 22;
      for (const z of zCuts) {
        const d = world + z;
        const snow = snowBlend(d, this.plan), edge = roadEdge(snow);
        for (let col = 0; col <= columns; col++) {
          const t = col / columns;
          const x = band === 0 ? (roadCuts[col] * 2 - 1) * edge : band * (edge + t ** 1.55 * (74.3 - edge));
          pos.push(x, winterGroundHeight(x, d, snow, edge), z);
          uv.push(x / tile, d / tile);
          coverage.push(x / 2.8, d / 2.8, winterShoulder(x, d, this.plan));
          const packed = (1 - smooth((Math.abs(x) - 2.8) / 1.5)) * snow;
          const shade = packed * (0.06 + 0.025 * Math.sin(d * 0.22)) +
            snow * smooth((Math.abs(x) - 24) / 40) * (0.15 + 0.07 * Math.sin(d * 0.044 + x * 0.16));
          colors.push(1 - shade, 1 - shade * 0.78, 1 - shade * 0.45, 1);
        }
      }
      const visible: number[] = [];
      for (let row = 0; row < zCuts.length - 1; row++) for (let col = 0; col < columns; col++) {
        const a = row * (columns + 1) + col, b = a + columns + 1;
        const x = (pos[a * 3] + pos[(a + 1) * 3]) / 2;
        const z = world + (zCuts[row] + zCuts[row + 1]) / 2;
        if (band === 0 && pools.some(pool => Math.abs(z - pool.worldZ) < halfLength &&
          Math.abs(x - pool.lane * 2.5) < WINTER_HAZARD_HALF_WIDTH)) continue;
        if (band < 0) visible.push(a, b, a + 1, a + 1, b, b + 1);
        else visible.push(a, a + 1, b, a + 1, b + 1, b);
      }
      const mesh = this.surface("single-layer-winter-ground", pos, visible, uv, colors, root, withSnowLayer(base, snowTexture));
      mesh.setVerticesData(WINTER_VERTEX, coverage, false, 3);
      this.prepareSurface(mesh, mesh.material!, base);
    }
    this.snow ??= new SnowProps(this.scene, this.props);
    for (const side of [-1, 1]) {
      const seed = index * 17 + this.seed * 0.618 + side * 93;
      const pick = (salt: number) => {
        const value = Math.sin(seed + salt * 37.1) * 43758.5453;
        return value - Math.floor(value);
      };
      const z = 1.4 + pick(1) * 7, snow = snowBlend(world + z, this.plan);
      const place = (node: TransformNode, x: number, at: number) => {
        const cover = snowBlend(world + at, this.plan);
        node.position.set(side * x, winterGroundHeight(side * x, world + at, cover, roadEdge(cover)) - 0.04, at);
        node.rotation.y = pick(6) * Math.PI * 2;
      };
      const grove = Math.sin(world * 0.027 + side * 1.8 + this.seed * 0.19);
      if (pick(2) < 0.63 + grove * 0.32) {
        const tree = this.snow.pine(root, snow, seed);
        place(tree, 8 + pick(3) * 9 + (1 - snow) * 3, z);
        const scale = (0.64 + pick(4) * 0.72) * (0.32 + 0.68 * smooth(snow / 0.66));
        tree.scaling.set(scale * (0.74 + pick(5) * 0.5), scale, scale);
      }
      if (snow > 0.28 && pick(7) > 0.22) {
        const bank = this.snow.drift(root);
        place(bank, 5.7 + pick(8) * 2.1, 10 - z);
        bank.rotation.y = 0.4 + pick(9) * 0.9;
        bank.scaling.set(0.8 + pick(4) * 1.3, 0.32 + pick(5) * 0.65, 1.4 + pick(3) * 0.9);
        if (pick(10) > 0.53) this.snow.vergeDetails(bank, seed);
      }
      if (snow > 0.32 && pick(11) > 0.67) {
        const rock = this.snow.outcrop(root, seed, snow);
        place(rock, 12 + pick(12) * 15, 5);
        rock.scaling.set(1.3 + pick(5), 0.9 + pick(4) * 0.6, 1);
      }
    }
    this.batchWinterScenery(root);
    if (section.biome === "snow" && index % 3 === 0) this.windRibbons.set(index, this.windRibbon(root));
  }

  private batchWinterScenery(root: TransformNode) {
    const groups = new Map<Material, Mesh[]>();
    for (const mesh of root.getChildMeshes()) {
      if (!(mesh instanceof Mesh) || mesh.name === "single-layer-winter-ground" || !mesh.material) continue;
      const group = groups.get(mesh.material) ?? [];
      group.push(mesh);
      groups.set(mesh.material, group);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      // MergeMeshes extracts standard vertex data. Carry the snow coverage along separately.
      const snow = group[0].isVerticesDataPresent(WINTER_VERTEX)
        ? group.flatMap(mesh => Array.from(mesh.getVerticesData(WINTER_VERTEX)!))
        : null;
      const merged = Mesh.MergeMeshes(group, true, true);
      if (!merged) continue;
      if (snow) merged.setVerticesData(WINTER_VERTEX, snow, false, 3);
      merged.parent = root;
      merged.receiveShadows = true;
    }
  }

  private windRibbon(root: TransformNode) {
    if (!this.snowWind) {
      const texture = new DynamicTexture("blown-snow", {width: 128, height: 32}, this.scene, true);
      const ctx = texture.getContext();
      for (const [x, y, stretch, color] of [
        [58, 18, 0.17, "#d7edffc0"],
        [71, 12, 0.09, "#eff9ffae"],
        [76, 22, 0.08, "#b5d6eea0"],
      ] as const) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, stretch);
        const fade = ctx.createRadialGradient(0, 0, 0, 0, 0, 52);
        fade.addColorStop(0, color);
        fade.addColorStop(1, "#d7edff00");
        ctx.fillStyle = fade;
        ctx.fillRect(-52, -52, 104, 104);
        ctx.restore();
      }
      texture.hasAlpha = true;
      texture.update();
      const mat = this.snowWind = new StandardMaterial("blown-snow", this.scene);
      mat.emissiveTexture = texture;
      mat.emissiveColor.setAll(0.8);
      mat.opacityTexture = texture;
      mat.disableLighting = true;
      mat.specularColor.setAll(0);
      mat.backFaceCulling = false;
    }
    const ribbon = CreateGround("ground-spindrift", {width: 16, height: 3.6}, this.scene);
    ribbon.parent = root;
    ribbon.position.set(-12, 0.31, 4.5);
    ribbon.rotation.y = -0.32;
    ribbon.material = this.snowWind;
    ribbon.isPickable = false;
    ribbon.visibility = 0;
    return ribbon;
  }

  private cliffWall(side: number, world: number, parent: TransformNode) {
    const positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [],
      colors: number[] = [];
    const rows = 24,
      columns = 10;
    for (let z = 0; z <= columns; z++) {
      const absolute = world + z;
      const crest =
        13 +
        Math.sin(absolute * 0.037 + side) * 2.4 +
        Math.sin(absolute * 0.11) * 0.6;
      const taper = this.canyonProfile(world, absolute);
      for (let row = 0; row <= rows; row++) {
        const y = (-18 + (row / rows) * (crest + 18)) * taper;
        // Keep the three playable wall heights close to the collision surface.
        const relief =
          0.07 + smooth((y - 4.5) / 4) * 0.7 + smooth((-y - 1) / 8) * 0.6;
        const contour =
          Math.sin(absolute * 0.13 + y * 0.58) * 0.6 +
          Math.cos(y * 2.2 + absolute * 0.06) * 0.18;
        const x = side * (5.46 + contour * relief + smooth((y - 7) / 6) * 2.4);
        positions.push(x, y, z);
        uvs.push(absolute / 5.5, y / 5.5);
        const shade = 0.69 + smooth((y + 12) / 22) * 0.31;
        const stratum = 0.95 + Math.sin(y * 2.2 + absolute * 0.012) * 0.05;
        colors.push(shade * stratum, shade * stratum * 0.96, shade * 0.9, 1);
        if (z < columns && row < rows) {
          const a = z * (rows + 1) + row,
            b = a + rows + 1;
          if (side < 0) indices.push(a, a + 1, b, a + 1, b + 1, b);
          else indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    this.surface(
      "eroded-continuous-cliff",
      positions,
      indices,
      uvs,
      colors,
      parent,
      this.cliff,
    );
  }

  private arch(
    world: number,
    parent: TransformNode,
    portal = false,
    offset = 0,
  ) {
    const section = sectionAt(world + 0.1, this.plan);
    const positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [],
      colors: number[] = [];
    const profile: [number, number][] = [[-TUNNEL_HALF_WIDTH, -1.2]];
    for (let i = 0; i <= 24; i++) {
      const angle = (i / 24) * Math.PI;
      profile.push([-Math.cos(angle) * TUNNEL_HALF_WIDTH, 3.1 + Math.sin(angle) * 4.7]);
    }
    profile.push([TUNNEL_HALF_WIDTH, -1.2]);
    const rows = profile.length,
      depth = portal ? 1.8 : 10;
    const layers = portal ? 3 : 5;
    for (let layer = 0; layer <= layers; layer++) {
      const z = offset + (depth * layer) / layers;
      for (let i = 0; i < rows; i++) {
        const [x, y] = profile[i];
        const wear =
          Math.sin(i * 1.3 + (world + z) * 0.22) * (portal ? 0.1 : 0.06);
        positions.push(x + Math.sign(x) * wear, y + wear * 0.6, z);
        uvs.push(i / 8, (world + z) / 5);
        const mouth = Math.min(
          world + z - section.start,
          section.end - world - z,
        );
        const shade = portal ? 0.9 : 0.28 + (1 - smooth(mouth / 18)) * 0.52;
        colors.push(shade, shade * 0.97, shade * 0.91, 1);
        if (layer < layers && i < rows - 1) {
          const a = layer * rows + i,
            b = a + rows;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    this.surface(
      portal ? "weathered-cave-mouth" : "arched-cave-vault",
      positions,
      indices,
      uvs,
      colors,
      parent,
      portal ? this.cliff : this.tunnel,
    );
    if (portal) {
      const face: number[] = [],
        triangles: number[] = [],
        faceUvs: number[] = [];
      for (let i = 0; i < rows; i++) {
        const [x, y] = profile[i];
        const crown = smooth((y - 3.1) / 4.7);
        face.push(x, y, offset, x * 1.85, y + crown * 6.5, offset);
        faceUvs.push(x / 5, y / 5, (x * 1.85) / 5, (y + crown * 6.5) / 5);
        if (i < rows - 1) {
          const a = i * 2;
          triangles.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      this.surface(
        "solid-rock-portal-face",
        face,
        triangles,
        faceUvs,
        new Array((face.length / 3) * 4).fill(1),
        parent,
        this.cliff,
      );
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        const stone = this.props.sandstone(
          "portal-arch-stone",
          [1.65, 1.15, 2.2],
          world + i,
          parent,
        );
        stone.position.set(
          -Math.cos(a) * 6.15,
          3.1 + Math.sin(a) * 5.25,
          offset + 0.8,
        );
        stone.rotation.z = Math.PI / 2 - a;
      }
      for (const side of [-1, 1]) {
        const buttress = this.props.sandstone(
          "cave-mouth-buttress",
          [4.4, 8, 6],
          world + side,
          parent,
        );
        buttress.position.set(side * 8, 2.6, offset + 1.6);
      }
    }
  }

  private coastHeight(x: number, d: number) {
    const section = sectionAt(d, this.plan);
    const underwater = section.biome === "water";
    const edgeBlend = section.biome === "beach" ? smooth((d - section.start) / 24)
      : section.biome === "shore" ? 1 - smooth((d - section.start - 50) / 30) : underwater ? 1 : 0;
    const snow = snowBlend(d, this.plan);
    const edge = 4.3;
    const winterRelief = snow * (winterGroundHeight(x, d, 1, edge) - 0.06);
    const relief = underwater
      ? (Math.sin(x * 0.27 + d * 0.07) * 0.65 + Math.cos(x * 0.5 - d * 0.04) * 0.3) * smooth((Math.abs(x) - 4) / 7)
      : (Math.exp(-Math.pow((Math.abs(x) - 11) / 5, 2)) * 1.2 - smooth((Math.abs(x) - 18) / 18) * 5) * edgeBlend;
    return coastFloor(d, this.plan) + relief * (1 - snow) + winterRelief;
  }

  private coastCell(world: number, index: number, root: TransformNode) {
    const section = sectionAt(world + 5, this.plan);
    const underwater = section.biome === "water";
    const positions: number[] = [], uvs: number[] = [], colors: number[] = [];
    const columns = 40, rows = 5;
    for (let row = 0; row <= rows; row++) {
      const z = row * 2, d = world + z;
      for (let col = 0; col <= columns; col++) {
        const x = (col - columns / 2) * 4;
        const height = this.coastHeight(x, d);
        positions.push(x, height, z); uvs.push(...coastSandUV(x, d, this.plan));
        colors.push(...coastWeights(d, this.plan));

      }
    }
    const material = this.sand;
    const seabed = this.surface("rippled-coastal-contours", positions, coastGridIndices(columns, rows), uvs, new Array(colors.length).fill(1), root, material);
    seabed.setVerticesData("coastWeights", colors, false, 4);
    this.prepareSurface(seabed, material, this.coastSurface!.fallback);
    if (underwater) this.water.caustics(root, seabed);
    // Dry land occludes the full-width sea; shoreline depth controls surf and transparency.
    this.water.cell(root, world, (x, d) => this.coastHeight(x, d));
    for (const side of [-1, 1]) {
      for (let cluster = 0; cluster < 2; cluster++) {
        const x = side * (7 + cluster * 7 + Math.sin(world * 0.13 + side) * 0.8);
        const z = 2 + cluster * 5;
        const y = this.coastHeight(x, world + z);
        const rock = this.ocean.rock(root, [2.3 + cluster * 0.7, 1.4 + (Math.sin(world + side) + 1) * 0.8, 2.7 + cluster],
          world * 0.37 + side + cluster, underwater ? "#6b8990" : "#b4aa91");
        rock.position.set(x + Math.sin(world * 0.21) * 0.7, y + 0.35, z);
        rock.rotation.y = Math.sin(world * 0.17 + side) * 1.2;
        if (underwater) {
          const coral = this.ocean.coral(root, index + cluster, 1.5 + cluster * 0.8,
            ["#c78198", "#cdac71", "#819dca"][Math.abs(index + cluster) % 3]);
          coral.position.set(x - side * 0.7, this.coastHeight(x - side * 0.7, world + z) - 0.12, z);
          const kelp = this.ocean.kelp(root, 2.5 + cluster * 1.8, index + cluster);
          kelp.position.set(x + side * 1.7, this.coastHeight(x + side * 1.7, world + z + 1.5) - 0.08, z + 1.5);
          const fan = this.ocean.coral(root, 2, 2.5, "#bb899c");
          fan.position.set(x + side * 3.6, this.coastHeight(x + side * 3.6, world + z + 2) - 0.12, z + 2); fan.scaling.set(1.7, 1, 0.35);
        } else {
          // Rock pools, scattered shells and low vegetation bridge canyon and forest shores.
          for (let i = 0; i < 4; i++) {
            const shell = CreateSphere("ribbed-beach-shell", {diameter: 0.24, segments: 8}, this.scene);
            shell.parent = root; shell.material = this.ocean.material("shell", "#e8cfba");
            shell.scaling.set(1, 0.28, 0.75); shell.position.set(x + i * side * 0.4, y + 0.14, z + i * 0.6);
          }
          const grass = this.ocean.kelp(root, 0.65, index);
          grass.position.set(side * 9, y + 0.5, z);
        }
      }
      if (underwater && index % 5 === 0) {
        // Large arches sit outside the nine-cell corridor and frame the distant reef.
        const archPath = Array.from({length: 17}, (_, i) => {
          const a = i * Math.PI / 16;
          return new Vector3(side * 19 + Math.cos(a) * 6, CONFIG.seabedHeight + Math.sin(a) * 8.5, 5 + Math.sin(a * 2) * 0.6);
        });
        const arch = CreateTube("ancient-eroded-reef-arch", {path: archPath, radius: 1.3, tessellation: 10, cap: 3}, this.scene);
        arch.parent = root; arch.material = this.ocean.material("basalt", "#66838b");
        for (let tower = 0; tower < 3; tower++) {
          const mesa = this.ocean.rock(root, [7, 10 + tower * 3, 12], world * 0.37 + tower, "#66838b");
          mesa.position.set(side * (35 + tower * 9), CONFIG.seabedHeight - 2, 5); mesa.material = arch.material;
        }
        for (let fish = 0; fish < 8; fish++) {
          const model = this.ocean.fish(root, "#7daeb9");
          model.position.set(side * (11 + fish * 0.7), -2 - (fish % 3) * 0.4, fish * 0.7);
          model.scaling.setAll(0.65);
        }
      }
    }
    if (!underwater) {
      const t = (world + 5 - section.start) / (section.end - section.start);
      const rockBlend = section.biome === "shore" && section.to === "canyon" ? smooth((t - 0.5) * 2) : 0;
      const snow = section.to === "snow" ? smooth(t) : section.from === "snow" ? 1 - smooth(t) : 0;
      for (const side of [-1, 1]) {
        if (rockBlend > 0) {
          const shoulder = this.props.sandstone("coast-canyon-rise", [10, 14 * rockBlend, 11], world + side, root);
          shoulder.position.set(side * 13, 4 * rockBlend, 5);
        }
        if (snow > 0.26) {
          this.snow ??= new SnowProps(this.scene, this.props);
          const pine = this.snow.pine(root, snow);
          pine.position.set(side * 10, this.coastHeight(side * 10, world + 5), 5);
          pine.scaling.setAll(0.4 + snow * 0.6);
        }
      }
    }
    if (underwater) {
      if (index % 3 === 0) {
        const light = this.ocean.material("light", "#b9ebe0");
        light.alpha = 0.045; light.disableLighting = true;
        light.emissiveColor = Color3.FromHexString("#b9ebe0");
        light.backFaceCulling = false;
        for (const side of [-1, 1]) {
          const shaft = CreateCylinder("slanted-underwater-sunbeam", {height: 9.5, diameterTop: 0.6, diameterBottom: 2.4, tessellation: 12}, this.scene);
          shaft.parent = root; shaft.material = light;
          shaft.position.set(side * 9.5, -4.9, 4); shaft.rotation.z = side * 0.23;
        }
      }
      for (let i = 0; i < 3; i++) {
        const bubble = CreateSphere("tiny-decorative-bubble", {diameter: 0.06, segments: 6}, this.scene);
        bubble.parent = root; bubble.material = this.ocean.material("decorative-bubble", "#c4f4ee");
        bubble.material.alpha = 0.35; bubble.position.set(-5 + i * 5, -5 + i * 2, 5);
        for (const side of [-1, 1])
          this.ground(0.025, 7, side * 3.8, CONFIG.waterHeights[i] - 0.1, 5, root, this.guide, world);
      }
    }
    const opaque = root.getChildMeshes().filter(mesh => mesh instanceof Mesh && mesh !== seabed && !mesh.isVerticesDataPresent(WINTER_VERTEX) && mesh.material instanceof StandardMaterial && mesh.material.alpha === 1) as Mesh[];
    if (opaque.length) { const batch = mergeSceneryMeshes(opaque); batch.parent = root; batch.name = "batched-coastal-reef"; }
  }

  private build(index: number, pools: readonly TrackItem[]) {
    const world = index * 10,
      section = sectionAt(world + 5, this.plan);
    const root = new TransformNode(`terrain-${index}`, this.scene);
    if (["beach", "water", "shore"].includes(section.biome)) {
      this.coastCell(world, index, root);
      return root;
    }
    if (section.biome === "snow" || section.biome === "snow-transition") {
      this.winterCell(world, index, root, pools);
      return root;
    }
    const gap = gapsNear(world, this.seed, this.plan).find(
      (gap) => gap.start < world + 10 && gap.end > world,
    );
    const spans = roadSpans(world, world + 10, this.seed, this.plan);
    const adjacent = sectionAt(
      world < (section.start + section.end) / 2
        ? section.start - 1
        : section.end + 1,
      this.plan,
    );
    const floor =
      section.biome === "forest"
        ? this.trail
        : section.biome === "canyon"
          ? this.stone
          : adjacent.biome === "forest"
            ? this.tunnelTrail
            : this.tunnelStone;
    // Overlap the tunnel walls even at the widest point of the weathered portal.
    const roadWidth = section.biome === "tunnel" ? 2 * (TUNNEL_HALF_WIDTH + 0.15) :
      section.biome === "canyon" ? 11.4 : 8.6;
    for (const span of spans) {
      this.ground(
        roadWidth,
        span.end - span.start,
        0,
        0.06,
        span.start - world + (span.end - span.start) / 2,
        root,
        floor,
        span.start,
      );
      if (section.biome === "canyon") {
        // A solid, square-ended rock bed meets the road, including at chasm lips.
        const slab = CreateBox("solid-road-foundation", {
          width: roadWidth, height: 5, depth: span.end - span.start,
        }, this.scene);
        slab.parent = root;
        slab.material = this.cliff;
        slab.position.set(0, 0.055 - 2.5,
          span.start - world + (span.end - span.start) / 2);
        slab.receiveShadows = true;
      }
    }
    if (section.biome === "forest") {
      for (const side of [-1, 1])
        this.ground(70, 10, side * 39.3, 0, 5, root, this.grass, world);
    } else if (section.biome === "tunnel") {
      this.arch(world, root);
      if (world === section.start) this.arch(world, root, true);
      if (world + 10 === section.end) this.arch(world, root, true, 8.2);
      for (const side of [-1, 1]) {
        const ledge = this.props.sandstone(
          "cave-footing",
          [0.8, 0.55, 10.2],
          world + side,
          root,
        );
        ledge.position.set(side * 5.2, 0.12, 5);
        ledge.material = this.tunnel;
      }
    } else {
      this.ground(90, 10, 0, -18, 5, root, this.stone, world);
      for (const side of [-1, 1]) {
        this.cliffWall(side, world, root);
        // Solid land behind each wall supports the ridge and distant mesas.
        // Its inner edge stays behind the playable wall, including across chasms.
        const plateau = CreateBox("canyon-outer-rock-mass", {
          width: 38, height: 26.5, depth: 10,
        }, this.scene);
        const plateauPositions = plateau.getVerticesData(VertexBuffer.PositionKind)!;
        const plateauNormals = plateau.getVerticesData(VertexBuffer.NormalKind)!;
        const plateauUvs: number[] = [];
        for (let v = 0; v < plateauPositions.length; v += 3) {
          const [x, y, z] = plateauPositions.slice(v, v + 3);
          plateauUvs.push(
            (Math.abs(plateauNormals[v]) > 0.5 ? z : x) / 5.5,
            (Math.abs(plateauNormals[v + 1]) > 0.5 ? z : y) / 5.5,
          );
        }
        plateau.setVerticesData(VertexBuffer.UVKind, plateauUvs);
        plateau.parent = root;
        plateau.material = this.cliff;
        plateau.position.set(side * 24.7, -4.75, 5);
        plateau.receiveShadows = true;
        const shoulder = this.props.sandstone(
          "eroded-ridge-crown",
          [5.5, 3.2, 10.8],
          world + side,
          root,
        );
        shoulder.position.set(
          side * 9.7,
          9.6 + Math.sin(world * 0.037 + side) * 0.4,
          5,
        );
        if (index % 3 === 0) {
          const mesaHeight = 17 + (index % 5);
          const mesa = this.props.sandstone(
            "distant-layered-mesa",
            [13, mesaHeight, 24],
            world * side,
            root,
          );
          mesa.position.set(side * 24, 8 + mesaHeight / 2, 5);
        }
        if (!gap) {
          for (let n = 0; n < 3; n++) {
            const scree = this.props.sandstone(
              "canyon-verge-scree",
              [0.35 + n * 0.12, 0.2 + n * 0.1, 0.6],
              world + n,
              root,
            );
            scree.position.set(side * (4.7 + n * 0.16), 0.06 + (0.2 + n * 0.1) * 0.35, 1.5 + n * 3.1);
          }
          if (index % 2 === 0) {
            const outcrop = this.props.sandstone("canyon-verge-outcrop",
              [0.8, 0.65, 1.2], world + side, root);
            outcrop.position.set(side * 4.9, 0.15, 6);
          }
        } else {
          for (let level = 0; level < 3; level++) {
            for (let mark = 0; mark < 2; mark++) {
              const x = side * 5.31,
                y = 0.45 + level * 1.5,
                z = 1 + mark * 5;
              this.surface(
                "chalk-climbing-mark",
                [x, y, z, x, y + 0.04, z, x, y, z + 2, x, y + 0.04, z + 2],
                [0, 1, 2, 1, 3, 2],
                [0, 0, 0, 1, 1, 0, 1, 1],
                new Array(16).fill(1),
                root,
                this.guide,
              );
            }
          }
        }
      }
      for (const nearbyGap of gapsNear(world, this.seed, this.plan)) {
        for (const edge of [nearbyGap.start, nearbyGap.end]) {
          if (edge >= world && edge < world + 10) {
            const face = CreateBox("chasm-rock-cross-section", {
              width: roadWidth, height: 18, depth: 1.2,
            }, this.scene);
            face.parent = root;
            face.material = this.cliff;
            face.position.set(0, -9,
              edge - world + (edge === nearbyGap.start ? -0.6 : 0.6));
            face.receiveShadows = true;
            for (let chip = 0; chip < 7; chip++) {
              const fracture = this.props.sandstone(
                "broken-canyon-lip",
                [1.35, 0.65, 0.7],
                world + chip,
                root,
              );
              fracture.position.set(
                (chip - 3) * 1.2,
                -0.28,
                edge - world + (edge === nearbyGap.start ? -0.4 : 0.4),
              );
            }
          }
        }
      }
    }
    if (section.biome === "canyon") {
      const taper = this.canyonProfile(world, world + 5);
      for (const mesh of root.getChildMeshes()) {
        if (mesh.name.includes("road") || mesh.name === "terrain-surface" || mesh.name === "eroded-continuous-cliff") continue;
        mesh.position.y *= taper; mesh.scaling.y *= Math.max(0.03, taper);
      }
    }
    // Rocky shoulders gradually enclose the approach and open beyond the exit.
    if (section.biome !== "tunnel") {
      const toMouth = section.end - world,
        fromMouth = world - section.start;
      const hasEntrance = sectionAt(section.end + 1, this.plan).biome === "tunnel";
      const hasExit =
        section.start > 0 && sectionAt(section.start - 1, this.plan).biome === "tunnel";
      const approach =
        hasEntrance && toMouth <= 30
          ? 1 - toMouth / 40
          : hasExit && fromMouth < 30
            ? 1 - fromMouth / 40
            : 0;
      if (approach > 0) {
        for (const side of [-1, 1]) {
          const ridge = this.props.sandstone(
            "portal-landscape-shoulder",
            [8, 7 + approach * 7, 12],
            world + side,
            root,
          );
          ridge.position.set(side * (13 - approach * 2.2), 2 + approach * 2, 5);
          const talus = this.props.sandstone(
            "portal-talus",
            [2.3, 1.6 + approach * 2, 8],
            world,
            root,
          );
          talus.position.set(side * (6.8 - approach * 0.4), 0.6, 5);
        }
      }
    }
    // Reuse foliage instances and batch the static rock and road meshes per cell.
    const meshes = root
      .getChildMeshes()
      .filter((mesh) => mesh instanceof Mesh) as Mesh[];
    if (meshes.length) {
      const merged = mergeSceneryMeshes(meshes);
      merged.name = `terrain-detail-${index}`;
      merged.parent = root;
    }
    return root;
  }
  update(distance: number, time = 0, seed = 0, plan = defaultTrack, pools: readonly TrackItem[] = [], storm = 0) {
    const changed = this.seed !== seed || this.plan !== plan || plan.revision - this.planRevision > 1;
    // Portal walls reach 30 metres back into the old forest.
    const changedFrom = this.planRevision !== plan.revision ? plan.changedFrom - 30 : Infinity;
    this.plan = plan;
    this.planRevision = plan.revision;
    this.seed = seed;
    this.water.update(distance, time);
    const first = Math.floor((distance - 50) / 10),
      last = Math.ceil((distance + 180) / 10);
    const cuts = (index: number) => pools.filter(pool =>
      pool.worldZ - CONFIG.poolLength / 2 < index * 10 + 10 &&
      pool.worldZ + CONFIG.poolLength / 2 > index * 10);
    const key = (cut: readonly TrackItem[]) => cut.map(pool => `${pool.lane}/${pool.worldZ}`).sort().join(";");
    for (const [index, root] of this.cells)
      if (changed || index * 10 + 10 >= changedFrom || index < first || index > last || this.poolCuts.get(index) !== key(cuts(index))) {
        const batches = new Set(
          root.getChildMeshes().map((mesh) => mesh.material),
        );
        root.dispose();
        for (const material of batches)
          if (material instanceof MultiMaterial)
            material.dispose(false, false, false);
        this.cells.delete(index);
        this.poolCuts.delete(index);
        this.windRibbons.delete(index);
      }
    for (let index = first; index <= last; index++) {
      let root = this.cells.get(index);
      if (!root) {
        const cut = cuts(index);
        root = this.build(index, cut);
        this.cells.set(index, root);
        this.poolCuts.set(index, key(cut));
      }
      root.position.z = index * 10 - distance;
      const wind = this.windRibbons.get(index);
      if (wind) {
        const phase = time * 0.5 + index * 0.618;
        const t = phase - Math.floor(phase);
        wind.position.x = -18 + 36 * t;
        wind.visibility = (0.045 + storm * (0.39 + Math.sin(time * 2.1 + index) * 0.13)) * Math.sin(t * Math.PI) ** 2;
      }
    }
    this.coastSurface?.update(distance);
    for (const [mesh, material] of this.pendingSurfaces) {
      if (mesh.isDisposed()) this.pendingSurfaces.delete(mesh);
      else if (material.isReady(mesh)) {
        mesh.material = material;
        this.pendingSurfaces.delete(mesh);
      }
    }
  }
}
