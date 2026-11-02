import "./style.css";
import { RunnerGame } from "./game.ts";
import { ForestScene } from "./scene.ts";
import { messages, resolveLanguage, languageTags } from "./i18n.ts";
import type { Language, MessageKey } from "./i18n.ts";

const icons: Record<string, string> = {
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l2-8Z"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  leaf: '<path d="M20 4C9 2 2 10 7 17s15 1 13-13Z"/><path d="m5 21 10-10"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3h3l2 3h3l1-3 3-1 2-3-2-2 1-3-2-3h-3l-2-3Z"/><circle cx="12" cy="12" r="3"/>',
  sound:
    '<path d="m11 4-6 5H2v6h3l6 5V4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5V4Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  trophy:
    '<path d="M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-5 1h10"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="m12 7-3 5 3 5 3-5-3-5Z"/>',
  route: '<path d="M5 20V4m0 0 5 4M5 4 1 8m18-4v16m0 0-5-4m5 4 4-4"/>',
  jump: '<path d="M5 19h14M12 15V3m-5 5 5-5 5 5"/>',
  slide:
    '<path d="m4 6 6 5-3 5h12m-4-4 4 4-4 4"/><circle cx="16" cy="6" r="2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  play: '<path d="m9 5 10 7-10 7V5Z"/>',
};
const icon = (name: string, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.leaf}</svg>`;
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
let activeDialog: "settings" | "pause" | "over" | "guide" | null = null;
let resumeOnClose = false;
let focusBeforeDialog: HTMLElement | null = null;
let world: ForestScene | null = null;
let loaded = false;
let audio: AudioContext | null = null;
const game = new RunnerGame();
const t = (key: MessageKey) => messages[language][key];
const n = (value: number) => numberFormatter.format(Math.floor(value));
const text = (key: MessageKey, tag = "span", cls = "") =>
  `<${tag} class="${cls}" data-i18n="${key}">${t(key)}</${tag}>`;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <canvas id="world" aria-label="3D"></canvas>
  <div class="vignette"></div>
  <div class="shell">
    <header class="header">
      <a class="brand" href="#" data-action="home" data-label="brand">
        <span class="brand-mark">${icon("bolt")}</span>
        <span>${text("brand", "strong")}<small>WILD DASH</small></span>
      </a>
      <div class="location"><span class="status-dot"></span>${text("forest")}<span class="location-separator">/</span>${icon("sun")}${text("weather")}</div>
      <div class="header-actions">
        <button class="icon-button pause-button" data-action="pause" data-label="pause" hidden>${icon("pause")}</button>
        <button class="icon-button" id="sound-toggle" data-action="sound" data-label="sound" aria-pressed="${sound}">${icon(sound ? "sound" : "mute")}</button>
        <button class="icon-button" data-action="settings" data-label="settings">${icon("settings")}</button>
      </div>
    </header>
    <main>
      <section class="intro" id="intro">
        <div class="eyebrow"><span class="eyebrow-line"></span>${text("eyebrow")}</div>
        <h1>${text("titleA", "span")}<br>${text("titleB", "span", "title-accent")}<span class="title-star">✳</span></h1>
        ${text("description", "p", "intro-description")}
        <div class="intro-actions"><button class="primary-button start-button" data-action="start" disabled>${text("start")}${icon("arrow")}</button><button class="help-button" data-action="guide" data-label="howTo">${icon("help")}</button></div>
        ${text("startHint", "p", "start-hint keyboard-only")}
        <div class="best-record">${icon("trophy")}<div>${text("best", "small")}<strong id="home-best">${n(best)} <span>${t("bestUnit")}</span></strong></div><span class="record-divider"></span>${text("ready", "span", "ready-label")}</div>
      </section>
      <section class="hud" id="hud" hidden data-label="score">
        <div class="hud-main">${text("score", "small")}<strong id="score">000000</strong></div>
        <div class="hud-secondary"><div>${icon("route")}<span><b id="distance">0</b><small> m</small></span></div><span class="hud-divider"></span><div class="coin-score">${icon("coin")}<b id="coins">0</b></div></div>
      </section>
      <div class="scene-label" id="scene-label"><span class="scene-label-number">01</span><div>${text("forest", "strong")}<small>THE WOODLAND TRAIL</small></div><span class="scene-label-line"></span></div>
      <div class="run-info" id="run-info" hidden><span class="status-dot"></span>${text("speed")}<strong id="speed">12</strong><small>m/s</small></div>
      <div class="coin-pop" id="coin-pop">+50</div>
      <div class="control-deck" id="controls">
        <div class="deck-heading">${icon("route")}${text("keyboard", "span", "keyboard-only")}${text("touch", "span", "touch-only")}</div>
        <div class="control-item"><div class="key-pair keyboard-only"><kbd>←</kbd><kbd>→</kbd></div><span class="gesture touch-only">↔</span><div>${text("move", "strong")}${text("moveHint", "small", "touch-only")}</div></div>
        <div class="control-item"><kbd class="keyboard-only">↑</kbd><span class="gesture touch-only">↑</span><div>${text("jump", "strong")}${text("jumpHint", "small", "touch-only")}</div></div>
        <div class="control-item"><kbd class="keyboard-only">↓</kbd><span class="gesture touch-only">↓</span><div>${text("slide", "strong")}${text("slideHint", "small", "touch-only")}</div></div>
        <span class="deck-tip">${t("tip")}</span>
      </div>
      <div class="live-hint" id="live-hint" hidden>${text("liveHint", "span", "keyboard-only")}${text("mobileHint", "span", "touch-only")}</div>
    </main>
    <footer><span class="footer-tag">${icon("leaf")}${text("footer")}</span><span class="footer-right">${text("level")}<span class="footer-dot">·</span><span>BABYLON.JS</span></span></footer>
  </div>
  <dialog id="dialog" aria-labelledby="dialog-title"></dialog>
  <div class="loader" id="loader"><div class="loader-leaf">${icon("leaf")}</div>${text("loading")}</div>
`;

