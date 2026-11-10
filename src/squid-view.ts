import "@babylonjs/core/Rendering/edgesRenderer.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { RunnerGame } from "./game.ts";
import { CONFIG } from "./config.ts";

type Material = (color: string, glow?: boolean) => StandardMaterial;
class SquidModel {
  root: TransformNode;
  private arms: {mesh: Mesh; path: Vector3[]}[] = [];
  private fins: Mesh[] = [];
  private pips: Mesh[] = [];
  private shownHealth = -1;
  private lastTime = -Infinity;
  constructor(scene: Scene, material: Material, high: boolean) {
    this.root = new TransformNode("squid", scene);
    const part = (name: string, size: number[], pos: number[], color: string) => {
      const m = CreateSphere(name, {diameter: 1, segments: 12}, scene);
      m.parent = this.root; m.scaling.set(size[0], size[1], size[2]);
      m.position.set(pos[0], pos[1], pos[2]); m.material = material(color); return m;
    };
    part("squid-mantle", [1.05, 1.65, 0.9], [0, 0.4, 0], "#9862b0");
    const tip = CreateCylinder("squid-mantle-tip", {height: 0.65, diameterBottom: 0.75, diameterTop: 0, tessellation: 12}, scene);
    tip.parent = this.root; tip.position.y = 1.22; tip.material = material("#9862b0");
    part("squid-head", [0.94, 0.55, 0.92], [0, -0.5, 0.02], "#bd86c8");
    part("squid-siphon", [0.24, 0.25, 0.4], [0, -0.62, 0.47], "#553d77");
    for (const side of [-1, 1]) {
      const fin = part("squid-fin", [0.83, 0.85, 0.15], [side * 0.6, 0.62, -0.08], "#c184cc");
      fin.rotation.z = -side * 0.4; this.fins.push(fin);
      part("squid-eye-white", [0.32, 0.34, 0.2], [side * 0.37, -0.39, 0.38], "#fff1da");
      part("squid-eye", [0.17, 0.23, 0.12], [side * 0.37, -0.4, 0.49], "#24253e");
      part("squid-glint", [0.06, 0.08, 0.04], [side * 0.34, -0.34, 0.55], "#ffffff");
    }
    for (let i = 0; i < 10; i++) {
      const path = Array.from({length: high ? 9 : 6}, (_, j) => new Vector3(0.1, -0.6 - j * 0.13, 0.01));
      const mesh = CreateTube("squid-arm", {path, radius: i < 8 ? 0.075 : 0.09, tessellation: 5, updatable: true}, scene);
      mesh.parent = this.root; mesh.material = material(i < 8 ? "#b17abb" : "#e0a3d1");
      this.arms.push({mesh, path});
    }
    for (let i = 0; i < 4; i++) {
      const pip = CreateSphere("squid-health", {diameter: 0.14, segments: 6}, scene);
      pip.parent = this.root; pip.position.set((i - 1.5) * 0.21, 1.8, 0);
      pip.material = material("#ff9aaf", true); pip.isPickable = false; this.pips.push(pip);
    }
  }
  animate(time: number, id: number, health: number, attack: number, hold: number, hit: number) {
    if (this.shownHealth !== health) { this.shownHealth = health; this.pips.forEach((p, i) => p.setEnabled(i < health)); }
    if (time >= this.lastTime && time - this.lastTime < 1 / 30) return;
    this.lastTime = time;
    const fallen = health <= 0 ? Math.min(1, hit / 0.45) : 0;
    this.root.rotation.z = Math.sin(time * 1.3 + id) * 0.08 + fallen * 1.5;
    this.root.scaling.setAll(1 - fallen * 0.4);
    this.fins.forEach((f, i) => f.rotation.y = Math.sin(time * 3 + i) * 0.3);
    for (let i = 0; i < this.arms.length; i++) {
      const {path, mesh} = this.arms[i], angle = i / 10 * Math.PI * 2;
      for (let j = 0; j < path.length; j++) {
        const t = j / (path.length - 1), length = i >= 8 ? 2.5 : 1.3;
        const curl = time * 3 + i + t * 4;
        path[j].set(Math.cos(angle) * (0.27 + t * 0.4) + Math.sin(curl) * 0.15 * t,
          -0.64 - t * length * (1 - hold * 0.8) + Math.sin(t * 6 + time * 2) * t * hold * 0.23,
          Math.sin(angle) * 0.24 + t * (attack * 2.3 + hold * 1.7) + Math.cos(curl) * 0.12 * t);
      }
      CreateTube("squid-arm", {path, instance: mesh});
    }
  }
  bind(id: number) { for (const m of this.root.getChildMeshes()) if (!this.pips.includes(m as Mesh)) m.metadata = {wolfId: id}; }
}

