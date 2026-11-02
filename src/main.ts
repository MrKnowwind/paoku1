import "./style.css";
import { RunnerGame } from "./game.ts";
import { ForestScene } from "./scene.ts";
import { messages, resolveLanguage, languageTags } from "./i18n.ts";
import type { MessageKey } from "./i18n.ts";

const icons: Record<string, string> = {
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l2-8Z"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  leaf: '<path d="m3 19 6-12 4 7 2-4 6 9H3Z" fill="currentColor" fill-opacity=".12"/><path d="m3 19 6-12 4 7 2-4 6 9H3Z"/><path d="m8 19 3-5"/>',
  settings:
    '<path d="M4 6h5m4 0h7M4 12h10m4 0h2M4 18h2m4 0h10"/><rect x="9" y="3.5" width="4" height="5" rx="1.2"/><rect x="14" y="9.5" width="4" height="5" rx="1.2"/><rect x="6" y="15.5" width="4" height="5" rx="1.2"/>',
  sound:
    '<path d="m11 4-6 5H2v6h3l6 5V4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5V4Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  pause:
    '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  trophy:
    '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" fill="currentColor" fill-opacity=".12"/><path d="M7 6H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4M12 14v5m-4 2h8m-6-2h4"/>',
  coin: '<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".12"/><circle cx="12" cy="12" r="6.5" stroke-opacity=".5"/><path d="M15 7c-6 0-8 5-5 9 4-1 6-4 5-9Z"/><path d="m9 17 4-7"/>',
  route:
    '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 16v-3a4 4 0 0 1 4-4h4a4 4 0 0 0 4-3M10 18h10M4 6h6"/>',
  jump: '<path d="M5 19h14M12 15V3m-5 5 5-5 5 5"/>',
  slide:
    '<path d="m4 6 6 5-3 5h12m-4-4 4 4-4 4"/><circle cx="16" cy="6" r="2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  play: '<path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none"/>',
  restart: '<path d="M4 10a8 8 0 1 1 .8 7M4 4v6h6"/>',
  home: '<path d="m3 11 9-8 9 8M6 10v10h12V10M10 20v-6h4v6"/>',
  language:
    '<path d="M3 5h12M9 3v2m-4 3c1 4 4 7 8 9m0-12c0 5-4 10-9 12m10 3 4-10 4 10m-6-3h4"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  quality: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
};
const icon = (name: string, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.leaf}</svg>`;
const read = (key: string) => {
  try {
    return localStorage.getItem(`wild-dash:${key}`);
  } catch {
    return null;
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(`wild-dash:${key}`, value);
  } catch {
    /* Private browsing can disable storage. */
  }
};
let language = resolveLanguage(read("language"));
let numberFormatter = new Intl.NumberFormat(languageTags[language]);
let sound = read("sound") !== "false";
let quality = read("quality") !== "low";
let best = Math.max(0, Number(read("best")) || 0);
let newBest = false;
let resultDelay = 0;
let activeDialog: "settings" | "pause" | "over" | "guide" | null = null;
let resumeOnClose = false;
let focusBeforeDialog: HTMLElement | null = null;
let world: ForestScene | null = null;
let loaded = false;
let audio: AudioContext | null = null;
const languages = [
  { code: "zh", name: "简体中文", mark: "中" },
  { code: "en", name: "English", mark: "EN" },
  { code: "ja", name: "日本語", mark: "あ" },
  { code: "ko", name: "한국어", mark: "한" },
] as const;
const game = new RunnerGame();
const t = (key: MessageKey) => messages[language][key];
const n = (value: number) => numberFormatter.format(Math.floor(value));
const text = (key: MessageKey, tag = "span", cls = "") =>
  `<${tag} class="${cls}" data-i18n="${key}">${t(key)}</${tag}>`;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <canvas id="world" aria-label="3D"></canvas>
  <div class="vignette"></div><div class="impact-flash"></div>
  <div class="shell">
    <header class="header">
      <a class="brand" href="#" data-action="home" data-label="brand">
        <span class="brand-mark">${icon("leaf")}</span>${text("brand", "strong")}
      </a>
      <section class="hud" id="hud" hidden data-label="score">
        <div class="hud-main">${text("score", "small")}<strong id="score">0</strong></div>
        <div class="hud-secondary">
          <span class="distance-counter" data-label="distance">${icon("route")}<span><b id="distance">0</b><small>m</small></span></span>
          <span class="coin-counter" data-label="coins">${icon("coin")}<b id="coins">0</b></span>
        </div>
      </section>
      <div class="header-actions">
        <button class="icon-button pause-button" data-action="pause" data-label="pause" hidden>${icon("pause")}</button>
        <button class="icon-button" id="sound-toggle" data-action="sound" data-label="sound" aria-pressed="${sound}">${icon(sound ? "sound" : "mute")}</button>
        <button class="icon-button" data-action="settings" data-label="settings">${icon("settings")}</button>
      </div>
    </header>
    <main>
      <section class="intro" id="intro">
        <div class="trail-badge">${icon("leaf")}${text("forest")}</div>
        <h1>${text("titleA", "span")}${text("titleB", "span", "title-accent")}</h1>
        <p class="wordmark" aria-hidden="true">WILD DASH</p>
        <button class="primary-button start-button" data-action="start" disabled>${icon("play")}${text("start")}</button>
        <div class="best-record">${icon("trophy")}${text("best", "small")}<strong id="home-best">${n(best)} <span>${t("bestUnit")}</span></strong></div>
      </section>
      <div class="live-hint" id="live-hint" hidden>${text("liveHint", "span", "keyboard-only")}${text("mobileHint", "span", "touch-only")}</div>
    </main>
    <footer><button class="icon-button help-button" data-action="guide" data-label="howTo">${icon("help")}</button></footer>
  </div>
  <div class="coin-pop" id="coin-pop" aria-hidden="true"></div>
  <dialog id="dialog" aria-labelledby="dialog-title"></dialog>
  <div id="countdown" class="countdown" hidden aria-live="polite" aria-atomic="true"></div>
  <div class="loader" id="loader"><div class="loader-leaf">${icon("leaf")}</div>${text("loading")}</div>
`;

