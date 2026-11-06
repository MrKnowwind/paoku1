import { GameAudio } from "./audio.ts";
import type { Sound } from "./audio.ts";
import { reportLoading } from "./loading.ts";
import "./style.css";
import { RunnerGame } from "./game.ts";
import { ForestScene } from "./scene.ts";
import { Economy } from "./economy.ts";
import { coreBiomes } from "./track.ts";
import type { CoreBiome } from "./track.ts";
import { CONFIG } from "./config.ts";
import { DAY_LENGTH, NIGHT_START, dayNumber, dayTime } from "./daylight.ts";
import { Tutorial } from "./tutorial.ts";
import type { GuideId, LessonId } from "./tutorial.ts";
import { SnowWeather } from "./snow-weather.ts";
import { artIcons, iconAsset } from "./art.ts";
import { messages, resolveLanguage, languageTags } from "./i18n.ts";
import type { MessageKey } from "./i18n.ts";

const icon = (name: string, cls = "") => {
  const artName = name === "route" ? "compass" : name;
  return `<img class="icon art-icon ${cls}" src="${iconAsset(artIcons.has(artName) ? artName : "leaf")}" alt="" aria-hidden="true" draggable="false" width="32" height="32" decoding="async">`;
};
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
let music = read("music") !== "false";
const audio = new GameAudio();
audio.soundEnabled = sound;
audio.musicEnabled = music;
window.addEventListener("pointerdown", () => audio.unlock(), {capture: true});
window.addEventListener("keydown", () => audio.unlock(), {capture: true});
let quality = new URLSearchParams(location.search).get("quality") !== "low" && read("quality") !== "low";
let terrainOverride = read("terrain-override") === "true";
let startAtNight = read("start-at-night") === "true";
let terrainTarget: CoreBiome = coreBiomes.find(b => b === read("terrain-target")) ?? "snow";
let best = Math.max(0, Number(read("best")) || 0);
let newBest = false;
let resultDelay = 0;
let activeDialog:
  | "settings"
  | "pause"
  | "over"
  | "guide"
  | "shop"
  | "revive"
  | null = null;
let guideReviewFrom: "settings" | "guide" = "guide";
let runFinalized = false;
let buyBusyUntil = 0;
let toastTimer = 0;
let statusMarkup = "";
let resumeOnClose = false;
let focusBeforeDialog: HTMLElement | null = null;
let world: ForestScene | null = null;
let loaded = false;
const languages = [
  { code: "zh", name: "简体中文", mark: "中" },
  { code: "en", name: "English", mark: "EN" },
  { code: "ja", name: "日本語", mark: "あ" },
  { code: "ko", name: "한국어", mark: "한" },
] as const;
const economy = new Economy({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});
const game = new RunnerGame({ onCoins: (count) => economy.credit(count) });
let testTutorials = read("test-tutorials") === "true";
let learnedLessons: string[] = [];
try {
  const saved = JSON.parse(read("lessons:v1") ?? "[]");
  if (Array.isArray(saved))
    learnedLessons = saved.filter((value) => typeof value === "string");
} catch {}
const tutorial = new Tutorial(
  learnedLessons,
  (lessons) => save("lessons:v1", JSON.stringify(lessons)),
  testTutorials,
);
const t = (key: MessageKey) => messages[language][key];
const n = (value: number) => numberFormatter.format(Math.floor(value));
const text = (key: MessageKey, tag = "span", cls = "") =>
  `<${tag} class="${cls}" data-i18n="${key}">${t(key)}</${tag}>`;