export class SquidView {
  private high = true;
  private models = new Map<number, SquidModel>();
  private pool: SquidModel[] = [];
  private effects: {box: Mesh; line: Mesh; ball: Mesh}[] = [];
  constructor(private scene: Scene, private material: Material) {}
  get size() { return this.models.size; }
  update(game: RunnerGame, high: boolean) {
    if (this.high !== high) {
      for (const m of [...this.models.values(), ...this.pool]) m.root.dispose();
      this.models.clear(); this.pool = []; this.high = high;
    }
    const ocean = game.nightCombat.ocean, s = ocean.state, time = game.worldTime;
    for (const [id, model] of this.models) if (!s.enemies.some(e => e.id === id)) {
      model.root.setEnabled(false); this.pool.push(model); this.models.delete(id);
    }
    for (const e of s.enemies) {
      let m = this.models.get(e.id);
      if (!m) { m = this.pool.pop() ?? new SquidModel(this.scene, this.material, high); m.bind(e.id); this.models.set(e.id, m); }
      const p = ocean.position(e, game), a = s.attacks.find(a => a.enemy === e.id);
      const attack = a ? Math.max(0, Math.min(1, (time - a.start) / (a.impactAt - a.start))) : 0;
      m.root.setEnabled(true); m.root.position.set(p.x, p.y, p.z); m.root.rotation.y = p.yaw;
      m.animate(p.animationTime, e.id, game.nightCombat.health(e), attack, p.bite, time - e.hitAt);
    }
    for (let i = 0; i < Math.max(this.effects.length, s.attacks.length); i++) {
      let fx = this.effects[i];
      if (!fx) {
        const box = CreateBox("squid-grab-warning", {width: CONFIG.squid.halfWidth * 2,
          height: CONFIG.squid.halfHeight * 2, depth: CONFIG.squid.halfDepth * 2}, this.scene);
        const fill = this.material("#ff3156", true).clone("squid-warning-fill")!;
        fill.alpha = 0.16; fill.backFaceCulling = false; box.material = fill;
        box.enableEdgesRendering(); box.edgesWidth = 2.5; box.edgesColor = new Color4(1, 0.12, 0.26, 1);
        const line = CreateCylinder("squid-ink-red-line", {diameter: 0.045, height: 1, tessellation: 5}, this.scene);
        line.material = this.material("#ff3156", true);
        const ball = CreateSphere("squid-ink-projectile", {diameter: 0.65, segments: 10}, this.scene);
        ball.material = this.material("#2b163e");
        for (const m of [box, line, ball]) m.isPickable = false;
        fx = {box, line, ball}; this.effects.push(fx);
      }
      const a = s.attacks[i], show = !!a && !a.spent && game.mode !== "over";
      fx.box.setEnabled(show && a.kind === "grab");
      fx.line.setEnabled(show && a.kind === "ink" && time < a.releaseAt);
      fx.ball.setEnabled(show && a.kind === "ink" && time >= a.releaseAt);
      if (!show) continue;
      fx.box.position.set(a.x, a.y, a.worldZ - game.distance);
      fx.box.visibility = 0.65 + Math.sin(time * 12) * 0.3;
      const enemy = s.enemies.find(e => e.id === a.enemy);
      const mouth = enemy ? ocean.position(enemy, game) : undefined;
      const from = !a.launched && mouth ? new Vector3(mouth.x, mouth.y - 0.6, mouth.z) : new Vector3(a.fromX, a.fromY, a.fromZ - game.distance);
      const to = new Vector3(a.x, a.y, a.worldZ - game.distance), delta = to.subtract(from);
      fx.line.position.copyFrom(from.add(to).scale(0.5)); fx.line.scaling.y = delta.length();
      fx.line.rotation.set(Math.acos(delta.y / Math.max(0.001, delta.length())), Math.atan2(delta.x, delta.z), 0);
      fx.line.visibility = 0.35 + (Math.sin(time * 22) + 1) * 0.32;
      Vector3.LerpToRef(from, to, Math.max(0, Math.min(1, (time - a.releaseAt) / CONFIG.squid.inkFlight)), fx.ball.position);
    }
  }
}