function beep(kind: "coin" | "jump" | "slide" | "hit" | "start" | "tick") {
  if (!sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;
    const frequencies = {
      coin: 1046,
      jump: 330,
      slide: 210,
      hit: 110,
      start: 523,
      tick: 440,
    };
    osc.type = kind === "hit" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(frequencies[kind], now);
    osc.frequency.exponentialRampToValueAtTime(
      kind === "coin" ? 1568 : frequencies[kind] * 0.5,
      now + 0.14,
    );
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(now + 0.2);
  } catch {
    /* The game can run when audio is unavailable. */
  }
}

function localize() {
  numberFormatter = new Intl.NumberFormat(languageTags[language]);
  document.documentElement.lang = languageTags[language];
  document.title = `${t("brand")} · Wild Dash`;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n as MessageKey);
  });
  document.querySelectorAll<HTMLElement>("[data-label]").forEach((el) => {
    const label = t(el.dataset.label as MessageKey);
    el.title = label;
    el.setAttribute("aria-label", label);
  });
  document.querySelector("#home-best")!.innerHTML =
    `${n(best)} <span>${t("bestUnit")}</span>`;
  document
    .querySelector('meta[name="description"]')!
    .setAttribute("content", t("description").replace("\n", " "));
}

const dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
function renderDialog() {
  dialog.dataset.view = activeDialog ?? "";
  const close = `<button class="icon-button dialog-close" data-action="close" aria-label="${t("close")}">${icon("close")}</button>`;
  if (activeDialog === "settings") {
    const selected = languages.find((item) => item.code === language)!;
    dialog.innerHTML = `${close}<div class="modal-heading"><span class="modal-symbol">${icon("settings")}</span><h2 id="dialog-title">${t("settings")}</h2></div>
      <div class="setting-row language-row"><span class="setting-label" id="language-label">${icon("language")}${t("language")}</span>
      <div class="language-picker"><button id="language-trigger" class="language-trigger" data-action="language-menu" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="language-label language-current"><span class="language-mark">${selected.mark}</span><span id="language-current">${selected.name}</span>${icon("chevron")}</button>
      <div class="language-menu" id="language-menu" role="listbox" aria-labelledby="language-label" hidden>${languages.map((item) => `<button class="language-choice ${item.code === language ? "selected" : ""}" role="option" aria-selected="${item.code === language}" tabindex="-1" data-language="${item.code}"><span class="language-mark">${item.mark}</span><span>${item.name}</span>${item.code === language ? icon("check") : ""}</button>`).join("")}</div></div></div>
      <div class="setting-row"><span class="setting-label">${icon("sound")}${t("sound")}</span><button class="toggle ${sound ? "is-on" : ""}" data-action="sound" role="switch" aria-checked="${sound}" aria-label="${t("sound")}"><span></span></button></div>
      <div class="setting-row"><span class="setting-label">${icon("quality")}${t("quality")}</span><div class="segmented"><button class="${quality ? "selected" : ""}" data-quality="high" aria-pressed="${quality}">${t("high")}</button><button class="${!quality ? "selected" : ""}" data-quality="low" aria-pressed="${!quality}">${t("low")}</button></div></div>`;
  } else if (activeDialog === "guide") {
    dialog.innerHTML = `${close}<div class="modal-heading"><span class="modal-symbol">${icon("help")}</span><h2 id="dialog-title">${t("howTo")}</h2></div><div class="guide-list">
      ${(
        [
          ["route", "move", "guideMove"],
          ["jump", "jump", "guideJump"],
          ["slide", "slide", "guideSlide"],
          ["coin", "coinName", "guideCollect"],
        ] as const
      )
        .map(
          ([glyph, title, body], i) =>
            `<div class="guide-row"><span class="guide-icon guide-${i}">${icon(glyph)}</span><div><h3>${t(title)}</h3><p>${t(body)}</p></div></div>`,
        )
        .join(
          "",
        )}</div><button class="primary-button full-width" data-action="close">${t("gotIt")}${icon("check")}</button>`;
  } else if (activeDialog === "pause") {
    dialog.innerHTML = `${close}<div class="modal-heading"><span class="modal-symbol">${icon("pause")}</span><h2 id="dialog-title">${t("paused")}</h2></div><button class="primary-button full-width" data-action="resume">${icon("play")}${t("resume")}</button><div class="secondary-actions"><button class="secondary-button" data-action="restart">${icon("restart")}${t("restart")}</button><button class="secondary-button" data-action="home">${icon("home")}${t("home")}</button></div>`;
  } else if (activeDialog === "over") {
    const hint =
      game.lastHit === "log"
        ? "hitLog"
        : game.lastHit === "arch"
          ? "hitArch"
          : "hitRock";
    dialog.innerHTML = `<div class="result-heading"><span class="result-seal">${icon("trophy")}</span><h2 id="dialog-title">${t("over")}</h2>${newBest ? `<span class="record-tag">${t("newBest")}</span>` : ""}</div><div class="final-score"><span>${t("score")}</span><strong>${n(game.score)}</strong></div><div class="result-stats"><div><span class="stat-label">${icon("route")}${t("totalDistance")}</span><strong>${n(game.distance)}<small>m</small></strong></div><div><span class="stat-label">${icon("coin")}${t("collected")}</span><strong>${n(game.coins)}</strong></div></div><p class="collision-tip">${icon("help")}<span>${t(hint)}</span></p><div class="result-actions"><button class="primary-button" data-action="restart">${icon("restart")}${t("again")}</button><button class="secondary-button" data-action="home">${icon("home")}${t("home")}</button></div>`;
  }
}