const clockSegments = [
  {phase: "day", length: CONFIG.daylight, start: 0},
  {phase: "dusk", length: CONFIG.dusk, start: CONFIG.daylight},
  {phase: "night", length: CONFIG.night, start: NIGHT_START},
].map(({phase, length, start}) => `<circle class="dial-${phase}" cx="24" cy="24" r="19" pathLength="${DAY_LENGTH}"
  stroke-dasharray="${length} ${DAY_LENGTH - length}" stroke-dashoffset="${-start}" transform="rotate(-90 24 24)"/>`).join("");

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <canvas id="world" aria-label="3D"></canvas>
  <aside id="night-hud" class="night-hud" hidden>
    <div class="night-weapon"><span class="weapon-icon"></span><div class="shot-meter"><i></i></div></div>
    <div><div class="ammo-slots"></div><small class="ammo-status"></small></div>
  </aside>
  <canvas id="snow-weather" aria-hidden="true" hidden></canvas>
  <section id="cold-hud" class="cold-hud" hidden role="meter" aria-valuemin="0" aria-valuemax="${CONFIG.coldMax}">
    <svg class="cold-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20M3.34 7l17.32 10M3.34 17 20.66 7M9 5l3 3 3-3M9 19l3-3 3 3M4.44 11l4.09-1.1-1.1-4.1M19.56 13l-4.09 1.1 1.1 4.1M7.43 18.2l1.1-4.1-4.09-1.1M16.57 5.8l-1.1 4.1 4.09 1.1"/></svg>
    <div class="cold-track"><i id="cold-fill"></i></div>
  </section>

  <div class="terrain-guide" id="terrain-guide" hidden role="dialog" aria-modal="true" aria-labelledby="guide-page-title" aria-describedby="guide-copy" tabindex="-1">
    <article class="guide-card">
      <header class="guide-card-heading">
        <div><span id="guide-kicker"></span><h2 id="guide-page-title"></h2></div>
        <button id="guide-review-close" class="guide-close" data-action="guide-review-close" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </header>
      <div class="guide-stage">
        <div id="guide-viewport" aria-hidden="true"></div>
        <div id="guide-stage-top" class="guide-stage-labels" aria-hidden="true"></div>
        <div id="guide-stage-bottom" class="guide-stage-labels" aria-hidden="true"></div>
      </div>
      <section class="guide-card-copy" tabindex="0"><div id="guide-meter-slot"></div><p id="guide-copy"></p><small id="guide-detail"></small></section>
      <footer class="guide-card-footer">
        <button class="guide-arrow" id="guide-prev" data-action="guide-prev"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>
        <div class="guide-pagination">
          <span id="guide-progress" aria-live="polite"></span>
          <small id="guide-swipe-hint"></small>
          <button class="guide-done" id="guide-done" data-action="guide-done" hidden></button>
        </div>
        <button class="guide-arrow" id="guide-next" data-action="guide-next"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
      </footer>
    </article>
  </div>
  <div class="vignette"></div><div class="impact-flash"></div>
  <div class="shell">
    <header class="header">
      <a class="brand" href="#" data-action="home" data-label="brand">
        <span class="brand-mark">${icon("leaf")}</span>
      </a>
      <section class="hud" id="hud" hidden data-label="score">
        <div class="hud-main"><strong id="score" data-label="score">0</strong></div>
        <div class="hud-secondary">
          <span class="distance-counter" data-label="distance">${icon("route")}<span><b id="distance">0</b><small>m</small></span></span>
          <span class="coin-counter" data-label="coins">${icon("coin")}<b id="coins">0</b></span>
        </div>
        <div id="day-clock" class="day-clock" role="img">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle class="dial-face" cx="24" cy="24" r="23"/>
            <g class="dial-arcs">${clockSegments}</g>
            <g class="phase-glyph glyph-day"><circle cx="24" cy="20" r="3.4"/><path d="M24 12.8v2.2m0 10v2.2m-7.2-7.2H19m10 0h2.2m-12.3-5.1 1.5 1.5m7.2 7.2 1.5 1.5m-10.2 0 1.5-1.5m7.2-7.2 1.5-1.5"/></g>
            <g class="phase-glyph glyph-dusk"><path d="M17 24h14m-11-3a4 4 0 0 1 8 0m-4-9v2m-6.2 1.5 1.5 1.5m9.4 0 1.5-1.5"/></g>
            <g class="phase-glyph glyph-night"><path d="M26.7 13.6a6.4 6.4 0 1 0 4.2 9.7 6.4 6.4 0 0 1-4.2-9.7Z"/></g>
            <text id="clock-day" x="24" y="34" text-anchor="middle">1</text>
            <circle id="clock-dot" cx="24" cy="5" r="2.9"/>
          </svg>
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
        <h1>${text("titleA", "span")}${text("titleB", "span", "title-accent")}</h1>
        <button class="primary-button start-button" data-action="start" disabled>${icon("play")}${text("start")}</button>
        <button class="supply-button" data-action="shop">${icon("shop")}${text("shop")}<span>${icon("coin")}<b class="wallet-count">${n(economy.state.wallet)}</b></span></button>
        <div class="best-record" data-label="best">${icon("trophy")}<strong id="home-best">${n(best)}</strong></div>
      </section>
    </main>
    <footer><button class="icon-button help-button" data-action="guide" data-label="howTo">${icon("help")}</button></footer>
  </div>
  <section class="run-status" id="run-status" hidden aria-label="${t("powerStatus")}"></section>
  <button class="active-tool" id="booster-button" data-action="boost" data-label="activateBoost" hidden>${icon("rocket")}<span id="booster-status"></span></button>
  <div class="notice-toast" id="notice-toast" hidden role="status"></div>
  <div class="tutorial-overlay" id="tutorial-overlay" hidden>
    <div class="tutorial-prompt" id="tutorial-prompt">
      <strong id="tutorial-title" role="status"></strong>
    </div>
  </div>
  <dialog id="dialog" aria-labelledby="dialog-title"></dialog>
  <div id="countdown" class="countdown" hidden aria-live="polite" aria-atomic="true"></div>
