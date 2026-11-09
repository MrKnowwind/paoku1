import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

export class RegionalEnemyModel {
  root: TransformNode;
  private body: TransformNode;
  private wings: TransformNode[] = [];
  private arms: TransformNode[] = [];
  private legs: TransformNode[] = [];
  private pips: Mesh[] = [];
  private bar: TransformNode;
  constructor(scene: Scene, id: number, readonly kind: "bat" | "yeti",
    material: (color: string, glow?: boolean) => StandardMaterial) {
    this.root = new TransformNode(kind, scene);
    this.body = new TransformNode(`${kind}-body`, scene); this.body.parent = this.root;
    const sphere = (name: string, size: number[], pos: number[], color: string, parent = this.body, glow = false) => {
      const mesh = CreateSphere(name, {diameter: 1, segments: 6}, scene);
      mesh.parent = parent; mesh.scaling.set(size[0], size[1], size[2]); mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.material = material(color, glow); mesh.metadata = {wolfId: id}; return mesh;
    };
    const joint = (name: string, x: number, y: number, z: number) => {
      const node = new TransformNode(name, scene); node.parent = this.body; node.position.set(x, y, z); return node;
    };
    if (kind === "bat") {
      sphere("bat-fur", [0.55, 0.72, 0.45], [0, 0, 0], "#534b78");
      sphere("bat-face", [0.47, 0.36, 0.34], [0, 0.25, -0.17], "#887ba2");
      for (const side of [-1, 1]) {
        const ear = CreateCylinder("bat-ear", {height: 0.46, diameterBottom: 0.23, diameterTop: 0, tessellation: 3}, scene);
        ear.parent = this.body; ear.position.set(side * 0.2, 0.59, -0.08); ear.material = material("#a180ad"); ear.metadata = {wolfId: id};
        sphere("bat-eye", [0.1, 0.09, 0.07], [side * 0.14, 0.3, -0.33], "#ffb05f", this.body, true);
        sphere("bat-claw", [0.09, 0.23, 0.12], [side * 0.14, -0.42, -0.06], "#f5d5aa");
        const wing = joint("bat-wing-joint", side * 0.21, 0.08, 0);
        const mesh = new Mesh("bat-scalloped-wing", scene);
        const data = new VertexData();
        const vertices = [0,0,0, side*0.52,0.44,0, side*1.46,0.08,0,
          side*1.1,-0.14,0, side*0.96,-0.46,0, side*0.65,-0.23,0, side*0.4,-0.5,0, side*0.2,-0.18,0];
        const faces = [0,1,2,0,2,3,0,3,4,0,4,5,0,5,6,0,6,7];
        const normals: number[] = []; VertexData.ComputeNormals(vertices, faces, normals);
        data.positions = vertices; data.indices = faces; data.normals = normals; data.applyToMesh(mesh);
        mesh.parent = wing; mesh.material = material("#84618c"); mesh.material.backFaceCulling = false; mesh.metadata = {wolfId: id};
        sphere("bat-wing-bone", [1.25,0.055,0.06], [side*0.59,0.15,-0.025], "#b696ad", wing).rotation.z = side * 0.18;
        this.wings.push(wing);
      }
    } else {
      sphere("yeti-fur-torso", [1.32,1.65,0.87], [0,1.3,0], "#d9edf1");
      sphere("yeti-chest", [0.9,1.15,0.22], [0,1.38,-0.43], "#afcfdc");
      sphere("yeti-head", [0.88,0.85,0.75], [0,2.16,-0.07], "#eaf5ef");
      sphere("yeti-face", [0.57,0.45,0.27], [0,2.13,-0.43], "#6d9cba");
      sphere("yeti-mouth", [0.3,0.08,0.07], [0,1.99,-0.57], "#3b506e");
      for (const side of [-1, 1]) {
        sphere("yeti-eye", [0.1,0.09,0.06], [side*0.17,2.2,-0.57], "#ffcf78", this.body, true);
        const arm = joint("yeti-arm", side*0.69,1.83,0);
        sphere("yeti-upper-arm", [0.42,0.77,0.48], [0,-0.3,0], "#d9edf1", arm);
        sphere("yeti-hand", [0.48,0.46,0.48], [0,-0.82,-0.06], "#91bacb", arm);
        this.arms.push(arm);
        const leg = joint("yeti-leg", side*0.36,0.65,0);
        sphere("yeti-shin", [0.44,0.67,0.44], [0,-0.12,0], "#c8e0e8", leg);
        sphere("yeti-foot", [0.5,0.23,0.63], [0,-0.46,-0.12], "#86afc2", leg); this.legs.push(leg);
        for (let i=0;i<3;i++) {
          const tuft = CreateCylinder("yeti-frost-tuft", {height: 0.29, diameterBottom: 0.2, diameterTop: 0, tessellation: 4}, scene);
          tuft.parent = this.body; tuft.position.set(side*(0.49+i*0.08),1.82-i*0.2,0.07);
          tuft.rotation.z = -side*1.7; tuft.material = material("#f0faf7"); tuft.metadata = {wolfId:id};
        }
      }
    }
    this.bar = new TransformNode(`${kind}-health`, scene); this.bar.parent = this.root;
    this.bar.position.y = kind === "bat" ? 1 : 2.95; this.bar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    const plane = (width: number, height: number, x: number, z: number, color: string) => {
      const mesh = CreatePlane("enemy-health", {width,height,sideOrientation: Mesh.DOUBLESIDE}, scene);
      mesh.parent = this.bar; mesh.position.set(x,0,z); mesh.isPickable = false; mesh.material = material(color,true); return mesh;
    };
    plane(1.15,0.2,0,0.01,"#1c293e"); const count = kind === "bat" ? 1 : 5;
    for(let i=0;i<count;i++) this.pips.push(plane(1.08/count-0.025,0.12,(i+0.5)*1.08/count-0.54,0,"#ff6774"));
  }
  animate(time: number, health: number, crouch: number, throwing: number, fallen: number, flinch: number) {
    this.bar.setEnabled(health>0); this.pips.forEach((p,i)=>p.setEnabled(i<health));
    this.body.rotation.z = fallen*1.5 + flinch*0.12;
    this.body.position.y = -fallen*0.5;
    this.root.scaling.setAll(1-fallen*0.35);
    this.wings.forEach((w,i)=>w.rotation.z = (i===0 ? -1 : 1)*(Math.sin(time*12)*0.5+crouch*0.2));
    this.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(time*9+i*Math.PI)*0.45*(1-throwing));
    this.arms.forEach((arm,i)=>{
      arm.rotation.x = Math.sin(time*9+i*Math.PI)*0.28*(1-throwing) + throwing*2.6 + crouch*0.3;
      arm.rotation.z=(i===0 ? 1 : -1)*throwing*0.24;
    });
  }
}