function openDialog(type: NonNullable<typeof activeDialog>) {
  focusBeforeDialog = document.activeElement as HTMLElement;
  resumeOnClose = game.mode === "running" || game.mode === "intro";
  if (resumeOnClose) game.pause();
  activeDialog = type;
  renderDialog();
  if (!dialog.open) dialog.showModal();
  const title = dialog.querySelector<HTMLElement>("#dialog-title");
  if (title) {
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  }
}
function closeDialog() {
  const type = activeDialog;
  dialog.close();
  activeDialog = null;
  if (resumeOnClose || type === "pause") game.resume();
  resumeOnClose = false;
  focusBeforeDialog?.focus();
}
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  if (activeDialog !== "over") closeDialog();
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog && activeDialog !== "over") {
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      closeDialog();
  }
});

function syncView() {
  const ready = game.mode === "ready";
  document.body.classList.toggle("playing", !ready);
  document.body.classList.toggle("starting", game.introducing);
  document.querySelector<HTMLElement>("#intro")!.hidden = !ready;
  document.querySelector<HTMLElement>("#hud")!.hidden =
    ready || game.introducing;
  document.querySelector<HTMLElement>("#live-hint")!.hidden =
    ready || game.introducing;
  document.querySelector<HTMLElement>(".pause-button")!.hidden = ready;
}
function start() {
  if (!loaded) return;
  if (dialog.open) {
    dialog.close();
    activeDialog = null;
  }
  resumeOnClose = false;
  newBest = false;
  resultDelay = 0;
  document.body.classList.remove("crashed");
  game.begin();
  syncView();
  (document.activeElement as HTMLElement)?.blur();
}
function act(action: string) {
  if (action === "start" || action === "restart") start();
  else if (action === "settings") openDialog("settings");
  else if (action === "guide") openDialog("guide");
  else if (
    action === "pause" &&
    (game.mode === "running" || game.mode === "intro")
  )
    openDialog("pause");
  else if (action === "language-menu") {
    const trigger =
      dialog.querySelector<HTMLButtonElement>("#language-trigger")!;
    const menu = dialog.querySelector<HTMLElement>("#language-menu")!;
    menu.hidden = !menu.hidden;
    trigger.setAttribute("aria-expanded", String(!menu.hidden));
    if (!menu.hidden)
      menu.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  } else if (action === "close" || action === "resume") closeDialog();
  else if (action === "sound") {
    sound = !sound;
    save("sound", String(sound));
    document.querySelector("#sound-toggle")!.innerHTML = icon(
      sound ? "sound" : "mute",
    );
    document
      .querySelector("#sound-toggle")!
      .setAttribute("aria-pressed", String(sound));
    if (activeDialog === "settings") {
      renderDialog();
      dialog.querySelector<HTMLButtonElement>('[data-action="sound"]')?.focus();
    }
    if (sound) beep("coin");
  } else if (action === "home") {
    if (dialog.open) dialog.close();
    activeDialog = null;
    resumeOnClose = false;
    resultDelay = 0;
    document.body.classList.remove("crashed");
    game.returnHome();
    syncView();
    localize();
  }
}
document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-action], [data-quality], [data-language]",
  );
  if (!target) return;
  event.preventDefault();
  if (target.dataset.language) {
    language = resolveLanguage(target.dataset.language);
    save("language", language);
    localize();
    renderDialog();
    dialog.querySelector<HTMLButtonElement>("#language-trigger")?.focus();
  } else if (target.dataset.quality) {
    quality = target.dataset.quality === "high";
    save("quality", quality ? "high" : "low");
    world?.setQuality(quality);
    renderDialog();
    dialog
      .querySelector<HTMLButtonElement>(
        `[data-quality="${quality ? "high" : "low"}"]`,
      )
      ?.focus();
  } else if (target.dataset.action) act(target.dataset.action);
});