`;

const worldCanvas = document.querySelector<HTMLCanvasElement>("#world")!;
const dayClock = document.querySelector<HTMLElement>("#day-clock")!;
const clockDay = document.querySelector<SVGTextElement>("#clock-day")!;
const clockDot = document.querySelector<SVGCircleElement>("#clock-dot")!;
const nightHud = document.querySelector<HTMLElement>("#night-hud")!;
const ammoSlots = nightHud.querySelector<HTMLElement>(".ammo-slots")!;
const ammoStatus = nightHud.querySelector<HTMLElement>(".ammo-status")!;
const shotMeter = nightHud.querySelector<HTMLElement>(".shot-meter i")!;

function beep(kind: Sound) {
  audio.play(kind);
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
  document.querySelector("#home-best")!.textContent = n(best);
  document
    .querySelector('meta[name="description"]')!
    .setAttribute("content", t("description").replace("\n", " "));
}

const dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
function renderDialog() {
  dialog.dataset.view = activeDialog ?? "";
  const close = activeDialog === "pause" || activeDialog === "revive" ? "" : `<button class="icon-button dialog-close" data-action="close" aria-label="${t("close")}">${icon("close")}</button>`;
  if (activeDialog === "shop") {
    const state = economy.state;
    const product = (
      kind: "booster" | "hourglass",
      glyph: string,
      price: number,
    ) => {
      const unavailable = state.wallet < price;
      return `<article class="supply-card"><span class="supply-icon">${icon(glyph)}</span><div><h3>${t(kind)}</h3><p>${t(kind === "booster" ? "boosterDesc" : "hourglassDesc")}</p><small aria-label="${t("stock")}">×${n(kind === "booster" ? state.boosters : state.hourglasses)}</small></div><div class="purchase-row"><span>${icon("coin")}${n(price)}</span><button class="secondary-button" data-action="buy-${kind}" ${unavailable ? "disabled" : ""}>${t(unavailable ? "insufficient" : "buy")}</button></div></article>`;
    };
    dialog.innerHTML = `${close}<div class="modal-heading"><span class="modal-symbol">${icon("shop")}</span><h2 id="dialog-title">${t("shop")}</h2></div><div class="shop-wallet" aria-label="${t("wallet")}"><strong>${icon("coin")}<span class="wallet-count">${n(state.wallet)}</span></strong></div>${product("booster", "rocket", CONFIG.boosterPrice)}${product("hourglass", "hourglass", CONFIG.hourglassPrice)}`;
  } else if (activeDialog === "revive") {
    const usable = game.canRewind && economy.state.hourglasses > 0;
    const hint = game.hourglassUsed
      ? "alreadyRevived"
      : economy.state.hourglasses === 0
        ? "noHourglass"
        : "reviveHint";
    const wolfHit = game.lastHit === "wolf" ? `<p class="revive-copy">${t("wolfHit")}</p>` : "";
    dialog.innerHTML = `${close}<div class="modal-heading"><span class="modal-symbol">${icon("hourglass")}</span><h2 id="dialog-title">${t("reviveTitle")}</h2></div>${wolfHit}${usable ? "" : `<p class="revive-copy">${t(hint)}</p>`}<div class="revive-stock" aria-label="${t("stock")}">${icon("hourglass")}×${n(economy.state.hourglasses)}</div><button class="primary-button full-width" data-action="rewind" ${usable ? "" : "disabled"}>${icon("hourglass")}${t("useHourglass")}</button><button class="secondary-button full-width finish-run" data-action="finish">${t("finishRun")}</button>`;
  } else if (activeDialog === "settings") {
    const selected = languages.find((item) => item.code === language)!;
    dialog.innerHTML = `${close}<div class="modal-heading"><span class="modal-symbol">${icon("settings")}</span><h2 id="dialog-title">${t("settings")}</h2></div>
      <div class="setting-row language-row"><span class="setting-label" id="language-label">${icon("language")}${t("language")}</span>
      <div class="language-picker"><button id="language-trigger" class="language-trigger" data-action="language-menu" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="language-label language-current"><span class="language-mark">${selected.mark}</span><span id="language-current">${selected.name}</span>${icon("chevron")}</button>
      <div class="language-menu" id="language-menu" role="listbox" aria-labelledby="language-label" hidden>${languages.map((item) => `<button class="language-choice ${item.code === language ? "selected" : ""}" role="option" aria-selected="${item.code === language}" tabindex="-1" data-language="${item.code}"><span class="language-mark">${item.mark}</span><span>${item.name}</span>${item.code === language ? icon("check") : ""}</button>`).join("")}</div></div></div>
      <div class="setting-row"><span class="setting-label">${icon("music")}${t("music")}</span><button class="toggle ${music ? "is-on" : ""}" data-action="music" role="switch" aria-checked="${music}" aria-label="${t("music")}"><span></span></button></div>
      <div class="setting-row"><span class="setting-label">${icon("sound")}${t("sound")}</span><button class="toggle ${sound ? "is-on" : ""}" data-action="sound" role="switch" aria-checked="${sound}" aria-label="${t("sound")}"><span></span></button></div>
      <div class="setting-row"><span class="setting-label">${icon("quality")}${t("quality")}</span><div class="segmented"><button class="${quality ? "selected" : ""}" data-quality="high" aria-pressed="${quality}">${t("high")}</button><button class="${!quality ? "selected" : ""}" data-quality="low" aria-pressed="${!quality}">${t("low")}</button></div></div>
      <div class="setting-row"><div class="setting-copy"><span class="setting-label">${t("terrainOverride")}</span><small>${t("terrainOverrideHint")}</small></div><button class="toggle ${terrainOverride ? "is-on" : ""}" data-action="terrain-override" role="switch" aria-checked="${terrainOverride}" aria-label="${t("terrainOverride")}"><span></span></button></div>
      <div class="terrain-selector" role="radiogroup" aria-label="${t("terrainOverride")}">${coreBiomes.map(b => `<button role="radio" aria-checked="${terrainTarget === b}" data-terrain="${b}" ${terrainOverride ? "" : "disabled"} class="${terrainTarget === b ? "selected" : ""}">${t(b)}</button>`).join("")}</div>
      <div class="setting-row"><div class="setting-copy"><span class="setting-label">${t("startAtNight")}</span><small>${t("terrainOverrideHint")}</small></div><button class="toggle ${startAtNight ? "is-on" : ""}" data-action="start-at-night" role="switch" aria-checked="${startAtNight}" aria-label="${t("startAtNight")}"><span></span></button></div>
      <div class="setting-row"><div class="setting-copy"><span class="setting-label">${icon("help")}${t("tutorialTest")}</span></div><button class="toggle ${testTutorials ? "is-on" : ""}" data-action="tutorial-test" role="switch" aria-checked="${testTutorials}" aria-label="${t("tutorialTest")}"><span></span></button></div>
      <button class="secondary-button full-width" data-action="night-guide">${t("nightGuide")}</button>`;
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
        )}</div><div class="guide-links"><button class="secondary-button" data-action="snow-guide">${t("snowGuide")}</button><button class="secondary-button" data-action="ocean-guide">${t("oceanGuide")}</button><button class="secondary-button" data-action="night-guide">${t("nightGuide")}</button></div>`;
  } else if (activeDialog === "pause") {
    dialog.innerHTML = `${close}<div class="modal-heading"><span class="modal-symbol">${icon("pause")}</span><h2 id="dialog-title">${t("paused")}</h2></div><button class="primary-button full-width" data-action="resume">${icon("play")}${t("resume")}</button><div class="secondary-actions"><button class="secondary-button" data-action="restart">${icon("restart")}${t("restart")}</button><button class="secondary-button" data-action="home">${icon("home")}${t("home")}</button></div>`;
  } else if (activeDialog === "over") {
    const hint =
      game.lastHit === "wolf" ? "wolfHit" :
      game.lastHit === "cold" ? "coldHint" : ["pool", "fire"].includes(game.lastHit ?? "") ? "snowDeathHint" :
      ["bubble", "coral", "volcano", "fish"].includes(game.lastHit ?? "")
        ? "lessonSwim"
        : game.lastHit === "wall-rock"
        ? "wallHint"
        : game.lastHit === "gap"
          ? "fallHint"
          : ["log", "stump", "snow-log"].includes(game.lastHit ?? "")
            ? game.terrain.biome === "canyon"
              ? "canyonLogHint"
              : "hitLog"
            : game.lastHit === "arch"
              ? game.terrain.biome === "canyon"
                ? "canyonArchHint"
                : "hitArch"
              : "hitRock";
    dialog.innerHTML = `<div class="result-heading"><span class="result-seal">${icon("trophy")}</span><h2 id="dialog-title">${t("over")}</h2>${newBest ? `<span class="record-tag">${t("newBest")}</span>` : ""}</div><div class="final-score"><span>${t("score")}</span><strong>${n(game.score)}</strong></div><div class="result-stats"><div><span class="stat-label" aria-label="${t("totalDistance")}">${icon("route")}</span><strong>${n(game.distance)}<small>m</small></strong></div><div><span class="stat-label" aria-label="${t("collected")}">${icon("coin")}</span><strong>${n(game.coins)}</strong></div></div><p class="collision-tip">${icon("help")}<span>${t(hint)}</span></p><div class="result-actions"><button class="primary-button" data-action="restart">${icon("restart")}${t("again")}</button><button class="secondary-button" data-action="home">${icon("home")}${t("home")}</button></div>`;
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
  if (activeDialog === "revive") {
    finishRun();
    activeDialog = "over";
    renderDialog();
    return;
  }
  if (activeDialog === "shop" && game.mode === "over") {
    activeDialog = "over";
    renderDialog();
    return;
  }
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
  document.body.classList.toggle("rewinding", game.mode === "rewinding");
  document.body.classList.toggle("playing", !ready);
  document.body.classList.toggle("starting", game.introducing);
  document.querySelector<HTMLElement>("#intro")!.hidden = !ready;
  document.querySelector<HTMLElement>("#hud")!.hidden =
    ready || game.introducing;
  document.querySelector<HTMLElement>(".pause-button")!.hidden =
    ready || game.mode === "rewinding";
}
function start() {
  if (!loaded) return;
  if (dialog.open) {
    dialog.close();
    activeDialog = null;
  }
  if (game.mode === "over") finishRun();
  runFinalized = false;
  resumeOnClose = false;
  newBest = false;
  resultDelay = 0;
  document.body.classList.remove("crashed");
  game.nextTerrain = terrainOverride ? terrainTarget : null;
  game.begin(startAtNight);
  // Commit the directed exit now; visuals still load only near that section.
  game.track.at(CONFIG.forestLength);
  tutorial.resetRun(game);
  syncView();
  (document.activeElement as HTMLElement)?.blur();
}
function finishRun() {
  if (runFinalized) return;
  runFinalized = true;
  newBest = game.score > best;
  if (newBest) {
    best = game.score;
    save("best", String(best));
  }
}
function showToast(message: string) {
  if (dialog.open) {
    let inline = dialog.querySelector<HTMLElement>("#inline-notice");
    if (!inline) {
      inline = document.createElement("p");
      inline.id = "inline-notice";
      inline.className = "inline-notice";
      inline.setAttribute("role", "status");
      dialog.append(inline);
    }
    inline.textContent = message;
    return;
  }
  const toast = document.querySelector<HTMLElement>("#notice-toast")!;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}
