import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

type Limb = {upper: TransformNode; lower: TransformNode; tip: TransformNode; side: number};

export class RegionalEnemyModel {
  root: TransformNode;
  private body: TransformNode;
  private head: TransformNode;
  private wings: TransformNode[] = [];
  private wingTips: TransformNode[] = [];
  private arms: Limb[] = [];
  private legs: Limb[] = [];
  private pips: Mesh[] = [];
  private bar: TransformNode;

  constructor(scene: Scene, id: number, readonly kind: "bat" | "yeti",
    material: (color: string, glow?: boolean) => StandardMaterial, high = true) {
    this.root = new TransformNode(kind, scene);
    const joint = (name: string, pos: number[], parent = this.root) => {
      const node = new TransformNode(name, scene); node.parent = parent;
      node.position.set(pos[0], pos[1], pos[2]); return node;
    };
    this.body = joint(`${kind}-body`, [0, 0, 0]);
    this.head = joint(`${kind}-head-joint`, [0, kind === "bat" ? 0.23 : 2.16, -0.07], this.body);
    const shape = (name: string, size: number[], pos: number[], color: string, parent = this.body, glow = false) => {
      const mesh = CreateSphere(name, {diameter: 1, segments: high ? 12 : 8}, scene);
      mesh.parent = parent; mesh.scaling.set(size[0], size[1], size[2]); mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.material = material(color, glow); mesh.metadata = {wolfId: id}; return mesh;
    };
    const taper = (name: string, length: number, width: number, pos: number[], color: string, parent: TransformNode) => {
      const mesh = CreateCylinder(name, {height: length, diameterBottom: width, diameterTop: width * 0.08, tessellation: high ? 10 : 6}, scene);
      mesh.parent = parent; mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.material = material(color); mesh.metadata = {wolfId: id}; return mesh;
    };
    const line = (name: string, path: Vector3[], radius: number, color: string, parent: TransformNode) => {
      const mesh = CreateTube(name, {path, radius, tessellation: 6, cap: 3}, scene);
      mesh.parent = parent; mesh.material = material(color); mesh.metadata = {wolfId: id}; return mesh;
    };
    if (kind === "bat") {
      shape("bat-shoulders", [0.65, 0.43, 0.42], [0, 0.1, 0], "#544466");
      shape("bat-fur-body", [0.47, 0.7, 0.43], [0, -0.08, 0], "#645078");
      shape("bat-chest-fur", [0.33, 0.5, 0.12], [0, -0.05, -0.22], "#b7a2ba");
      shape("bat-cheeks", [0.49, 0.36, 0.35], [0, 0, -0.08], "#8d769d", this.head);
      shape("bat-muzzle", [0.2, 0.15, 0.15], [0, -0.08, -0.27], "#c2a9b9", this.head);
      shape("bat-nose", [0.1, 0.07, 0.07], [0, -0.025, -0.36], "#3c304e", this.head);
      for (const side of [-1, 1]) {
        const ear = shape("bat-ear-shell", [0.25, 0.54, 0.12], [side * 0.21, 0.32, -0.03], "#5f4b73", this.head);
        ear.rotation.z = -side * 0.24;
        shape("bat-ear-inner", [0.14, 0.39, 0.04], [side * 0.22, 0.33, -0.095], "#c08aab", this.head).rotation.z = ear.rotation.z;
        shape("bat-eye-rim", [0.15, 0.12, 0.06], [side * 0.14, 0.035, -0.237], "#302a43", this.head);
        shape("bat-eye", [0.09, 0.085, 0.045], [side * 0.14, 0.04, -0.27], "#ffc378", this.head, true);
        shape("bat-eye-glint", [0.028, 0.029, 0.016], [side * 0.14 - 0.018, 0.06, -0.296], "#fff7db", this.head, true);
        taper("bat-fang", 0.11, 0.045, [side * 0.065, -0.17, -0.29], "#f6e3c3", this.head).rotation.x = Math.PI;
        for (let toe = 0; toe < 2; toe++) {
          const x = side * (0.1 + toe * 0.07);
          line("bat-curled-claw", [new Vector3(x,-0.37,0),new Vector3(x,-0.48,-0.025),new Vector3(x,-0.49,-0.09)], 0.018, "#edd8ba", this.body);
        }
        const wing = joint("bat-shoulder-wing", [side * 0.23, 0.08, 0], this.body);
        const tip = joint("bat-wing-wrist", [side * 0.45, 0.12, 0], wing);
        const outline = [[0,0,0],[0.34,0.24,0.02],[1.12,0.18,0.04],[1.34,-0.02,0],
          [1.01,-0.17,-0.01],[0.93,-0.46,0],[0.65,-0.27,-0.015],[0.44,-0.55,0.015],[0.21,-0.28,0],[0,-0.32,0]];
        const vertices: number[] = [], indices: number[] = [], colors: number[] = [];
        const rings = high ? 5 : 3;
        for (let row = 0; row <= rings; row++) for (const [x,y,z] of outline) {
          const t = row / rings;
          vertices.push(side*x*t,y*t,z*t-Math.sin(t*Math.PI)*0.09);
          colors.push(0.65+t*0.35,0.65+t*0.2,0.75+t*0.25,1);
        }
        for (let row=0;row<rings;row++) for(let col=0;col<outline.length-1;col++) {
          const a=row*outline.length+col,b=a+outline.length; indices.push(a,b,a+1,a+1,b,b+1);
        }
        const membrane=new Mesh("bat-curved-wing-membrane",scene),data=new VertexData(),normals:number[]=[];
        VertexData.ComputeNormals(vertices,indices,normals);
        data.positions=vertices;data.indices=indices;data.normals=normals;data.colors=colors;data.applyToMesh(membrane);
        membrane.parent=tip;membrane.material=material("#ae779d");membrane.material.backFaceCulling=false;membrane.metadata={wolfId:id};
        line("bat-wing-leading-edge",outline.slice(0,4).map(([x,y,z])=>new Vector3(side*x,y,z-0.015)),0.027,"#b8a5c3",tip);
        for(const index of [3,5,7,9]) {
          const [x,y,z]=outline[index];
          line("bat-wing-finger",[new Vector3(0,0,-0.02),new Vector3(side*x*0.55,y*0.6,-0.1),new Vector3(side*x,y,z-0.02)],0.015,"#d0abc0",tip);
        }
        shape("bat-wing-upper-arm",[0.55,0.11,0.12],[side*0.21,0.07,0],"#67516f",wing).rotation.z=side*0.18;
        this.wings.push(wing);this.wingTips.push(tip);
      }
    } else {
      const fur="#d5e9ed",shadow="#a4c4d3",bright="#eff8f4";
      shape("yeti-tapered-waist",[0.98,1.06,0.75],[0,0.98,0.06],shadow);
      shape("yeti-ribcage",[1.28,1.34,0.83],[0,1.42,0.02],fur);
      shape("yeti-shoulder-mantle",[1.66,0.62,0.83],[0,1.82,0.04],bright);
      shape("yeti-chest",[0.88,1.06,0.19],[0,1.43,-0.43],"#b9d7df");
      shape("yeti-skull",[0.87,0.83,0.73],[0,0.02,0],bright,this.head);
      shape("yeti-face",[0.59,0.47,0.23],[0,-0.02,-0.36],"#83a9bd",this.head);
      shape("yeti-muzzle",[0.4,0.23,0.18],[0,-0.19,-0.41],"#b3cbd4",this.head);
      shape("yeti-nose",[0.17,0.1,0.08],[0,-0.09,-0.53],"#4b6c85",this.head);
      shape("yeti-mouth",[0.29,0.065,0.04],[0,-0.25,-0.5],"#374f6c",this.head);
      for(const side of [-1,1]) {
        shape("yeti-ear",[0.23,0.32,0.2],[side*0.43,-0.02,0],shadow,this.head);
        shape("yeti-eye-socket",[0.23,0.17,0.08],[side*0.18,0.065,-0.45],"#45677e",this.head);
        shape("yeti-eye",[0.105,0.09,0.03],[side*0.18,0.065,-0.5],"#fbcf8f",this.head,true);
        shape("yeti-brow",[0.34,0.12,0.19],[side*0.18,0.18,-0.4],bright,this.head).rotation.z=side*0.16;
        const arm=joint("yeti-shoulder",[side*0.72,1.82,0.02],this.body);
        shape("yeti-deltoid",[0.5,0.53,0.52],[0,-0.17,0],fur,arm);
        const elbow=joint("yeti-elbow",[0,-0.48,0],arm);
        shape("yeti-forearm",[0.36,0.58,0.4],[0,-0.22,0],shadow,elbow);
        const palm=joint("yeti-wrist",[0,-0.5,-0.02],elbow);
        shape("yeti-palm",[0.4,0.29,0.33],[0,-0.03,-0.03],"#82a8bb",palm);
        for(let finger=0;finger<3;finger++) {
          const x=(finger-1)*0.12;
          shape("yeti-finger",[0.105,0.21,0.13],[x,-0.2,-0.06],"#a4c3ce",palm);
          shape("yeti-nail",[0.068,0.065,0.06],[x,-0.28,-0.105],"#e4f2ef",palm);
        }
        shape("yeti-thumb",[0.13,0.23,0.16],[-side*0.23,-0.06,-0.08],shadow,palm).rotation.z=-side*0.4;
        this.arms.push({upper:arm,lower:elbow,tip:palm,side});
        const hip=joint("yeti-hip",[side*0.35,0.73,0.02],this.body);
        shape("yeti-thigh",[0.47,0.57,0.51],[0,-0.12,0],fur,hip);
        const knee=joint("yeti-knee",[0,-0.3,0],hip);
        shape("yeti-calf",[0.36,0.4,0.37],[0,-0.13,0.02],shadow,knee);
        const foot=joint("yeti-ankle",[0,-0.29,-0.04],knee);
        shape("yeti-foot",[0.49,0.21,0.58],[0,-0.02,-0.13],"#7da5b9",foot);
        for(let toe=0;toe<3;toe++)shape("yeti-toe",[0.13,0.14,0.19],[(toe-1)*0.14,-0.04,-0.36],"#cce3e6",foot);
        this.legs.push({upper:hip,lower:knee,tip:foot,side});
        for(let i=0;i<(high?7:4);i++) {
          const tuft=taper("yeti-layered-fur",0.3,0.19,[side*(0.58+i%2*0.055),1.87-i*0.12,-0.25],i%2?fur:bright,this.body);
          tuft.rotation.z=side*(2.5-i*0.03);
        }
        for(let i=0;i<3;i++)taper("yeti-ice-crystal",0.18+i*0.04,0.085,[side*(0.22+i*0.075),0.34-i*0.08,-0.2],"#b4e6f0",this.head).rotation.z=-side*0.3;
      }
    }
    this.bar=joint(`${kind}-health`,[0,kind==="bat"?1.02:2.88,0]);this.bar.billboardMode=Mesh.BILLBOARDMODE_ALL;
    const bar=(width:number,height:number,x:number,z:number,color:string)=>{
      const mesh=CreatePlane("enemy-health",{width,height,sideOrientation:Mesh.DOUBLESIDE},scene);
      mesh.parent=this.bar;mesh.position.set(x,0,z);mesh.isPickable=false;mesh.material=material(color,true);return mesh;
    };
    bar(1.14,0.18,0,0.015,"#a8b8c5");bar(1.08,0.13,0,0.006,"#243248");
    const count=kind==="bat"?1:5;
    for(let i=0;i<count;i++)this.pips.push(bar(1.02/count-0.025,0.085,(i+0.5)*1.02/count-0.51,0,"#ff7781"));
  }