dialog.addEventListener("keydown", (event) => {
  const picker = (event.target as HTMLElement).closest(".language-picker");
  if (!picker) return;
  const menu = picker.querySelector<HTMLElement>("#language-menu")!;
  const trigger = picker.querySelector<HTMLButtonElement>("#language-trigger")!;
  if (event.key === "Escape" && !menu.hidden) {
    event.preventDefault();
    event.stopPropagation();
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
    return;
  }
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const options = Array.from(
      menu.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
    const current = options.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : (current + (event.key === "ArrowUp" ? -1 : 1) + options.length) %
            options.length;
    options[next]?.focus();
  }
  if (event.key === "Tab") {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }
});
dialog.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest(".language-picker")) return;
  const menu = dialog.querySelector<HTMLElement>("#language-menu");
  if (menu) {
    menu.hidden = true;
    dialog
      .querySelector("#language-trigger")
      ?.setAttribute("aria-expanded", "false");
  }
});

function control(direction: "left" | "right" | "jump" | "slide") {
  if (game.mode !== "running" || activeDialog) return;
  if (direction === "left") game.move(-1);
  if (direction === "right") game.move(1);
  if (direction === "jump" && game.jump()) beep("jump");
  if (direction === "slide" && game.slide()) beep("slide");
}
window.addEventListener("keydown", (event) => {
  if (activeDialog) return;
  if (event.code === "Escape" || event.code === "KeyP") {
    if (game.mode === "running" || game.mode === "intro") act("pause");
    return;
  }
  if (event.code === "Space" && game.mode === "ready") {
    event.preventDefault();
    start();
    return;
  }
  const keys: Record<string, "left" | "right" | "jump" | "slide"> = {
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
    ArrowUp: "jump",
    KeyW: "jump",
    Space: "jump",
    ArrowDown: "slide",
    KeyS: "slide",
  };
  if (keys[event.code]) {
    event.preventDefault();
    if (!event.repeat) control(keys[event.code]);
  }
});
let gesture: {
  x: number;
  y: number;
  id: number;
  direction: "left" | "right" | "jump" | "slide" | null;
} | null = null;
window.addEventListener("pointerdown", (event) => {
  if (
    game.mode !== "running" ||
    activeDialog ||
    (event.target as HTMLElement).closest("button,a,dialog")
  )
    return;
  gesture = {
    x: event.clientX,
    y: event.clientY,
    id: event.pointerId,
    direction: null,
  };
});
window.addEventListener("pointermove", (event) => {
  if (!gesture || gesture.id !== event.pointerId) return;
  // Track the swipe's furthest point so a reversal works without lifting.
  if (gesture.direction === "left")
    gesture.x = Math.min(gesture.x, event.clientX);
  if (gesture.direction === "right")
    gesture.x = Math.max(gesture.x, event.clientX);
  if (gesture.direction === "jump")
    gesture.y = Math.min(gesture.y, event.clientY);
  if (gesture.direction === "slide")
    gesture.y = Math.max(gesture.y, event.clientY);
  const dx = event.clientX - gesture.x,
    dy = event.clientY - gesture.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
  const direction =
    Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? "right"
        : "left"
      : dy < 0
        ? "jump"
        : "slide";
  if (direction !== gesture.direction) control(direction);
  gesture.direction = direction;
  gesture.x = event.clientX;
  gesture.y = event.clientY;
});
window.addEventListener("pointerup", () => {
  gesture = null;
});
window.addEventListener("pointercancel", () => {
  gesture = null;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (game.mode === "running" || game.mode === "intro"))
    openDialog("pause");
});
window.addEventListener("blur", () => {
  if (game.mode === "running" || game.mode === "intro") openDialog("pause");
});