const lessonTitles: Record<LessonId, MessageKey> = {
  night: "nightGuide",
  snow: "snowGuide",
  ocean: "oceanGuide",
  move: "lessonMove",
  jump: "lessonJump",
  slide: "lessonSlide",
  dodge: "lessonDodge",
  coin: "lessonCoin",
  magnet: "lessonMagnet",
  shield: "lessonShield",
  wallEntry: "lessonWallEntry",
  wallHeight: "lessonWallHeight",
  booster: "lessonBooster",
  hourglass: "lessonHourglass",
};
const guidePanel = document.querySelector<HTMLElement>("#terrain-guide")!;
const guideCopy = guidePanel.querySelector<HTMLElement>(".guide-card-copy")!;
const guidePrev = document.querySelector<HTMLButtonElement>("#guide-prev")!;
const guideNext = document.querySelector<HTMLButtonElement>("#guide-next")!;
const guideDone = document.querySelector<HTMLButtonElement>("#guide-done")!;
const guideClose = document.querySelector<HTMLButtonElement>("#guide-review-close")!;
const weather = new SnowWeather(document.querySelector<HTMLCanvasElement>("#snow-weather")!);
const guideNumbers: Record<string, number> = {
  base: CONFIG.coldRate,
  storm: CONFIG.coldRate * CONFIG.blizzardColdMultiplier,
  ice: CONFIG.iceDistance,
  drift: CONFIG.snowdriftCold,
  snowman: CONFIG.snowmanCold,
  fire: CONFIG.fireWarmth,
  liquor: CONFIG.liquorWarmth,
};
const guidePages: Record<GuideId, {title: MessageKey; copy: MessageKey; detail?: MessageKey; top?: MessageKey[]; bottom?: MessageKey[]}[]> = {
  snow: [
    {title: "cold", copy: "snowLessonCold"},
    {title: "threats", copy: "snowLessonThreats", detail: "snowLessonFatal", top: ["guideFatal", "guideJumpOver"], bottom: ["guideIce", "guideChill"]},
    {title: "warmth", copy: "snowLessonWarmth", detail: "snowExceptions"},
  ],
  ocean: [
    {title: "oceanGrid", copy: "oceanGridCopy"},
    {title: "oceanHazards", copy: "oceanHazardsCopy", bottom: ["oceanBubble", "oceanCoral", "oceanVent"]},
    {title: "oceanFish", copy: "oceanFishCopy"},
  ],
  night: [
    {title: "nightShooting", copy: "nightShootingCopy"},
    {title: "nightAttacks", copy: "nightAttacksCopy"},
    {title: "nightSupplies", copy: "nightSuppliesCopy"},
  ],
};