  animate(time:number,health:number,crouch:number,throwing:number,fallen:number,flinch:number,entry=1) {
    this.bar.setEnabled(health>0&&entry>0.8);this.pips.forEach((p,i)=>p.setEnabled(i<health));
    this.body.rotation.set(crouch*0.12-throwing*0.06,Math.sin(time*1.3)*0.025,fallen*1.5+flinch*0.14);
    this.body.position.y=-fallen*0.5+(this.kind==="yeti"?Math.cos(time*18)*0.025*(1-throwing)-crouch*0.08:0);
    this.head.rotation.x=-crouch*0.12+throwing*0.1;this.root.scaling.setAll(1-fallen*0.35);
    this.wings.forEach((w,i)=>{
      const side=i===0?-1:1,flap=time*(entry<1?9:11);
      w.rotation.z=side*(Math.sin(flap)*0.48+crouch*0.12);
      w.rotation.y=side*(0.08+Math.cos(flap)*0.14+crouch*0.2);
      this.wingTips[i].rotation.z=side*Math.sin(flap-0.55)*0.24;
    });
    for(const leg of this.legs) {
      const swing=Math.sin(time*9+(leg.side>0?Math.PI:0));
      leg.upper.rotation.x=swing*0.45*(1-throwing)-crouch*0.15;
      leg.lower.rotation.x=-Math.max(0,-swing)*0.5*(1-throwing);leg.tip.rotation.x=Math.max(0,swing)*0.16;
    }
    for(const arm of this.arms) {
      const swing=Math.sin(time*9+(arm.side>0?0:Math.PI));
      arm.upper.rotation.x=swing*0.32*(1-throwing)+throwing*2.15+crouch*0.12;
      arm.upper.rotation.z=-arm.side*(0.08+throwing*0.22);
      arm.lower.rotation.x=0.15+throwing*0.55;arm.tip.rotation.x=-throwing*0.32;
    }
  }
}
