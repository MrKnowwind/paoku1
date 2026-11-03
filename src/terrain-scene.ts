import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
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
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { gapsNear, roadSpans, sectionAt } from "./track.ts";
import { mergeSceneryMeshes } from "./scenery-mesh";
import type { ForestProps } from "./props.ts";

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export class TerrainScene {
  private cells = new Map<number, TransformNode>();
  private sand: StandardMaterial;
  private water: StandardMaterial;
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
      }
      return mat;
    };
    this.ocean = new OceanProps(scene);
    this.sand = this.ocean.material("sand", "#e0d3ac");
    this.water = this.ocean.material("water", "#56bdcf");
    this.water.alpha = 0.3;
    this.water.backFaceCulling = false;
    this.water.emissiveColor.set(0.08, 0.23, 0.26);

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
    material: StandardMaterial,
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
    material: StandardMaterial,
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
      for (let row = 0; row <= rows; row++) {
        const coast = sectionAt(world + 0.1);
        const taper = coast.biome === "canyon" ? smooth((coast.end - absolute) / 80) : 1;
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
    const section = sectionAt(world + 0.1);
    const positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [],
      colors: number[] = [];
    const profile: [number, number][] = [[-5.65, -1.2]];
    for (let i = 0; i <= 24; i++) {
      const angle = (i / 24) * Math.PI;
      profile.push([-Math.cos(angle) * 5.65, 3.1 + Math.sin(angle) * 4.7]);
    }
    profile.push([5.65, -1.2]);
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

  private coastFloor(d: number) {
    const section = sectionAt(d);
    if (section.biome === "beach") return 0.06 - 7.06 * smooth((d - section.end + 24) / 24);
    if (section.biome === "shore") return -7 + 7.06 * smooth((d - section.start) / 60);
    return section.biome === "water" ? -7 : 0.06;
  }

  private coastCell(world: number, index: number, root: TransformNode) {
    const section = sectionAt(world + 5);
    const underwater = section.biome === "water";
    const positions: number[] = [], indices: number[] = [], uvs: number[] = [], colors: number[] = [];
    const columns = 40, rows = 5;
    for (let row = 0; row <= rows; row++) {
      const z = row * 2, d = world + z;
      const floor = this.coastFloor(d);
      const shore = sectionAt(d);
      const edgeBlend = shore.biome === "beach" ? smooth((d - shore.start) / 24)
        : shore.biome === "shore" ? 1 - smooth((d - shore.start - 50) / 30) : underwater ? 1 : 0;
      for (let col = 0; col <= columns; col++) {
        const x = (col - columns / 2) * 4;
        const verge = smooth((Math.abs(x) - 4) / 7);
        const relief = underwater
          ? (Math.sin(x * 0.27 + d * 0.07) * 0.65 + Math.cos(x * 0.5 - d * 0.04) * 0.3) * verge
          : (Math.exp(-Math.pow((Math.abs(x) - 11) / 5, 2)) * 1.2 - smooth((Math.abs(x) - 18) / 18) * 5) * edgeBlend;
        positions.push(x, floor + relief, z); uvs.push(x / 6, d / 6);
        const shade = 0.87 + Math.sin(x * 0.4 + d * 0.16) * 0.06;
        const start = shore.biome === "beach" ? 1 - smooth((d - shore.start) / 24) : 0;
        const end = shore.biome === "shore" ? smooth((d - shore.end + 20) / 20) : 0;
        colors.push(shade * (1 - end * 0.12), shade * (1 - start * 0.11), shade * (1 - start * 0.2 - end * 0.12), 1);
        if (row < rows && col < columns) {
          const a = row * (columns + 1) + col;
          indices.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2);
        }
      }
    }
    this.surface("rippled-coastal-contours", positions, indices, uvs, colors, root, this.sand);
    // The water never covers the dry centre of the approach beach.
    if (this.coastFloor(world + 5) < -0.2)
      this.ground(180, 10, 0, -0.15, 5, root, this.water, world);
    else for (const side of [-1, 1])
      this.ground(65, 10, side * 55, -0.15, 5, root, this.water, world);
    for (const side of [-1, 1]) {
      for (let cluster = 0; cluster < 2; cluster++) {
        const x = side * (7 + cluster * 7 + Math.sin(world * 0.13 + side) * 0.8);
        const z = 2 + cluster * 5;
        const y = this.coastFloor(world + z);
        const rock = this.props.sandstone("coastal-reef-outcrop", [2.8 + cluster, 1.4 + cluster, 3.6], world + side + cluster, root);
        rock.position.set(x, y + 0.35, z);
        rock.material = this.ocean.material("basalt", underwater ? "#6b8990" : "#b4aa91");
        if (underwater) {
          const coral = this.ocean.coral(root, index + cluster, 1.5 + cluster * 0.8,
            ["#c78198", "#cdac71", "#819dca"][Math.abs(index + cluster) % 3]);
          coral.position.set(x - side * 0.7, y + 1.4, z); coral.scaling.setAll(1.25);
          const kelp = this.ocean.kelp(root, 2.5 + cluster * 1.8, index + cluster);
          kelp.position.set(x + side * 1.7, y, z + 1.5);
          const fan = this.ocean.coral(root, 2, 2.5, "#bb899c");
          fan.position.set(x + side * 3.6, y + 1.6, z + 2); fan.scaling.set(1.7, 1, 0.35);
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
          return new Vector3(side * 19 + Math.cos(a) * 6, -7 + Math.sin(a) * 6.5, 5 + Math.sin(a * 2) * 0.6);
        });
        const arch = CreateTube("ancient-eroded-reef-arch", {path: archPath, radius: 1.3, tessellation: 10, cap: 3}, this.scene);
        arch.parent = root; arch.material = this.ocean.material("basalt", "#66838b");
        for (let tower = 0; tower < 3; tower++) {
          const mesa = this.props.sandstone("distant-ocean-pinnacle", [7, 10 + tower * 3, 12], world + tower, root);
          mesa.position.set(side * (35 + tower * 9), -9, 5); mesa.material = arch.material;
        }
        for (let fish = 0; fish < 8; fish++) {
          const model = this.ocean.fish(root, "#7daeb9");
          model.position.set(side * (11 + fish * 0.7), -2 - (fish % 3) * 0.4, fish * 0.7);
          model.scaling.setAll(0.65);
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
          const shaft = CreateCylinder("slanted-underwater-sunbeam", {height: 6.5, diameterTop: 0.6, diameterBottom: 2.4, tessellation: 12}, this.scene);
          shaft.parent = root; shaft.material = light;
          shaft.position.set(side * 9.5, -3.4, 4); shaft.rotation.z = side * 0.23;
        }
      }
      for (let i = 0; i < 3; i++) {
        const bubble = CreateSphere("tiny-decorative-bubble", {diameter: 0.06, segments: 6}, this.scene);
        bubble.parent = root; bubble.material = this.water; bubble.position.set(-5 + i * 5, -5 + i * 2, 5);
        for (const side of [-1, 1])
          this.ground(0.025, 7, side * 3.8, CONFIG.waterHeights[i] - 0.1, 5, root, this.guide, world);
      }
    }
    const opaque = root.getChildMeshes().filter(mesh => mesh instanceof Mesh && mesh.material?.alpha === 1) as Mesh[];
    if (opaque.length) { const batch = mergeSceneryMeshes(opaque); batch.parent = root; batch.name = "batched-coastal-reef"; }
  }

  private build(index: number) {
    const world = index * 10,
      section = sectionAt(world + 5);
    const root = new TransformNode(`terrain-${index}`, this.scene);
    if (["beach", "water", "shore"].includes(section.biome)) {
      this.coastCell(world, index, root);
      return root;
    }
    if (section.biome === "canyon" && world >= section.end - 60 ||
        section.biome === "forest" && section.start > 0 && world < section.start + 30) {
      const widthAt = (d: number) => section.biome === "canyon"
        ? smooth((d - section.end + 60) / 60) * 5.7
        : (1 - smooth((d - section.start) / 30)) * 4.3;
      const a = widthAt(world), b = widthAt(world + 10);
      this.surface("sand-feathered-into-trail", [-a, 0.075, 0, a, 0.075, 0, -b, 0.075, 10, b, 0.075, 10],
        [0, 2, 1, 1, 2, 3], [-a / 6, world / 6, a / 6, world / 6, -b / 6, (world + 10) / 6, b / 6, (world + 10) / 6],
        new Array(16).fill(1), root, this.sand);
    }
    const gap = gapsNear(world).find(
      (gap) => gap.start < world + 10 && gap.end > world,
    );
    const spans = roadSpans(world, world + 10);
    const adjacent = sectionAt(
      world < (section.start + section.end) / 2
        ? section.start - 1
        : section.end + 1,
    );
    const floor =
      section.biome === "forest"
        ? this.trail
        : section.biome === "canyon"
          ? this.stone
          : adjacent.biome === "forest"
            ? this.tunnelTrail
            : this.tunnelStone;
    // Extend the canyon floor into the wall so the verge has no exposed slit.
    const roadWidth = section.biome === "canyon" ? 11.4 : 8.6;
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
      for (const nearbyGap of gapsNear(world)) {
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
      const taper = smooth((section.end - world) / 80);
      for (const mesh of root.getChildMeshes()) {
        if (mesh.name.includes("road") || mesh.name === "terrain-surface" || mesh.name === "eroded-continuous-cliff") continue;
        mesh.position.y *= taper; mesh.scaling.y *= Math.max(0.03, taper);
      }
    }
    // Rocky shoulders gradually enclose the approach and open beyond the exit.
    if (section.biome !== "tunnel") {
      const toMouth = section.end - world,
        fromMouth = world - section.start;
      const hasEntrance = sectionAt(section.end + 1).biome === "tunnel";
      const hasExit =
        section.start > 0 && sectionAt(section.start - 1).biome === "tunnel";
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
  update(distance: number, time = 0) {
    if (this.water.diffuseTexture instanceof Texture) {
      this.water.diffuseTexture.uOffset = (time * 0.012) % 1;
      this.water.diffuseTexture.vOffset = (time * 0.007) % 1;
    }
    const first = Math.floor((distance - 50) / 10),
      last = Math.ceil((distance + 180) / 10);
    for (const [index, root] of this.cells)
      if (index < first || index > last) {
        const batches = new Set(
          root.getChildMeshes().map((mesh) => mesh.material),
        );
        root.dispose();
        for (const material of batches)
          if (material instanceof MultiMaterial)
            material.dispose(false, false, false);
        this.cells.delete(index);
      }
    for (let index = first; index <= last; index++) {
      let root = this.cells.get(index);
      if (!root) {
        root = this.build(index);
        this.cells.set(index, root);
      }
      root.position.z = index * 10 - distance;
    }
  }
}
