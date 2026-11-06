import type { Scene } from "@babylonjs/core/scene";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";
import "@babylonjs/core/Engines/Extensions/engine.query";

export class PerformanceHud {
  private output = document.createElement("output");
  private frames: number[] = [];
  private elapsed = 0;
  private cpu = 0;
  private sceneStats: SceneInstrumentation;
  private engineStats: EngineInstrumentation;

  constructor(private scene: Scene) {
    this.sceneStats = new SceneInstrumentation(scene);
    this.engineStats = new EngineInstrumentation(scene.getEngine());
    this.engineStats.captureGPUFrameTime = !!scene.getEngine().getCaps().timerQuery;
    this.output.style.cssText = "position:fixed;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));z-index:900;pointer-events:none;white-space:pre;background:#102331df;color:#fff;padding:8px;border-radius:6px;font:12px/1.5 monospace";
    document.body.append(this.output);
    scene.onDisposeObservable.addOnce(() => {
      this.sceneStats.dispose();
      this.engineStats.dispose();
      this.output.remove();
    });
  }

  update(frameTime: number, cpuTime: number, distance: number) {
    if (frameTime > 250) {
      this.frames.length = 0;
      this.elapsed = this.cpu = 0;
      return;
    }
    this.frames.push(frameTime);
    this.elapsed += frameTime;
    this.cpu += cpuTime;
    if (this.elapsed < 1000) return;
    const count = this.frames.length;
    this.frames.sort((a, b) => a - b);
    const p95 = this.frames[Math.ceil(count * 0.95) - 1];
    const engine = this.scene.getEngine();
    const gpu = this.engineStats.captureGPUFrameTime ? this.engineStats.gpuFrameTimeCounter.current / 1_000_000 : 0;
    this.output.textContent = [
      `${Math.round(count * 1000 / this.elapsed)} FPS · ${Math.floor(distance)} m`,
      `CPU ${(this.cpu / count).toFixed(1)} ms · GPU ${gpu > 0 ? gpu.toFixed(1) : "—"} ms`,
      `P95 ${p95.toFixed(1)} ms · Draw ${this.sceneStats.drawCallsCounter.current}`,
      `${engine.getRenderWidth()} × ${engine.getRenderHeight()} · Mesh ${this.scene.meshes.length} · Mat ${this.scene.materials.length}`,
    ].join("\n");
    this.frames.length = 0;
    this.elapsed = this.cpu = 0;
  }
}