localize();
syncView();
try {
  world = new ForestScene(
    document.querySelector<HTMLCanvasElement>("#world")!,
    quality,
  );
  let previous = performance.now();
  let lastCoins = 0;
  const rewards = document.querySelector<HTMLElement>("#coin-pop")!;
  world.scene.executeWhenReady(() => {
    loaded = true;
    document.querySelector("#loader")!.classList.add("finished");
    document.querySelector<HTMLButtonElement>(
      '[data-action="start"]',
    )!.disabled = false;
  });
  world.engine.runRenderLoop(() => {
    const now = performance.now(),
      dt = Math.min((now - previous) / 1000, 0.06);
    previous = now;
    const wasRunning = game.mode === "running";
    const previousMode = game.mode;
    game.update(dt);
    if (game.mode !== previousMode) syncView();
    const countdown = document.querySelector<HTMLElement>("#countdown")!;
    const count = game.mode === "intro" && !activeDialog ? game.countdown : "";
    if (countdown.textContent !== count) {
      countdown.textContent = count;
      countdown.hidden = !count;
      countdown.classList.toggle("go", count === "GO!");
      countdown.classList.remove("beat");
      void countdown.offsetWidth;
      countdown.classList.add("beat");
      if (count) beep(count === "GO!" ? "start" : "tick");
    }
    world!.update(game, dt);
    if (game.coins > lastCoins) {
      beep("coin");
      const reward = document.createElement("span");
      reward.className = "coin-reward";
      reward.textContent = `+${n((game.coins - lastCoins) * 50)}`;
      rewards.append(reward);
      reward.addEventListener("animationend", () => reward.remove(), {
        once: true,
      });
      const counter = document.querySelector<HTMLElement>(".coin-counter")!;
      counter.classList.remove("pulse");
      void counter.offsetWidth;
      counter.classList.add("pulse");
    }
    if (game.mode !== "running" || activeDialog) rewards.replaceChildren();
    if (rewards.childElementCount) {
      const anchor = world!.getRewardAnchor();
      rewards.style.left = `${anchor.x}px`;
      rewards.style.top = `${anchor.y}px`;
      rewards.style.visibility = anchor.visible ? "visible" : "hidden";
    }
    lastCoins = game.coins;
    document.querySelector("#score")!.textContent = n(game.score);
    document.querySelector("#distance")!.textContent = n(game.distance);
    document.querySelector("#coins")!.textContent = n(game.coins);
    document
      .querySelector<HTMLElement>("#live-hint")!
      .classList.toggle("faded", game.distance > 48);
    if (wasRunning && game.mode === "over") {
      beep("hit");
      newBest = game.score > best;
      if (newBest) {
        best = game.score;
        save("best", String(best));
      }
      resultDelay = 0.65;
      document.body.classList.add("crashed");
    }
    if (game.mode === "over" && !activeDialog) {
      resultDelay -= dt;
      if (resultDelay <= 0) openDialog("over");
    }
  });
} catch (error) {
  console.error("3D scene initialization failed", error);
  document.querySelector("#loader")!.innerHTML =
    `${icon("leaf")}<h2>${t("unsupported")}</h2><p>${t("unsupportedHint")}</p><button class="primary-button" id="reload">${t("retry")}</button>`;
  document
    .querySelector("#reload")!
    .addEventListener("click", () => location.reload());
}
