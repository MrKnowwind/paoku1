import type { LoadingUpdate } from "./loading.ts";
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
const actions = root.querySelector<HTMLElement>("#startup-actions")!;
const percentLabel = root.querySelector<HTMLElement>("#startup-percent")!;
root.querySelector<HTMLElement>("#startup-fallback")!.hidden = true;
root.setAttribute("aria-label", copy.files); bar.setAttribute("aria-label", copy.files);
let highest = 0, done = false, failed = false;
let lastActivity = Date.now();
let previousPhase = "";
const draw = (update: LoadingUpdate) => {
  if ((done && update.phase !== "error") || failed) return;
  if (update.phase === "error") {
    done = false; root.hidden = false; root.classList.remove("is-finished");
    failed = true; root.classList.add("has-error");
    status.textContent = copy[update.reason ?? "graphics"];
    detail.textContent = "";
    actions.hidden = false;
    return;
  }
  if (update.phase === previousPhase && update.percent <= highest) return;
  lastActivity = Date.now();
  previousPhase = update.phase;
  highest = Math.max(highest, Math.min(100, update.percent));
  bar.style.setProperty("--progress", `${highest}%`);
  bar.setAttribute("aria-valuenow", String(Math.floor(highest)));
  percentLabel.textContent = `${Math.floor(highest)}%`;
  status.textContent = copy[update.phase];
  detail.textContent = "";
  actions.hidden = true;
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
const watchdog = setInterval(() => {
  if (done || failed) { clearInterval(watchdog); return; }
  const idle = Date.now() - lastActivity;
  if (idle > 12000 && !detail.textContent) detail.textContent = copy.slow;
  if (idle > 30000) actions.hidden = false;
}, 1000);

async function boot() {
  draw({phase: "files", percent: 5});
  try {
    await import("./main.ts");
  } catch (error) {
    console.error("Game startup failed", error);
    draw({phase: "error", percent: highest, reason: highest < 65 ? "network" : "graphics"});
  }
}
void boot();
