import { downloadStartupAssets } from "./loading.ts";
import type { LoadingUpdate, StartupAsset } from "./loading.ts";
import { startupCopy } from "./startup-copy.ts";

const root = document.querySelector<HTMLElement>("#startup-loader")!;
(window as Window & {__wildDashBooted?: boolean}).__wildDashBooted = true;
let language = "zh";
try { language = localStorage.getItem("wild-dash:language") ?? "zh"; } catch {}
const copy = startupCopy[language as keyof typeof startupCopy] ?? startupCopy.zh;
root.querySelectorAll<HTMLElement>("[data-startup]").forEach(element => {
  element.textContent = copy[element.dataset.startup as keyof typeof copy];
});
const status = root.querySelector<HTMLElement>("#startup-status")!;
const detail = root.querySelector<HTMLElement>("#startup-detail")!;
const bar = root.querySelector<HTMLElement>("[role=progressbar]")!;
root.setAttribute("aria-label", copy.files); bar.setAttribute("aria-label", copy.files);
let highest = 0, done = false, failed = false;
let lastActivity = Date.now();
let previousPhase = "", previousBytes = -1;
const draw = (update: LoadingUpdate) => {
  if ((done && update.phase !== "error") || failed) return;
  if (update.phase !== previousPhase || update.percent > highest || (update.loaded ?? -1) > previousBytes)
    lastActivity = Date.now();
  previousPhase = update.phase; previousBytes = update.loaded ?? -1;
  if (update.phase === "error") {
    done = false; root.hidden = false; root.classList.remove("is-finished");
    failed = true; root.classList.add("has-error");
    status.textContent = copy[update.reason ?? "graphics"];
    detail.textContent = "";
    root.querySelector<HTMLElement>("#startup-actions")!.hidden = false;
    return;
  }
  highest = Math.max(highest, Math.min(100, update.percent));
  bar.style.setProperty("--progress", `${highest}%`);
  bar.setAttribute("aria-valuenow", String(Math.floor(highest)));
  root.querySelector("#startup-percent")!.textContent = `${Math.floor(highest)}%`;
  status.textContent = copy[update.phase];
  detail.textContent = "";
  if (update.phase === "ready") {
    done = true; root.classList.add("is-finished");
    setTimeout(() => { if (done) root.hidden = true; }, 600);
  }
};
window.addEventListener("wild-dash:loading", event => draw((event as CustomEvent<LoadingUpdate>).detail));
root.querySelector("#startup-retry")!.addEventListener("click", () => location.reload());
root.querySelector("#startup-lite")!.addEventListener("click", () => {
  try { localStorage.setItem("wild-dash:quality", "low"); } catch {}
  const url = new URL(location.href); url.searchParams.set("quality", "low"); location.replace(url);
});
window.addEventListener("vite:preloadError", event => {
  event.preventDefault(); draw({phase: "error", percent: highest, reason: "network"});
});
const watchdog = setInterval(() => {
  if (done || failed) { clearInterval(watchdog); return; }
  const idle = Date.now() - lastActivity;
  if (idle > 12000) detail.textContent = copy.slow;
  if (idle > 45000) draw({phase: "error", percent: highest, reason: highest < 65 ? "network" : "graphics"});
}, 1000);

async function boot() {
  draw({phase: "files", percent: 0});
  try {
    if (import.meta.env.PROD) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      let assets: StartupAsset[];
      try {
        const response = await fetch(import.meta.env.BASE_URL + "startup-assets.json", {cache: "no-store", signal: controller.signal});
        if (!response.ok) throw new Error("startup-manifest");
        assets = await response.json();
      } finally { clearTimeout(timeout); }
      await downloadStartupAssets(assets, new URL(import.meta.env.BASE_URL, location.href).href,
        (loaded, total) => draw({phase: "files", percent: total ? Math.min(65, loaded / total * 65) : 0, loaded, total}));
    }
    draw({phase: "scene", percent: 65});
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await import("./main.ts");
  } catch (error) {
    console.error("Game startup failed", error);
    draw({phase: "error", percent: highest, reason: highest < 65 ? "network" : "graphics"});
  }
}
void boot();