function beep(kind: "coin" | "jump" | "slide" | "hit" | "start") {
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
  document.querySelector(".deck-tip")!.textContent = t("tip");
  document
    .querySelector('meta[name="description"]')!
    .setAttribute("content", t("description").replace("\n", " "));
}

const dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
function renderDialog() {
  const close = `<button class="icon-button dialog-close" data-action="close" aria-label="${t("close")}">${icon("close")}</button>`;
  if (activeDialog === "settings") {
    dialog.innerHTML = `${close}<span class="dialog-kicker">PREFERENCES</span><h2 id="dialog-title">${t("settings")}</h2>
      <section class="setting-section"><h3>${t("language")}</h3><p>${t("languageHint")}</p>
      <div class="language-grid">${(
        [
          ["zh", "简体中文", "你好"],
          ["en", "English", "Hello"],
          ["ja", "日本語", "こんにちは"],
          ["ko", "한국어", "안녕하세요"],
        ] as const
      )
        .map(
          ([code, name, hello]) =>
            `<button class="language-option ${code === language ? "selected" : ""}" data-language="${code}" aria-pressed="${code === language}"><span><strong>${name}</strong><small>${hello}</small></span>${code === language ? icon("check") : '<span class="radio-dot"></span>'}</button>`,
        )
        .join("")}</div></section>
      <div class="setting-row"><div><h3>${t("sound")}</h3><p>${t("soundHint")}</p></div><button class="toggle ${sound ? "is-on" : ""}" data-action="sound" role="switch" aria-checked="${sound}" aria-label="${t("sound")}"><span></span></button></div>
      <div class="setting-row quality-row"><div><h3>${t("quality")}</h3><p>${t("qualityHint")}</p></div><div class="segmented"><button class="${quality ? "selected" : ""}" data-quality="high">${t("high")}</button><button class="${!quality ? "selected" : ""}" data-quality="low">${t("low")}</button></div></div>
      <p class="storage-hint">${icon("check")}${t("storageHint")}</p>`;
  } else if (activeDialog === "guide") {
    dialog.innerHTML = `${close}<span class="dialog-kicker">FIELD GUIDE</span><h2 id="dialog-title">${t("guideTitle")}</h2><div class="guide-list">
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
    dialog.innerHTML = `${close}<div class="result-icon">${icon("leaf")}</div><span class="dialog-kicker">TAKE A BREATH</span><h2 id="dialog-title">${t("paused")}</h2><p class="dialog-description">${t("pauseHint")}</p><button class="primary-button full-width" data-action="resume">${t("resume")}${icon("play")}</button><button class="text-button full-width" data-action="restart">${t("restart")}</button><button class="text-button full-width subdued" data-action="home">${t("home")}</button>`;
  } else if (activeDialog === "over") {
    const hint =
      game.lastHit === "log"
        ? "hitLog"
        : game.lastHit === "arch"
          ? "hitArch"
          : "hitRock";
    dialog.innerHTML = `<div class="result-icon orange">${icon("trophy")}</div><span class="dialog-kicker">${newBest ? t("newBest") : "KEEP EXPLORING"}</span><h2 id="dialog-title">${t("over")}</h2><p class="dialog-description">${t(hint)}</p><div class="final-score"><strong>${n(game.score)}</strong><span>${t("score")}</span></div><div class="result-stats"><div><small>${t("totalDistance")}</small><strong>${n(game.distance)} <span>m</span></strong></div><div><small>${t("collected")}</small><strong>${icon("coin")}${n(game.coins)}</strong></div></div><button class="primary-button full-width" data-action="restart">${t("again")}${icon("arrow")}</button><button class="text-button full-width" data-action="home">${t("home")}</button>`;
  }
}

function openDialog(type: NonNullable<typeof activeDialog>) {
  focusBeforeDialog = document.activeElement as HTMLElement;
  resumeOnClose = game.mode === "running";
  if (resumeOnClose) game.pause();
  activeDialog = type;
  renderDialog();
  if (!dialog.open) dialog.showModal();
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
  document.querySelector<HTMLElement>("#intro")!.hidden = !ready;
  document.querySelector<HTMLElement>("#controls")!.hidden = !ready;
  document.querySelector<HTMLElement>("#scene-label")!.hidden = !ready;
  document.querySelector<HTMLElement>("#hud")!.hidden = ready;
  document.querySelector<HTMLElement>("#live-hint")!.hidden = ready;
  document.querySelector<HTMLElement>("#run-info")!.hidden = ready;
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
  game.start();
  beep("start");
  syncView();
  (document.activeElement as HTMLElement)?.blur();
}
function act(action: string) {
  if (action === "start" || action === "restart") start();
  else if (action === "settings") openDialog("settings");
  else if (action === "guide") openDialog("guide");
  else if (action === "pause" && game.mode === "running") openDialog("pause");
  else if (action === "close" || action === "resume") closeDialog();
  else if (action === "sound") {
    sound = !sound;
    save("sound", String(sound));
    document.querySelector("#sound-toggle")!.innerHTML = icon(
      sound ? "sound" : "mute",
    );
    document
      .querySelector("#sound-toggle")!
      .setAttribute("aria-pressed", String(sound));
    if (activeDialog === "settings") renderDialog();
    if (sound) beep("coin");
  } else if (action === "home") {
    if (dialog.open) dialog.close();
    activeDialog = null;
    resumeOnClose = false;
    game.mode = "ready";
    syncView();
    localize();
  }
}
document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-action], [data-language], [data-quality]",
  );
  if (!target) return;
  event.preventDefault();
  if (target.dataset.language) {
    language = resolveLanguage(target.dataset.language);
    save("language", language);
    localize();
    renderDialog();
    dialog.querySelector<HTMLElement>(`[data-language="${language}"]`)?.focus();
  } else if (target.dataset.quality) {
    quality = target.dataset.quality === "high";
    save("quality", quality ? "high" : "low");
    world?.setQuality(quality);
    renderDialog();
  } else if (target.dataset.action) act(target.dataset.action);
});

function control(direction: "left" | "right" | "jump" | "slide") {
  if (game.mode !== "running" || activeDialog) return;
  if (direction === "left") game.move(-1);
  if (direction === "right") game.move(1);
  if (direction === "jump" && game.y === 0 && !game.sliding) {
    game.jump();
    beep("jump");
  }
  if (direction === "slide" && game.y === 0 && !game.sliding) {
    game.slide();
    beep("slide");
  }
}
window.addEventListener("keydown", (event) => {
  if (activeDialog) return;
  if (event.code === "Escape" || event.code === "KeyP") {
    if (game.mode === "running") act("pause");
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
let gesture: { x: number; y: number; id: number } | null = null;
window.addEventListener("pointerdown", (event) => {
  if (
    game.mode !== "running" ||
    activeDialog ||
    (event.target as HTMLElement).closest("button,a,dialog")
  )
    return;
  gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
});
window.addEventListener("pointermove", (event) => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const dx = event.clientX - gesture.x,
    dy = event.clientY - gesture.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
  control(
    Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? "right"
        : "left"
      : dy < 0
        ? "jump"
        : "slide",
  );
  gesture = null;
});
window.addEventListener("pointerup", () => {
  gesture = null;
});
window.addEventListener("pointercancel", () => {
  gesture = null;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.mode === "running") openDialog("pause");
});
window.addEventListener("blur", () => {
  if (game.mode === "running") openDialog("pause");
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
    game.update(dt);
    world!.update(game, dt);
    if (game.coins > lastCoins) {
      beep("coin");
      const pop = document.querySelector<HTMLElement>("#coin-pop")!;
      pop.classList.remove("pop");
      void pop.offsetWidth;
      pop.classList.add("pop");
    }
    lastCoins = game.coins;
    document.querySelector("#score")!.textContent = String(game.score).padStart(
      6,
      "0",
    );
    document.querySelector("#distance")!.textContent = n(game.distance);
    document.querySelector("#coins")!.textContent = n(game.coins);
    document.querySelector("#speed")!.textContent = game.speed.toFixed(1);
    if (wasRunning && game.mode === "over") {
      beep("hit");
      newBest = game.score > best;
      if (newBest) {
        best = game.score;
        save("best", String(best));
      }
      openDialog("over");
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