function updateGuideUi() {
  const guide = !activeDialog ? tutorial.guide : null;
  const step = tutorial.guideStep;
  const key = `${guide}/${step}/${language}`;
  const newlyOpened = guidePanel.hidden && !!guide;
  guidePanel.hidden = !guide;
  document.body.classList.toggle("terrain-teaching", !!guide);
  if (guide && (newlyOpened || guidePanel.dataset.page !== key)) {
    gesture = guideSwipe = null;
    guidePanel.dataset.page = key;
    guidePanel.dataset.terrain = guide;
    guideCopy.scrollTop = 0;
    guideClose.hidden = !tutorial.reviewingGuide;
    guideClose.setAttribute("aria-label", t("close"));
    guidePrev.setAttribute("aria-label", t("guidePrev"));
    guideNext.setAttribute("aria-label", t("guideNext"));
    guidePrev.disabled = step === 1;
    guideNext.disabled = step === 3;
    guideDone.hidden = step !== 3;
    guideDone.textContent = t("gotIt");
    const swipeHint = document.querySelector<HTMLElement>("#guide-swipe-hint")!;
    swipeHint.hidden = step === 3;
    swipeHint.textContent = t("guideSwipe");
    document.querySelector("#guide-progress")!.textContent = `${n(step)} / ${n(3)}`;
    document.querySelector("#guide-kicker")!.textContent = t(lessonTitles[guide]);
    const page = guidePages[guide][step - 1];
    document.querySelector("#guide-page-title")!.textContent = t(page.title);
    const decimals = new Intl.NumberFormat(languageTags[language], {maximumFractionDigits: 3});
    document.querySelector("#guide-copy")!.textContent = t(page.copy)
      .replace(/\{(\w+)\}/g, (_, name: string) => decimals.format(guideNumbers[name]));
    document.querySelector("#guide-detail")!.textContent = page.detail ? t(page.detail) : "";
    const labels = (keys: MessageKey[] = []) => keys.map(label => `<span>${t(label)}</span>`).join("");
    document.querySelector("#guide-stage-top")!.innerHTML = labels(page.top);
    document.querySelector("#guide-stage-bottom")!.innerHTML = labels(page.bottom);
    if (newlyOpened || !guidePanel.contains(document.activeElement) || document.activeElement === guidePrev && guidePrev.disabled)
      guidePanel.focus({preventScroll: true});
    else if (document.activeElement === guideNext && guideNext.disabled) guideDone.focus({preventScroll: true});
  }
  const cold = document.querySelector<HTMLElement>("#cold-hud")!;
  const sample = guide === "snow" && step === 1;
  cold.hidden = !sample && (!game.inSnow || game.mode === "ready" || !!guide);
  const meterSlot = document.querySelector<HTMLElement>("#guide-meter-slot")!;
  if (sample && cold.parentElement !== meterSlot) meterSlot.append(cold);
  else if (!sample && cold.parentElement === meterSlot) document.querySelector("#app")!.append(cold);
  cold.classList.toggle("teaching", sample);
  document.body.classList.toggle("cold-visible", !cold.hidden && !guide);
  cold.classList.toggle("critical", !sample && game.cold >= 75);
  const value = sample ? 40 : game.cold;
  cold.setAttribute("aria-label", t(sample ? "snowMeterSample" : "cold"));
  cold.setAttribute("aria-valuenow", String(Math.floor(value)));
  document.querySelector<HTMLElement>("#cold-fill")!.style.width = `${value / CONFIG.coldMax * 100}%`;
  cold.classList.toggle("warming", !sample && game.coldFeedback > 0 && game.coldDelta < 0);
}

