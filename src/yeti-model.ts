import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { RegionalAttack } from "./regional-combat.ts";
import { ease, yetiMotion } from "./yeti-motion.ts";
import type { Point3 } from "./yeti-motion.ts";

type Ring = [y: number, width: number, depth: number, z?: number];
type Limb = {upper: TransformNode; lower: TransformNode; tip: TransformNode; a: number; b: number; side: number};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Hand-shaped ring profiles, articulated limbs and root-local contact targets. */
export class YetiModel {
  readonly root: TransformNode;
  private body: TransformNode;
  private head: TransformNode;
  private arms: Limb[] = [];
  private legs: Limb[] = [];
  private fingers: {joint: TransformNode; side: number}[] = [];
  private bar: TransformNode;
  private pips: Mesh[] = [];
  private gaitOffset: number;

  constructor(scene: Scene, id: number, material: (color: string, glow?: boolean) => StandardMaterial, high = true) {
    this.root = new TransformNode("snow-yeti", scene);
    this.gaitOffset=(id%17)*0.37;
    const joint = (name: string, position: Point3, parent = this.root) => {
      const node = new TransformNode(name, scene); node.parent = parent; node.position.set(...position); return node;
    };
    this.body = joint("yeti-weight", [0, 0, 0]);
    const sculpt = (name: string, rings: Ring[], color: string, parent = this.body, glow = false) => {
      const mesh = new Mesh(name, scene), data = new VertexData();
      const positions: number[] = [], indices: number[] = [], colors: number[] = [];
      // Bevelled rectangular cross section: flat chest, broad back, shaped flanks.
      const section = [[-0.5,-1],[0.5,-1],[0.82,-0.82],[1,-0.45],[1,0.45],[0.82,0.82],
        [0.45,1],[-0.45,1],[-0.82,0.82],[-1,0.45],[-1,-0.45],[-0.82,-0.82]];
      const sides=section.length;
      rings.forEach(([y,w,d,z=0], row) => section.forEach(([x,v], col) => {
        positions.push(x*w/2,y,z+v*d/2);
        const shade = 0.86 + (v+1)*0.045 + Math.sin(row*2.1+col)*0.025;
        colors.push(shade,shade,Math.min(1,shade+0.025),1);
      }));
      for(let row=0;row<rings.length-1;row++) for(let col=0;col<sides;col++) {
        const a=row*sides+col,b=row*sides+(col+1)%sides,c=a+sides,d=b+sides;
        indices.push(a,b,c,b,d,c);
      }
      for(let col=1;col<sides-1;col++) {
        indices.push(0,col+1,col);
        const end=(rings.length-1)*sides;indices.push(end,end+col,end+col+1);
      }
      if(rings[rings.length-1][0]<rings[0][0])
        for(let i=0;i<indices.length;i+=3) [indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
      const normals: number[]=[];VertexData.ComputeNormals(positions,indices,normals);
      data.positions=positions;data.indices=indices;data.normals=normals;data.colors=colors;data.applyToMesh(mesh);
      if(/fang/.test(name))mesh.convertToFlatShadedMesh();
      mesh.material=material(color,glow);mesh.parent=parent;mesh.metadata={wolfId:id};return mesh;
    };
    const tuft = (name: string, at: Point3, width: number, length: number, color: string, parent = this.body, angle = 0) => {
      const mesh=sculpt(name,[[0,width,0.11],[-length*0.3,width*0.93,0.15,0.02],
        [-length*0.72,width*0.48,0.09,0.045],[-length,width*0.025,0.018,0.075]],color,parent);
      mesh.position.set(...at);mesh.rotation.z=angle;return mesh;
    };
    const white="#dcebf0",ice="#adcad9",light="#f0f5ef",skin="#6c91a6";
    sculpt("yeti-contoured-torso",[[0.68,0.66,0.58],[0.92,0.92,0.72],[1.22,1.06,0.8,0.03],
      [1.61,1.4,0.88,0.08],[1.95,1.68,0.87,0.02],[2.16,1.36,0.68,-0.02],[2.24,0.72,0.46,-0.04]],white);
    sculpt("yeti-hunched-back",[[1.15,0.5,0.2,-0.3],[1.55,0.95,0.32,-0.34],[1.92,1.1,0.3,-0.32],[2.13,0.72,0.26,-0.2]],ice);
    sculpt("yeti-chest-plate",[[1.17,0.49,0.15,0.39],[1.48,0.82,0.19,0.45],[1.9,1.13,0.15,0.43],[2.04,0.8,0.1,0.37]],"#bfd9e1");
    for(const side of [-1,1]) {
      for(let i=0;i<(high?7:4);i++) {
        const t=i/(high?6:3);
        tuft("yeti-shoulder-shag",[side*(0.45+t*0.32),2.12-t*0.26,0.27-t*0.2],0.24,0.31+t*0.14,i%2?white:light,this.body,-side*0.26);
      }
      for(let i=0;i<5;i++)tuft("yeti-chest-shag",[side*(0.065+i*0.105),1.87-i*0.055,0.49],0.15,0.19+i*0.016,i%2?white:light);
      for(let i=0;i<4;i++) {
        const mane=tuft("yeti-back-mane",[side*(0.12+i*0.14),2.12-i*0.075,-0.43],0.22,0.28+i*0.018,i%2?white:light);
        mane.rotation.y=Math.PI;
      }
    }
    this.head=joint("yeti-neck",[0,2.27,0.12],this.body);
    sculpt("yeti-angular-skull",[[-0.19,0.57,0.53],[0,0.79,0.68],[0.3,0.83,0.61,-0.03],[0.5,0.62,0.46,-0.05],[0.6,0.08,0.08,-0.04]],light,this.head);
    sculpt("yeti-carved-face",[[-0.18,0.44,0.12,0.35],[0.02,0.61,0.19,0.36],[0.22,0.6,0.12,0.34]],skin,this.head);
    sculpt("yeti-projecting-jaw",[[-0.28,0.31,0.22,0.31],[-0.16,0.49,0.27,0.38],[-0.05,0.46,0.28,0.38]],"#adc5d1",this.head);
    sculpt("yeti-nose-bridge",[[-0.05,0.19,0.11,0.5],[0.04,0.21,0.16,0.49],[0.15,0.13,0.1,0.44]],"#38586e",this.head);
    sculpt("yeti-mouth-seam",[[-0.19,0.31,0.025,0.527],[-0.145,0.33,0.025,0.528]],"#2c465a",this.head);
    for(const side of [-1,1]) {
      const eye=sculpt("yeti-eye-socket",[[0.045,0.24,0.035,0.45],[0.17,0.24,0.035,0.43]],"#34566b",this.head);eye.position.x=side*0.19;
      const iris=sculpt("yeti-iris",[[0.075,0.082,0.025,0.473],[0.135,0.082,0.025,0.465]],"#e7c18a",this.head,true);iris.position.x=side*0.18;
      const brow=sculpt("yeti-brow-ridge",[[0.17,0.35,0.16,0.4],[0.29,0.34,0.16,0.35]],light,this.head);brow.position.x=side*0.18;brow.rotation.z=side*0.16;
      tuft("yeti-cheek-mane",[side*0.38,0.14,0.17],0.21,0.4,white,this.head,-side*0.12);
      tuft("yeti-jaw-beard",[side*0.13,-0.19,0.4],0.23,0.3,light,this.head);
      const fang=sculpt("yeti-short-fang",[[0.01,0.025,0.03,0.56],[-0.12,0.06,0.045,0.55]],light,this.head);fang.position.set(side*0.15,-0.12,0);
      // Upper arm and forearm profiles carry a pronounced elbow and wrist.
      const upper=joint("yeti-shoulder",[side*0.79,2.02,0],this.body);
      const shoulder=sculpt("yeti-shoulder-cap",[[0.17,0.35,0.42],[0,0.6,0.58],[-0.25,0.51,0.54],[-0.45,0.35,0.4],[-0.68,0.3,0.32]],white,upper);
      shoulder.rotation.z=-side*0.03;
      const lower=joint("yeti-elbow",[0,-0.68,0],upper);
      sculpt("yeti-heavy-forearm",[[0.06,0.32,0.35],[-0.17,0.48,0.48,0.03],[-0.42,0.4,0.42,0.04],[-0.7,0.26,0.29,0.04]],ice,lower);
      for(let i=0;i<3;i++)tuft("yeti-arm-shag",[side*0.18,-0.16-i*0.12,0.1],0.22,0.23,light,lower,-side*0.2);
      const palm=joint("yeti-wrist",[0,-0.7,0],lower);
      sculpt("yeti-square-palm",[[0.05,0.3,0.26],[-0.12,0.39,0.29,0.015],[-0.23,0.34,0.22,0.03]],skin,palm);
      for(let i=0;i<3;i++) {
        const finger=joint("yeti-finger",[(i-1)*0.115,-0.2,0.035],palm);
        sculpt("yeti-finger-segments",[[0,0.11,0.13],[-0.12,0.1,0.13,0.015],[-0.23,0.075,0.1,0.045]],"#b2ccd6",finger);
        this.fingers.push({joint:finger,side});
      }
      const thumb=joint("yeti-thumb",[-side*0.23,-0.035,0.04],palm);thumb.rotation.z=-side*0.6;
      sculpt("yeti-opposing-thumb",[[0,0.12,0.15],[-0.22,0.09,0.13,0.06]],ice,thumb);
      this.arms.push({upper,lower,tip:palm,a:0.68,b:0.7,side});
      const hip=joint("yeti-hip",[side*0.34,0.92,-0.015],this.body);
      sculpt("yeti-thigh",[[0.14,0.38,0.43],[0,0.47,0.51],[-0.28,0.39,0.42],[-0.46,0.27,0.3]],white,hip);
      const knee=joint("yeti-knee",[0,-0.46,0],hip);
      sculpt("yeti-calf",[[0.06,0.29,0.32],[-0.14,0.36,0.37,-0.035],[-0.36,0.24,0.27],[-0.49,0.23,0.24]],ice,knee);
      const ankle=joint("yeti-ankle",[0,-0.49,0],knee);
      sculpt("yeti-planted-foot",[[-0.1,0.4,0.6,0.16],[0.02,0.46,0.65,0.16],[0.15,0.31,0.4,0.08]],"#769cae",ankle);
      for(let i=0;i<3;i++) {
        const toe=sculpt("yeti-toe-cap",[[-0.08,0.12,0.18,0.43],[0.055,0.12,0.19,0.43]],"#cee1e5",ankle);toe.position.x=(i-1)*0.135;
      }
      this.legs.push({upper:hip,lower:knee,tip:ankle,a:0.46,b:0.49,side});
    }
    this.bar=joint("yeti-health",[0,3.05,0]);this.bar.billboardMode=Mesh.BILLBOARDMODE_ALL;
    const bar=(width:number,height:number,x:number,z:number,color:string)=>{
      const mesh=CreatePlane("yeti-health-pip",{width,height,sideOrientation:Mesh.DOUBLESIDE},scene);
      mesh.parent=this.bar;mesh.position.set(x,0,z);mesh.material=material(color,true);mesh.isPickable=false;return mesh;
    };
    bar(1.18,0.17,0,0.012,"#bcc6ca");bar(1.12,0.12,0,0.006,"#243248");
    for(let i=0;i<5;i++)this.pips.push(bar(0.18,0.08,(i-2)*0.215,0,"#ff7781"));
  }

  private solve(limb: Limb, target: Vector3, pole: Vector3, flatFoot = false) {
    const origin=limb.upper.position,direction=target.subtract(origin);
    const distance=Math.max(0.03,Math.min(limb.a+limb.b-0.002,direction.length()));
    direction.normalize();
    const along=(limb.a*limb.a-limb.b*limb.b+distance*distance)/(2*distance);
    const bend=pole.subtract(direction.scale(Vector3.Dot(pole,direction))).normalize();
    const elbow=origin.add(direction.scale(along)).add(bend.scale(Math.sqrt(Math.max(0,limb.a*limb.a-along*along))));
    const hand=origin.add(direction.scale(distance));
    const upper=Quaternion.FromUnitVectorsToRef(Vector3.Down(),elbow.subtract(origin).normalize(),Quaternion.Identity());
    const lower=Quaternion.FromUnitVectorsToRef(Vector3.Down(),hand.subtract(elbow).normalize(),Quaternion.Identity());
    limb.upper.rotationQuaternion=upper;
    limb.lower.rotationQuaternion=upper.conjugate().multiply(lower);
    if(flatFoot)limb.tip.rotationQuaternion=Quaternion.FromEulerVector(this.body.rotation).multiply(lower).conjugate();
  }

  animate(time: number, health: number, entry: number, hitAge: number, attack?: RegionalAttack) {
    const pose=yetiMotion(time,attack),fallen=health<=0?ease(hitAge/0.45):0;
    const flinch=(1-ease(hitAge/0.23))*0.13;
    const gait=time*(pose.sprint>0.1?14:7.5)+this.gaitOffset,run=1-pose.action*(1-pose.sprint);
    this.body.position.set(Math.sin(gait)*0.017*run,Math.abs(Math.cos(gait))*0.028*run-pose.squat*pose.action-fallen*0.52,0);
    this.body.rotation.set(-pose.lean*pose.action,pose.twist*pose.action,Math.sin(gait)*0.025*run+flinch+fallen*1.35);
    this.head.rotation.set(pose.action*0.08, -pose.twist*0.25, -flinch*0.5);
    this.root.scaling.setAll(1-fallen*0.13);
    const inverse=Quaternion.FromEulerVector(this.body.rotation).conjugate();
    const toBody=(p:Vector3)=>p.subtract(this.body.position).applyRotationQuaternion(inverse);
    for(const leg of this.legs) {
      const cycle=(gait/(Math.PI*2)+(leg.side>0?0.5:0))%1;
      const swing=cycle<0.6?0:(cycle-0.6)/0.4;
      const z=cycle<0.6?lerp(0.29,-0.29,cycle/0.6):lerp(-0.29,0.29,ease(swing));
      const lift=Math.sin(swing*Math.PI)*0.17*run;
      const target=new Vector3(leg.side*(0.34+pose.squat*0.16),0.11+lift,z*run+0.015);
      this.solve(leg,toBody(target),new Vector3(0,-0.1,1),true);
    }
    for(const arm of this.arms) {
      const walk=new Vector3(arm.side*0.87,0.94+Math.cos(gait)*0.045,Math.sin(gait+(arm.side>0?0:Math.PI))*0.3);
      const actionTarget=arm.side>0?pose.right:pose.left;
      const target=actionTarget?Vector3.Lerp(walk,new Vector3(...actionTarget),pose.action):walk;
      this.solve(arm,toBody(target),new Vector3(arm.side*0.7,-0.2,-0.5));
      arm.tip.rotation.set(pose.grip*0.35,0,-arm.side*pose.grip*0.55);
    }
    for(const finger of this.fingers)finger.joint.rotation.x=-pose.grip*0.95;
    this.bar.setEnabled(health>0&&entry>0.85);this.pips.forEach((pip,i)=>pip.setEnabled(i<health));
  }
}
