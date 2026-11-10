import type { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { SnowProps } from "./snow-props.ts";
import type { TerrainGuideId } from "./tutorial.ts";
import type { TrackItem } from "./game.ts";
import { makeCoral } from "./coral.ts";
import { CONFIG } from "./config.ts";
import { SquidModel } from "./squid-view.ts";
import { Color4 } from "@babylonjs/core/Maths/math.color";

export class TerrainPreview {
  static readonly layerMask = 0x10000000;
  readonly camera: FreeCamera;
  private root: TransformNode;
  private stageMaterial: StandardMaterial;
  private diagramMaterials: StandardMaterial[] = [];
  private frameWidth = 4.3;
  private frameHeight = 3.55;
  private overhead = 0.41;
  private targetY = 0.9;
  private squidDemo?: {model: SquidModel; runner: TransformNode};

  constructor(
    scene: Scene, source: TransformNode, readonly guide: TerrainGuideId, readonly step: number,
    snow: () => SnowProps, makeItem: (item: TrackItem) => TransformNode,
    warningMaterial: (urgency: number) => StandardMaterial,
  ) {
    this.root = new TransformNode("terrain-guide-stage", scene);
    this.root.position.x = 1000;
    this.camera = new FreeCamera("terrain-guide-camera", new Vector3(1000, 6, -10), scene);
    this.camera.layerMask = TerrainPreview.layerMask;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 45;
    this.camera.fov = 0.66;

    if (guide === "squid") {
      this.frameWidth=7.2;this.frameHeight=4.6;this.targetY=1.65;this.overhead=0.16;
      const palette=new Map<string,StandardMaterial>();
      const paint=(color:string,glow=false)=>{
        const key=color+glow;
        if(!palette.has(key)) {
          const m=new StandardMaterial("squid-lesson-material",scene);m.diffuseColor=Color3.FromHexString(color);
          if(glow)m.emissiveColor=m.diffuseColor.scale(0.5);
          palette.set(key,m);this.diagramMaterials.push(m);
        }
        return palette.get(key)!;
      };
      const squid=new SquidModel(scene,paint,true);squid.root.parent=this.root;
      squid.root.position.set(step===1?-1.8:-0.6,1.9,0.3);squid.root.rotation.y=1.2;
      const explorer=source.clone("squid-lesson-runner",this.root)!;
      explorer.position.set(1.3,0.1,0);explorer.rotation.set(0,-0.8,0);explorer.scaling.setAll(0.85);
      for(const node of explorer.getDescendants())if(node instanceof TransformNode) {
        if(/aura|jet|pulse|booster|snow-liquor|slingshot|hunting-bow|officer-pistol|pistol-muzzle/.test(node.name))node.setEnabled(false);
        if(/(hips|shoulder|elbow|hip-joint|knee|ankle|torso|head-joint)$/.test(node.name))node.rotation.set(0,0,0);
        if(node.name.endsWith("hips"))node.position.set(0,0.95,0);
        if(node.name.endsWith("torso")){node.position.y=0;node.scaling.setAll(1);}
        if(node.name.endsWith("shoulder"))node.rotation.x=step===3?-1.2:-0.6;
        if(node.name.endsWith("elbow"))node.rotation.x=-0.8;
        if(node.name.endsWith("knee"))node.rotation.x=0.3;
      }
      const target=Vector3.TransformCoordinates(new Vector3(1001.3,1.15,0),squid.root.computeWorldMatrix(true).clone().invert());
      squid.animate(1,0,4,step===2?0.95:0,step===3?1:0,Infinity,step>1?target:undefined);
      this.squidDemo={model:squid,runner:explorer};
      if(step===1) {
        const ray=CreateTube("guide-ink-warning",{path:[new Vector3(-1.6,1.4,0.6),new Vector3(1.3,1.15,0)],radius:0.025,tessellation:5},scene);
        ray.parent=this.root;ray.material=paint("#ff3156",true);
        for(let i=0;i<3;i++) {
          const ink=CreateSphere("guide-ink-projectile",{diameter:0.32-i*0.06,segments:10},scene);
          ink.parent=this.root;ink.position.set(-0.8+i*0.6,1.34-i*0.05,0.3);ink.material=paint("#2b163e");
        }
      } else if(step===2) {
        const box=CreateBox("guide-grab-volume",{width:1.5,height:2.5,depth:1.4},scene);
        box.parent=this.root;box.position.set(1.3,1.15,0);box.material=paint("#ff3156",true);box.visibility=0.16;
        box.enableEdgesRendering();box.edgesWidth=2.5;box.edgesColor=new Color4(1,0.15,0.3,1);
      } else {
        for(const [name,width,height,x,color] of [["track",4,0.22,0,"#243248"],["safe",0.88,0.24,0.5,"#59c79c"],["float",0.1,0.48,0.45,"#ffd270"]] as const) {
          const mesh=CreateBox("guide-escape-"+name,{width,height,depth:0.12},scene);
          mesh.parent=this.root;mesh.position.set(x,-0.1,-1.3);mesh.material=paint(color,true);
        }
      }
    } else if (step === 1) {
      const explorer = source.clone("lesson-explorer", this.root)!;
      explorer.position.set(0, 0, 0);
      explorer.rotation.set(0, Math.PI + 0.18, 0);
      explorer.scaling.setAll(1);
      for (const node of explorer.getDescendants()) {
        if (!(node instanceof TransformNode)) continue;
        if (/aura|jet|pulse|booster-pod|snow-liquor|slingshot|hunting-bow/.test(node.name)) node.setEnabled(false);
        if (node.name.endsWith("hips")) node.position.set(0, 0.95, 0);
        if (node.name.endsWith("torso")) { node.position.y = 0; node.scaling.setAll(1); }
        if (/(hips|shoulder|elbow|hip-joint|knee|ankle|torso|head-joint)$/.test(node.name)) node.rotation.set(0, 0, 0);
        if (node.name.endsWith("elbow")) node.rotation.x = -0.25;
        if (guide === "ocean") {
          const side = node.position.x || (node.parent instanceof TransformNode ? node.parent.position.x : 0);
          if (node.name.endsWith("shoulder")) node.rotation.set(side < 0 ? -2.5 : -0.92, 0, side < 0 ? -0.24 : 0.46);
          if (node.name.endsWith("elbow")) node.rotation.x = side < 0 ? -0.38 : -1.16;
          if (node.name.endsWith("hip-joint")) node.rotation.x = side < 0 ? -0.25 : 0.12;
          if (node.name.endsWith("knee")) node.rotation.x = 0.28;
          if (node.name.endsWith("ankle")) node.rotation.x = 0.19;
          if (node.name.endsWith("head-joint")) node.rotation.x = -0.22;
        }
      }
      if (guide === "ocean") {
        this.frameWidth = 5;
        this.frameHeight = 4.65;
        this.overhead = 0.24;
        this.targetY = 2.26;
        const border = this.diagramInk("#75d9d6");
        const currentCell = this.diagramInk("#ffd270");
        const movement = this.diagramInk("#6af1b9");
        for (let row = 0; row < 3; row++) for (let col = -1; col <= 1; col++) {
          const current = row === 1 && col === 0;
          this.diagramFrame(col * 1.4, 0.86 + row * 1.4, 1.26, 1.26,
            current ? currentCell : border, current ? 0.04 : 0.021);
        }
        for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          this.diagramArrow(x * 1.12, 2.26 + y * 1.12, x, y, 0.54, movement);
        }
        explorer.scaling.setAll(0.83);
        explorer.position.set(0, 1.91, -0.08);
        explorer.rotation.set(1.19, 0, -0.11);
      }
    } else if (guide === "snow" && step === 2) {
      this.frameWidth = 8.9;
      this.frameHeight = 5.5;
      this.overhead = 0.68;
      this.targetY = 0.56;
      const hazards = [
        {type: "ice", x: -2.95, z: -1.45, size: 0.65},
        {type: "snowdrift", x: 0.27, z: -1.7, size: 0.76},
        {type: "snowman", x: 1.95, z: -1.65, size: 0.62},
        {type: "pool", x: -3.01, z: 1.65, size: 0.73},
        {type: "fire", x: -1.32, z: 1.72, size: 0.82},
        {type: "stump", x: 0.66, z: 1.78, size: 0.7},
        {type: "snow-log", x: 2.53, z: 1.68, size: 0.31},
      ] as const;
      for (const {type, x, z, size} of hazards) {
        const model = snow().create(type);
        model.parent = this.root;
        model.position.set(x, 0, z);
        model.scaling.setAll(size);
        if (type === "pool") {
          model.scaling.z = 0.085;
          model.position.y = 0.35;
        }
        if (type === "ice") model.scaling.z = 0.3;
      }
    } else if (guide === "snow") {
      this.frameWidth = 5.6;
      this.frameHeight = 3.65;
      const fire = snow().create("fire");
      fire.parent = this.root;
      fire.position.x = -1.35;
      fire.scaling.setAll(1.3);
      const bottle = snow().create("liquor", false);
      bottle.parent = this.root;
      bottle.position.set(1.45, 0.68, 0);
      bottle.scaling.setAll(2.7);
    } else if (guide === "ocean") {
      this.frameWidth = step === 2 ? 8.8 : 7.6;
      this.frameHeight = 4.7;
      this.targetY = step === 2 ? 1.85 : 2.08;
      this.overhead = 0.13;
      const model = (type: TrackItem["type"]) => {
        const item = makeItem({type, id: 0, lane: 0, z: 0, y: 0, worldZ: 0,
          coral: type === "coral" ? makeCoral(0, 2) : undefined});
        item.parent = this.root;
        return item;
      };
      if (step === 2) {
        const bubble = model("bubble");
        bubble.position.set(-2.7, 1.25, 0);
        const coral = model("coral");
        coral.position.set(-0.2, 0, 0);
        coral.scaling.setAll(0.54);
        const vent = model("volcano");
        vent.position.x = 2.55;
        vent.scaling.setAll(0.54);
        const plume = vent.getChildMeshes().find(mesh => mesh.name === "thermal-plume")!;
        const bubbles = vent.getChildMeshes().filter(mesh => mesh.name.startsWith("vent-steam-"));
        const plumeHeight = CONFIG.waterSurface - CONFIG.seabedHeight - 1.3;
        plume.setEnabled(true);
        plume.visibility = 0.66;
        for (const [i, steam] of bubbles.entries()) {
          steam.setEnabled(true);
          steam.position.set(Math.sin(i * 2.4) * 0.3, 0.65 + (i + 0.4) / bubbles.length * plumeHeight, Math.cos(i * 2.4) * 0.3);
          steam.scaling.setAll(0.72);
        }
      } else {
        const crossing = model("fish");
        const school = crossing.getChildTransformNodes(true).find(node => node.name === "fish-school")!;
        const sign = crossing.getChildMeshes().find(mesh => mesh.name === "fish-entry-sign")!;
        const edge = this.diagramInk("#4e9eaa");
        const activeLane = this.diagramInk("#83e9dd");
        this.diagramFrame(0, 0.92, 6.8, 1.03, edge, 0.023);
        this.diagramFrame(0, 2.12, 6.8, 1.03, activeLane, 0.032);
        this.diagramFrame(0, 3.32, 6.8, 1.03, edge, 0.023);
        crossing.position.y = 2.12;
        sign.setEnabled(true);
        sign.position.x = -2.69;
        sign.scaling.setAll(0.59);
        sign.material = warningMaterial(0);
        const urgentSign = sign.clone("guide-urgent-fish-sign", crossing, true)!;
        urgentSign.position.x = -1.86;
        urgentSign.material = warningMaterial(1);
        school.position.x = 0.57;
        school.scaling.setAll(1.1);
        school.rotation.y = Math.PI / 2;
        this.diagramArrow(2.57, 2.12, 1, 0, 0.86, this.diagramInk("#6af1b9"));
      }
    }
    const stage = CreateCylinder("lesson-display-plinth", {diameter: this.frameWidth, height: 0.12, tessellation: 48}, scene);
    stage.parent = this.root;
    stage.position.y = -0.14;
    this.stageMaterial = new StandardMaterial("lesson-plinth", scene);
    this.stageMaterial.diffuseColor = Color3.FromHexString(guide === "snow" ? "#aec5cd" : "#649aa5");
    this.stageMaterial.specularColor.setAll(0.03);
    stage.material = this.stageMaterial;
    stage.setEnabled(guide === "snow" || guide === "ocean" && step === 2);
    for (const mesh of this.root.getChildMeshes()) {
      mesh.layerMask = TerrainPreview.layerMask;
      mesh.receiveShadows = false;
    }
  }

  private diagramInk(color: string) {
    const material = new StandardMaterial("guide-diagram-ink", this.root.getScene());
    material.disableLighting = true;
    material.emissiveColor = Color3.FromHexString(color);
    this.diagramMaterials.push(material);
    return material;
  }

  private diagramStroke(path: Vector3[], material: StandardMaterial, radius: number) {
    const stroke = CreateTube("guide-diagram-stroke", {path, radius, tessellation: 6, cap: 3}, this.root.getScene());
    stroke.parent = this.root;
    stroke.material = material;
  }

  private diagramFrame(x: number, y: number, width: number, height: number, material: StandardMaterial, stroke: number) {
    const radius = 0.15;
    const path: Vector3[] = [];
    for (let corner = 0; corner < 4; corner++) {
      const cx = x + (corner === 0 || corner === 3 ? 1 : -1) * (width / 2 - radius);
      const cy = y + (corner < 2 ? 1 : -1) * (height / 2 - radius);
      for (let i = 0; i <= 4; i++) {
        const angle = (corner + i / 4) * Math.PI / 2;
        path.push(new Vector3(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 1));
      }
    }
    path.push(path[0].clone());
    this.diagramStroke(path, material, stroke);
  }

  private diagramArrow(cx: number, cy: number, x: number, y: number, length: number, material: StandardMaterial) {
    const point = (along: number, across = 0) =>
      new Vector3(cx + x * along - y * across, cy + y * along + x * across, 0.62);
    const tip = length / 2;
    this.diagramStroke([point(-tip), point(tip)], material, 0.059);
    this.diagramStroke([point(tip - 0.19, -0.17), point(tip), point(tip - 0.19, 0.17)], material, 0.05);
  }

  frame(rect: DOMRect, canvas: DOMRect) {
    if(this.squidDemo) {
      const time=performance.now()/1000,phase=time%4;
      const p=Math.max(0,Math.min(1,(phase-1.2)/0.6));
      const back=Math.max(0,Math.min(1,(phase-2.8)/0.7));
      const dash=p*p*(3-2*p)*(1-back*back*(3-2*back));
      const model=this.squidDemo.model;
      model.root.position.x=this.step===2?-2.2+dash*1.6:this.step===3?-0.6:-1.8;
      const grip=Vector3.TransformCoordinates(new Vector3(1001.3,1.15,0),model.root.computeWorldMatrix(true).clone().invert());
      if(grip.length()>2.6)grip.normalize().scaleInPlace(2.6);
      model.animate(time,0,4,this.step===2?dash:0,this.step===3?1:0,Infinity,this.step>1?grip:undefined);
    }
    this.camera.viewport = new Viewport((rect.left - canvas.left) / canvas.width, (canvas.bottom - rect.bottom) / canvas.height, rect.width / canvas.width, rect.height / canvas.height);
    const aspect = Math.max(0.5, rect.width / Math.max(1, rect.height));
    const distance = Math.max(this.frameHeight, this.frameWidth / aspect) / (2 * Math.tan(this.camera.fov / 2)) * 1.07;
    this.camera.position.set(1000 + distance * (this.guide === "snow" ? 0.055 : 0), this.targetY + distance * this.overhead,
      -distance * Math.sqrt(1 - this.overhead ** 2));
    this.camera.setTarget(new Vector3(1000, this.targetY, 0));
  }

  setEnabled(enabled: boolean) { this.root.setEnabled(enabled); }

  dispose() {
    this.root.dispose();
    this.stageMaterial.dispose();
    for (const material of this.diagramMaterials) material.dispose();
    this.camera.dispose();
  }
}