function returnFromGuideReview(guide: GuideId) {
  activeDialog = guideReviewFrom;
  updateGuideUi();
  renderDialog();
  dialog.showModal();
  dialog.querySelector<HTMLElement>(`[data-action="${guide}-guide"]`)?.focus({preventScroll: true});
}
function guideAction(action: string) {
  const guide = tutorial.guide;
  if (!guide || activeDialog) return;
  const review = tutorial.reviewingGuide;
  if (action === "guide-prev") tutorial.turnGuide(-1);
  else if (action === "guide-next") tutorial.turnGuide(1);
  else if (action === "guide-done") tutorial.finishGuide();
  else if (action === "guide-review-close") tutorial.closeGuideReview();
  gesture = guideSwipe = null;
  if (review && !tutorial.reviewingGuide) returnFromGuideReview(guide);
  else {
    updateGuideUi();
    if (guideDone.hidden && guidePanel.contains(document.activeElement) && document.activeElement === guideDone)
      guideNext.focus({preventScroll: true});
  }
}
function updateTutorialUi() {
  const overlay = document.querySelector<HTMLElement>("#tutorial-overlay")!;
  const lesson = tutorial.active;
  overlay.hidden = !lesson || !!tutorial.guide || game.mode !== "running" || !!activeDialog;
  if (lesson) document.querySelector("#tutorial-title")!.textContent = t(lessonTitles[lesson.id]);
}
function updateNightUi() {
  const time = game.worldTime;
  const phase = game.phase;
  const day = n(dayNumber(time));
  const label = `${t("clockDay").replace("{day}", day)} · ${t(phase === "day" ? "phaseDay" : phase === "dusk" ? "phaseDusk" : "phaseNight")}`;
  if (dayClock.getAttribute("aria-label") !== label) {
    dayClock.setAttribute("aria-label", label);
    dayClock.dataset.phase = phase;
    clockDay.textContent = day;
  }
  clockDot.setAttribute("transform", `rotate(${360 * dayTime(time) / DAY_LENGTH} 24 24)`);
  nightHud.hidden = !game.nightGearActive || game.mode === "over" || game.introducing || !!tutorial.guide;
  if (nightHud.hidden) return;
  if (!ammoSlots.childElementCount) {
    nightHud.querySelector(".weapon-icon")!.innerHTML = icon("slingshot");
    ammoSlots.innerHTML = Array.from({length: CONFIG.nightCombat.ammo}, () => icon("stone")).join("");
  }
  const combat = game.nightCombat;
  const ammo = `${n(combat.ammo)} / ${n(CONFIG.nightCombat.ammo)}`;
  nightHud.setAttribute("aria-label", `${t("slingshot")} · ${t("ammo")} ${ammo}`);
  Array.from(ammoSlots.children).forEach((slot, index) => slot.classList.toggle("spent", index >= combat.ammo));
  nightHud.classList.toggle("refilled", combat.refillFlash > 0);
  shotMeter.style.transform = `scaleX(${1 - combat.cooldown / CONFIG.nightCombat.cooldown})`;
  ammoStatus.textContent = combat.refillFlash > 0 ? t("ammoRefill") + (combat.refillGain ? ` +${n(combat.refillGain)}` : "") :
    combat.ammo === 0 ? t("ammoEmpty") : combat.cooldown > 0 ? t("shotCooldown") : ammo;
}
function updateFeatureUi() {
  const state = economy.state;
  document.querySelectorAll<HTMLElement>(".wallet-count").forEach(element => {
    element.textContent = n(state.wallet);
  });
  const status = document.querySelector<HTMLElement>("#run-status")!;
  const rewind = game.mode === "rewinding";
  const powers = [
    {glyph: "magnet", label: t("magnet"), time: game.magnetTime, duration: CONFIG.magnetDuration, active: game.magnetTime > 0},
    {glyph: game.shield ? "shield" : "protection", label: t(game.shield ? "shield" : "briefProtection"), time: game.shield ? game.shieldTime : game.protectionTime, duration: game.shield ? CONFIG.shieldDuration : CONFIG.rewindProtection, active: game.shield || game.protectionTime > 0},
    {glyph: rewind ? "hourglass" : "rocket", label: t(rewind ? "hourglass" : "booster"), time: rewind ? game.rewindRemaining : game.boostRemaining, duration: rewind ? CONFIG.rewindDuration : CONFIG.boostDistance, active: rewind || game.boosting},
  ].filter(power => power.active);
  status.hidden = (game.mode !== "running" && !rewind) || !powers.length;
  const markup = powers.map(({glyph}) => `<div class="power-slot" data-power="${glyph}" role="img">${icon(glyph)}<div class="power-meter"><i></i></div></div>`).join("");
  if (markup !== statusMarkup) {
    statusMarkup = markup;
    status.innerHTML = markup;
  }
  for (const {glyph, label, time, duration} of powers) {
    const slot = status.querySelector<HTMLElement>(`[data-power="${glyph}"]`)!;
    slot.setAttribute("aria-label", label);
    slot.classList.toggle("is-ending", time / duration < 0.22);
    slot.querySelector<HTMLElement>(".power-meter i")!.style.transform = `scaleX(${Math.min(1, time / duration)})`;
  }
  const button = document.querySelector<HTMLButtonElement>("#booster-button")!;
  button.hidden = game.mode === "ready" || game.introducing;
  button.disabled = state.boosters <= 0 || game.mode !== "running" || game.boosting || game.icy ||
    !!tutorial.guide || game.boostCooldown > 0;
  button.classList.toggle("tool-live", game.boosting);
  document.querySelector("#booster-status")!.textContent = game.boosting ? "" :
    game.boostCooldown > 0 ? `${Math.ceil(game.boostCooldown)}s` : `×${n(state.boosters)}`;
  updateNightUi();
}
function act(action: string) {
  if (tutorial.guide && !activeDialog) { guideAction(action); return; }
  if (action === "terrain-override") {
    terrainOverride = !terrainOverride; save("terrain-override", String(terrainOverride)); renderDialog(); return;
  }
  if (action === "snow-guide" || action === "ocean-guide" || action === "night-guide") {
    guideReviewFrom = activeDialog === "settings" ? "settings" : "guide";
    dialog.close();
    activeDialog = null;
    tutorial.reviewGuide(action === "snow-guide" ? "snow" : action === "ocean-guide" ? "ocean" : "night");
    updateGuideUi();
    return;
  }
  if (action === "shop") {
    if (game.mode === "ready" || (game.mode === "over" && runFinalized))
      openDialog("shop");
    return;
  }
  if (action === "buy-booster" || action === "buy-hourglass") {
    if (activeDialog !== "shop" || performance.now() < buyBusyUntil) return;
    buyBusyUntil = performance.now() + 400;
    const result = economy.buy(
      action === "buy-booster" ? "booster" : "hourglass",
    );
    renderDialog();
    showToast(
      t(
        result === "ok"
          ? "buySuccess"
          : result === "funds"
            ? "insufficient"
            : result === "owned"
              ? "owned"
              : "storageError",
      ),
    );
    return;
  }
  if (action === "boost") {
    if (game.activateBooster(economy.state.boosters > 0, () => {
      const consumed = economy.consumeBooster();
      if (!consumed) showToast(t("storageError"));
      return consumed;
    })) {
      tutorial.complete("booster");
      beep("boost");
    }
    return;
  }
  if (action === "rewind") {
    if (game.useHourglass(() => economy.consumeHourglass())) {
      tutorial.complete("hourglass");
      dialog.close();
      activeDialog = null;
      resumeOnClose = false;
      resultDelay = 0;
      document.body.classList.remove("crashed");
      syncView();
      beep("rewind");
    } else if (economy.state.hourglasses > 0 && game.canRewind)
      showToast(t("storageError"));
    return;
  }
  if (action === "finish") {
    finishRun();
    activeDialog = "over";
    renderDialog();
    return;
  }
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
    audio.soundEnabled = sound;
    audio.update(game, !!activeDialog);
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
  } else if (action === "music") {
    music = !music;
    audio.musicEnabled = music;
    save("music", String(music));
    audio.update(game, !!activeDialog);
    renderDialog();
    dialog.querySelector<HTMLButtonElement>('[data-action="music"]')?.focus();
  } else if (action === "start-at-night") {
    startAtNight = !startAtNight;
    save("start-at-night", String(startAtNight));
    renderDialog();
    dialog.querySelector<HTMLButtonElement>('[data-action="start-at-night"]')?.focus();
  } else if (action === "tutorial-test") {
    testTutorials = !testTutorials;
    save("test-tutorials", String(testTutorials));
    tutorial.testMode = testTutorials;
    tutorial.resetRun(game);
    renderDialog();
  } else if (action === "home") {
    if (game.mode !== "ready") finishRun();
    if (dialog.open) dialog.close();
    activeDialog = null;
    resumeOnClose = false;
    resultDelay = 0;
    document.body.classList.remove("crashed");
    game.returnHome();
    tutorial.resetRun(game);
    syncView();
    localize();
  }
}
document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-action], [data-quality], [data-language], [data-terrain]",
  );
  if (!target) return;
  event.preventDefault();
  if (target.dataset.terrain) {
    terrainTarget = coreBiomes.find(b => b === target.dataset.terrain) ?? "snow";
    save("terrain-target", terrainTarget); renderDialog();
  } else if (target.dataset.language) {
    language = resolveLanguage(target.dataset.language);
    save("language", language);
    localize();
    renderDialog();
    dialog.querySelector<HTMLButtonElement>("#language-trigger")?.focus();
  } else if (target.dataset.quality) {
    quality = target.dataset.quality === "high";
    save("quality", quality ? "high" : "low");
    try {
      const url = new URL(location.href); url.searchParams.delete("quality");
      history.replaceState(null, "", url);
    } catch {}
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
  if (game.mode !== "running" || activeDialog || game.icy || tutorial.guide) return;
  let accepted = false;
  const wallBefore = game.wallSide;
  const laneBefore = game.lane;
  if (direction === "left") accepted = game.move(-1);
  if (direction === "right") accepted = game.move(1);
  if (direction === "jump") {
    accepted = game.jump();
    if (accepted) beep(game.swimming ? "swim" : "jump");
  }
  if (direction === "slide") {
    accepted = game.slide();
    if (accepted) beep(game.swimming ? "swim" : "slide");
  }
  if (accepted && !wallBefore && game.wallSide) beep("wall");
  else if (accepted && game.lane !== laneBefore) beep(game.swimming ? "swim" : "move");
  tutorial.action(direction, game, accepted);
}
window.addEventListener("keydown", (event) => {
  if (tutorial.guide && !activeDialog) {
    if (event.code === "Tab") {
      event.preventDefault();
      const focusable = Array.from(guidePanel.querySelectorAll<HTMLElement>("button:not([disabled]):not([hidden]), .guide-card-copy"));
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? (event.shiftKey ? focusable.length - 1 : 0) :
        (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      focusable[next]?.focus({preventScroll: true});
    } else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
      event.preventDefault();
      if (!event.repeat) guideAction(event.code === "ArrowLeft" ? "guide-prev" : "guide-next");
    } else if (event.code === "Escape") {
      event.preventDefault();
      if (tutorial.reviewingGuide) guideAction("guide-review-close");
    } else if (event.repeat && (event.code === "Enter" || event.code === "Space")) event.preventDefault();
    return;
  }
  if (activeDialog) return;
  if (event.code === "KeyB") {
    if (!event.repeat) act("boost");
    event.preventDefault();
    return;
  }
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
  tap: boolean;
  threshold: number;
  direction: "left" | "right" | "jump" | "slide" | null;
} | null = null;
let guideSwipe: {id: number; x: number; y: number} | null = null;
window.addEventListener("pointerdown", (event) => {
  if (tutorial.guide && !activeDialog) {
    if (event.isPrimary && event.pointerType !== "mouse" && event.button === 0 &&
      (event.target as HTMLElement).closest(".guide-card") && !(event.target as HTMLElement).closest("button"))
      guideSwipe = {id: event.pointerId, x: event.clientX, y: event.clientY};
    return;
  }
  if (
    game.mode !== "running" ||
    game.transitioning || game.icy || tutorial.guide ||
    gesture ||
    !event.isPrimary ||
    (event.pointerType === "mouse" && event.button !== 0) ||
    activeDialog ||
    (event.target as HTMLElement).closest("button,a,dialog")
  )
    return;
  gesture = {
    x: event.clientX,
    y: event.clientY,
    id: event.pointerId,
    tap: event.target === worldCanvas,
    threshold: event.pointerType === "mouse" ? 56 : Math.max(40, Math.min(64, Math.min(innerWidth, innerHeight) * 0.1)),
    direction: null,
  };
});
window.addEventListener("pointermove", (event) => {
  if (game.icy || tutorial.guide) { gesture = null; return; }
  if (!gesture || gesture.id !== event.pointerId) return;
  if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 12) gesture.tap = false;
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
  const major = Math.max(Math.abs(dx), Math.abs(dy));
  const minor = Math.min(Math.abs(dx), Math.abs(dy));
  if (major < gesture.threshold || major < minor * 1.35) return;
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
window.addEventListener("pointerup", (event) => {
  if (guideSwipe?.id === event.pointerId) {
    const dx = event.clientX - guideSwipe.x, dy = event.clientY - guideSwipe.y;
    guideSwipe = null;
    if (Math.abs(dx) >= 36 && Math.abs(dx) >= Math.abs(dy) * 1.45)
      guideAction(dx < 0 ? "guide-next" : "guide-prev");
    return;
  }
  if (gesture?.id !== event.pointerId) return;
  const tap = gesture.tap && !gesture.direction &&
    Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 12;
  gesture = null;
  if (!tap || activeDialog || tutorial.active || game.mode !== "running" || game.nightCombat.remaining === 0 ||
    game.boosting || game.icy || document.elementFromPoint(event.clientX, event.clientY) !== worldCanvas) return;
  const canvas = worldCanvas.getBoundingClientRect();
  const id = world?.pickWolf(event.clientX - canvas.left, event.clientY - canvas.top);
  if (id !== undefined && game.nightCombat.fire(id, game)) beep("shot");
});
window.addEventListener("pointercancel", (event) => {
  if (guideSwipe?.id === event.pointerId) guideSwipe = null;
  if (gesture?.id === event.pointerId) gesture = null;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) audio.silence();
  if (document.hidden && (game.mode === "running" || game.mode === "intro"))
    openDialog("pause");
});
window.addEventListener("blur", () => {
  audio.silence();
  gesture = guideSwipe = null;
  if (game.mode === "running" || game.mode === "intro") openDialog("pause");
});

localize();
syncView();
reportLoading({phase: "scene", percent: 68});
await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
try {
  world = new ForestScene(
    document.querySelector<HTMLCanvasElement>("#world")!,
    quality,
    percent => reportLoading({phase: "scene", percent}),
  );
  let previous = performance.now();
  let lastCoins = 0;
  const loadingStarted = performance.now();
  let textureFallback = false;
  let maximumPending = Math.max(1, world.scene.getWaitingItemsCount());
  reportLoading({phase: "textures", percent: 83});
  world.engine.runRenderLoop(() => {
    try {
      const now = performance.now(),
        dt = Math.min((now - previous) / 1000, 0.06);
      if (!loaded && !textureFallback && now - loadingStarted > 8000) {
        world!.useTextureFallback(); textureFallback = true;
      }
      previous = now;
      const wasRunning = game.mode === "running";
      const previousMode = game.mode;
      const previousPhase = game.phase;
      tutorial.update(game, dt, economy.state.boosters > 0);
      const simulationDt = dt * tutorial.timeScale(game);
      const transitionBefore = game.transitioning;
      const swimBefore = game.swimming;
      const pickupBefore = game.pickupSerial;
      const refillBefore = game.nightCombat.refillFlash;
      const shieldBreakBefore = game.shieldBreakSerial;
      const clearBefore = game.clearSerial;
      game.update(simulationDt);
      if (game.phase === "night" && (previousPhase !== "night" || previousMode === "intro"))
        tutorial.update(game, 0, economy.state.boosters > 0);
      const wolfImpactAge = game.worldTime - game.nightCombat.playerHitAt;
      document.body.classList.toggle("wolf-impact", game.mode !== "rewinding" && wolfImpactAge >= 0 && wolfImpactAge < 0.32);
      audio.update(game, !!activeDialog);
      if (game.pickupSerial !== pickupBefore) beep(game.lastPickup);
      if (game.nightCombat.refillFlash > refillBefore) beep("ammo");
      if (game.shieldBreakSerial !== shieldBreakBefore) beep("break");
      if (game.clearSerial !== clearBefore) beep("clear");
      if (transitionBefore || game.transitioning || game.icy) gesture = null;
      if (swimBefore !== game.swimming) beep("splash");
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
      updateGuideUi();
      const guide = !activeDialog ? tutorial.guide : null;
      world!.update(game, guide ? 0 : game.mode === "over" ? dt : simulationDt,
        tutorial.active?.id === "wallEntry" && !tutorial.knows("wallEntry"), guide,
        guide ? tutorial.guideStep : 0);
      if (!loaded) {
        const pending = world!.scene.getWaitingItemsCount();
        maximumPending = Math.max(maximumPending, pending);
        reportLoading({phase: "textures", percent: 83 + (1 - pending / maximumPending) * 12});
        // A drawn, ready character is required. Slow decorative textures may finish in the background.
        if (world!.isPlayable() && (pending === 0 || now - loadingStarted > 8000)) {
          loaded = true;
          reportLoading({phase: "ready", percent: 100});
          document.querySelector<HTMLButtonElement>('[data-action="start"]')!.disabled = false;
        }
      }
      updateTutorialUi();
      if (game.coins > lastCoins) {
        beep("coin");
        const counter = document.querySelector<HTMLElement>(".coin-counter")!;
        counter.classList.remove("pulse");
        void counter.offsetWidth;
        counter.classList.add("pulse");
      }
      updateFeatureUi();
      weather.update(game.inSnow && game.mode !== "ready" && !tutorial.guide,
        game.blizzard, game.worldTime, Math.min(1, game.cold / CONFIG.coldMax), quality,
        game.mode === "running" ? simulationDt : 0, game.mode === "rewinding");
      lastCoins = game.coins;
      document.querySelector("#score")!.textContent = n(game.score);
      document.querySelector("#distance")!.textContent = n(game.distance);
      document.querySelector("#coins")!.textContent = n(game.coins);
      if (wasRunning && game.mode === "over") {
        beep("hit");
        resultDelay = game.lastHit === "pool" ? 1.8 : game.lastHit === "cold" ? 1.2 : 0.65;
        document.body.classList.add("crashed");
      }
      if (game.mode === "over" && !activeDialog) {
        resultDelay -= dt;
        if (resultDelay <= 0) openDialog(runFinalized ? "over" : "revive");
      }
    } catch (error) {
      console.error("3D rendering failed", error);
      world?.engine.stopRenderLoop();
      reportLoading({phase: "error", percent: 95, reason: "graphics"});
    }
  });
} catch (error) {
  console.error("3D scene initialization failed", error);
  reportLoading({phase: "error", percent: 68, reason: "graphics"});
}

window.addEventListener("pagehide", () => {
  audio.silence();
  if (game.mode === "over") finishRun();
  economy.flush();
});
