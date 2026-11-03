import "./style.css";
import { RunnerGame } from "./game.ts";
import { ForestScene } from "./scene.ts";
import { Economy } from "./economy.ts";
import { CONFIG } from "./config.ts";
import { Tutorial } from "./tutorial.ts";
import type { LessonId } from "./tutorial.ts";
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
let quality = read("quality") !== "low";
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
let runFinalized = false;
let buyBusyUntil = 0;
let lastPickupSerial = 0;
let lastClearSerial = 0;
let toastTimer = 0;
let statusMarkup = "";
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
if (tutorial.needsBasics) game.prepareTutorialOpening();
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
        <button class="supply-button" data-action="shop">${icon("shop")}${text("shop")}<span>${icon("coin")}<b class="wallet-count">${n(economy.state.wallet)}</b></span></button>
        <div class="best-record">${icon("trophy")}${text("best", "small")}<strong id="home-best">${n(best)} <span>${t("bestUnit")}</span></strong></div>
      </section>
      <div class="live-hint" id="live-hint" hidden>${text("liveHint", "span", "keyboard-only")}${text("mobileHint", "span", "touch-only")}</div>
    </main>
    <footer><button class="icon-button help-button" data-action="guide" data-label="howTo">${icon("help")}</button></footer>
  </div>
  <div class="coin-pop" id="coin-pop" aria-hidden="true"></div>
  <section class="run-status" id="run-status" hidden aria-label="${t("powerStatus")}"></section>
  <div class="route-notice" id="route-notice" hidden role="status"></div>
  <button class="active-tool" id="booster-button" data-action="boost" data-label="activateBoost" hidden>${icon("rocket")}<span id="booster-status"></span></button>
  <div class="notice-toast" id="notice-toast" hidden role="status"></div>
  <div class="tutorial-overlay" id="tutorial-overlay" hidden>
    <div class="tutorial-spotlight" id="tutorial-spotlight" hidden></div>
    <div class="tutorial-prompt" id="tutorial-prompt" data-gesture="left">
      <div class="tutorial-caption"><span id="tutorial-icon"></span><span>${text("tutorialSlow")}</span></div>
      <div class="gesture-stage" aria-hidden="true"><span class="gesture-track"></span><span class="swipe-hand"></span><span class="gesture-spark"></span></div>
      <strong id="tutorial-title" role="status"></strong>
      <small class="touch-only">${t("tutorialSwipeAnywhere")}</small><small class="keyboard-only" id="tutorial-keys"></small>
    </div>
  </div>
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
  if (activeDialog === "shop") {
    const state = economy.state;
    const product = (
      kind: "booster" | "hourglass",
      glyph: string,
      price: number,
    ) => {
      const owned = kind === "booster" && state.boosterUnlocked;
      const unavailable = state.wallet < price;
      return `<article class="supply-card"><span class="supply-icon">${icon(glyph)}</span><div><h3>${t(kind)}</h3><p>${t(kind === "booster" ? "boosterDesc" : "hourglassDesc")}</p><small>${kind === "booster" ? t("permanent") : `${t("stock")} · ${n(state.hourglasses)}`}</small></div><div class="purchase-row"><span>${icon("coin")}${n(price)}</span><button class="secondary-button" data-action="buy-${kind}" ${owned || unavailable ? "disabled" : ""}>${t(owned ? "owned" : unavailable ? "insufficient" : "buy")}</button></div></article>`;
    };
    dialog.innerHTML = `${close}<div class="modal-heading"><span class="modal-symbol">${icon("shop")}</span><h2 id="dialog-title">${t("shop")}</h2></div><div class="shop-wallet">${t("wallet")}<strong>${icon("coin")}<span class="wallet-count">${n(state.wallet)}</span></strong></div>${product("booster", "rocket", CONFIG.boosterPrice)}${product("hourglass", "hourglass", CONFIG.hourglassPrice)}<button class="secondary-button full-width" data-action="close">${t("closeShop")}</button>`;
  } else if (activeDialog === "revive") {
    const usable = game.canRewind && economy.state.hourglasses > 0;
    const hint = game.hourglassUsed
      ? "alreadyRevived"
      : economy.state.hourglasses === 0
        ? "noHourglass"
        : "reviveHint";
    dialog.innerHTML = `${close}<div class="modal-heading"><span class="modal-symbol">${icon("hourglass")}</span><h2 id="dialog-title">${t("reviveTitle")}</h2></div><p class="revive-copy">${t(hint)}</p><div class="revive-stock">${icon("hourglass")}${t("stock")} · ${n(economy.state.hourglasses)}</div>${usable && !tutorial.knows("hourglass") ? `<div class="revive-tutorial"><span class="tap-finger" aria-hidden="true"></span><span>${t("lessonHourglass")}</span></div>` : ""}<button class="primary-button full-width" data-action="rewind" ${usable ? "" : "disabled"}>${icon("hourglass")}${t("useHourglass")}</button><button class="secondary-button full-width finish-run" data-action="finish">${t("finishRun")}</button>`;
  } else if (activeDialog === "settings") {
    const selected = languages.find((item) => item.code === language)!;
    dialog.innerHTML = `${close}<div class="modal-heading"><span class="modal-symbol">${icon("settings")}</span><h2 id="dialog-title">${t("settings")}</h2></div>
      <div class="setting-row language-row"><span class="setting-label" id="language-label">${icon("language")}${t("language")}</span>
      <div class="language-picker"><button id="language-trigger" class="language-trigger" data-action="language-menu" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="language-label language-current"><span class="language-mark">${selected.mark}</span><span id="language-current">${selected.name}</span>${icon("chevron")}</button>
      <div class="language-menu" id="language-menu" role="listbox" aria-labelledby="language-label" hidden>${languages.map((item) => `<button class="language-choice ${item.code === language ? "selected" : ""}" role="option" aria-selected="${item.code === language}" tabindex="-1" data-language="${item.code}"><span class="language-mark">${item.mark}</span><span>${item.name}</span>${item.code === language ? icon("check") : ""}</button>`).join("")}</div></div></div>
      <div class="setting-row"><span class="setting-label">${icon("sound")}${t("sound")}</span><button class="toggle ${sound ? "is-on" : ""}" data-action="sound" role="switch" aria-checked="${sound}" aria-label="${t("sound")}"><span></span></button></div>
      <div class="setting-row"><span class="setting-label">${icon("quality")}${t("quality")}</span><div class="segmented"><button class="${quality ? "selected" : ""}" data-quality="high" aria-pressed="${quality}">${t("high")}</button><button class="${!quality ? "selected" : ""}" data-quality="low" aria-pressed="${!quality}">${t("low")}</button></div></div>
      <div class="setting-row"><div class="setting-copy"><span class="setting-label">${icon("help")}${t("tutorialTest")}</span><small>${t("tutorialTestHint")}</small></div><button class="toggle ${testTutorials ? "is-on" : ""}" data-action="tutorial-test" role="switch" aria-checked="${testTutorials}" aria-label="${t("tutorialTest")}"><span></span></button></div>`;
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
        )}</div><p class="powers-guide">${t("powersGuide")}</p><button class="primary-button full-width" data-action="close">${t("gotIt")}${icon("check")}</button>`;
  } else if (activeDialog === "pause") {
    dialog.innerHTML = `${close}<div class="modal-heading"><span class="modal-symbol">${icon("pause")}</span><h2 id="dialog-title">${t("paused")}</h2></div><button class="primary-button full-width" data-action="resume">${icon("play")}${t("resume")}</button><div class="secondary-actions"><button class="secondary-button" data-action="restart">${icon("restart")}${t("restart")}</button><button class="secondary-button" data-action="home">${icon("home")}${t("home")}</button></div>`;
  } else if (activeDialog === "over") {
    const hint =
      game.lastHit === "wall-rock"
        ? "wallHint"
        : game.lastHit === "gap"
          ? "fallHint"
          : game.lastHit === "log"
            ? game.terrain.biome === "canyon"
              ? "canyonLogHint"
              : "hitLog"
            : game.lastHit === "arch"
              ? game.terrain.biome === "canyon"
                ? "canyonArchHint"
                : "hitArch"
              : "hitRock";
    dialog.innerHTML = `<div class="result-heading"><span class="result-seal">${icon("trophy")}</span><h2 id="dialog-title">${t("over")}</h2>${newBest ? `<span class="record-tag">${t("newBest")}</span>` : ""}</div><div class="final-score"><span>${t("score")}</span><strong>${n(game.score)}</strong></div><div class="result-stats"><div><span class="stat-label">${icon("route")}${t("totalDistance")}</span><strong>${n(game.distance)}<small>m</small></strong></div><div><span class="stat-label">${icon("coin")}${t("collected")}</span><strong>${n(game.coins)}</strong></div></div><p class="collision-tip">${icon("help")}<span>${t(hint)}</span></p><p class="wallet-receipt">${t("walletEarned")} · ${n(game.coins)}</p><div class="result-actions"><button class="primary-button" data-action="restart">${icon("restart")}${t("again")}</button><button class="secondary-button" data-action="home">${icon("home")}${t("home")}</button><button class="secondary-button" data-action="shop">${icon("shop")}${t("shop")}</button></div>`;
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
  document.querySelector<HTMLElement>("#live-hint")!.hidden = true;
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
  game.begin();
  tutorial.resetRun(game);
  if (tutorial.needsBasics) game.prepareTutorialOpening();
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
let tutorialUiKey = "";
function updateTutorialUi() {
  const overlay = document.querySelector<HTMLElement>("#tutorial-overlay")!;
  const lesson = tutorial.active;
  const visible = !!lesson && game.mode === "running" && !activeDialog;
  overlay.hidden = !visible;
  document.body.classList.toggle("tutorial-active", visible);
  document
    .querySelector("#booster-button")!
    .classList.toggle("tutorial-target", visible && lesson?.id === "booster");
  if (!visible || !lesson) return;
  const key = `${lesson.id}/${lesson.gesture}/${language}`;
  if (key !== tutorialUiKey) {
    tutorialUiKey = key;
    const glyph =
      lesson.id === "booster"
        ? "rocket"
        : lesson.id === "move" ||
            lesson.id === "dodge" ||
            lesson.id.startsWith("wall")
          ? "compass"
          : lesson.id;
    document.querySelector("#tutorial-icon")!.innerHTML = icon(glyph);
    document.querySelector("#tutorial-title")!.textContent = t(
      lessonTitles[lesson.id],
    );
    document.querySelector<HTMLElement>("#tutorial-prompt")!.dataset.gesture =
      lesson.gesture;
    document.querySelector("#tutorial-keys")!.textContent =
      lesson.gesture === "tap"
        ? t("tutorialTap")
        : lesson.gesture === "up"
          ? "↑ / W / Space"
          : lesson.gesture === "down"
            ? "↓ / S"
            : "← / → / A / D";
    overlay.querySelector(".touch-only")!.textContent = t(
      lesson.gesture === "tap" ? "tutorialTap" : "tutorialSwipeAnywhere",
    );
  }
  const ring = document.querySelector<HTMLElement>("#tutorial-spotlight")!;
  const anchor = lesson.target ? world?.getTutorialAnchor(lesson.target) : null;
  ring.hidden = !anchor?.visible;
  if (anchor?.visible) {
    ring.style.left = `${anchor.x}px`;
    ring.style.top = `${anchor.y}px`;
  }
}
function updateFeatureUi() {
  const state = economy.state;
  document
    .querySelectorAll<HTMLElement>(".wallet-count")
    .forEach((el) => (el.textContent = n(state.wallet)));
  const runningView = game.mode !== "ready" && !game.introducing;
  const status = document.querySelector<HTMLElement>("#run-status")!;
  status.hidden = !runningView;
  const markup = ["magnet", "shield", "rocket"]
    .map(
      (name) =>
        `<article class="power-slot" data-power="${name}"><span class="power-art">${icon(name)}</span><div class="power-readout"><span class="power-name"></span><strong class="power-time"></strong><small class="power-state"></small></div><div class="power-meter"><i></i></div></article>`,
    )
    .join("");
  if (markup !== statusMarkup) {
    statusMarkup = markup;
    status.innerHTML = markup;
  }
  status.setAttribute("aria-label", t("powerStatus"));
  const seconds = (time: number) =>
    `${time < 10 ? time.toFixed(1) : Math.ceil(time)}s`;
  const power = (
    name: string,
    label: string,
    time: number,
    duration: number,
    stateLabel: string,
    live: boolean,
    glyph = name,
  ) => {
    const slot = status.querySelector<HTMLElement>(`[data-power="${name}"]`)!;
    slot.dataset.state = live ? "active" : time > 0 ? "cooling" : "idle";
    slot.classList.toggle("is-ending", live && time > 0 && time <= 3);
    slot.querySelector(".power-name")!.textContent = label;
    slot.querySelector(".power-time")!.textContent =
      time > 0 ? seconds(time) : live ? "…" : "—";
    slot.querySelector(".power-state")!.textContent = stateLabel;
    (slot.querySelector(".power-meter i") as HTMLElement).style.transform =
      `scaleX(${Math.max(0, Math.min(1, time / duration))})`;
    const img = slot.querySelector<HTMLImageElement>("img")!;
    const url = iconAsset(glyph);
    if (img.getAttribute("src") !== url) img.src = url;
    slot.setAttribute(
      "aria-label",
      `${label} · ${stateLabel}${time > 0 ? ` · ${seconds(time)}` : ""}`,
    );
  };
  power(
    "magnet",
    t("magnet"),
    game.magnetTime,
    CONFIG.magnetDuration,
    t(game.magnetTime > 0 ? "powerActive" : "powerIdle"),
    game.magnetTime > 0,
  );
  const protectedTime = game.shield ? game.shieldTime : game.protectionTime;
  power(
    "shield",
    t(game.shield || !protectedTime ? "shield" : "briefProtection"),
    protectedTime,
    game.shield ? CONFIG.shieldDuration : CONFIG.rewindProtection,
    t(protectedTime > 0 ? "powerActive" : "powerIdle"),
    protectedTime > 0,
    game.shield || !protectedTime ? "shield" : "protection",
  );
  const rewind = game.mode === "rewinding";
  const flightTime = game.boostRemaining / (game.baseSpeed * CONFIG.boostSpeed);
  power(
    "rocket",
    t(rewind ? "hourglass" : "booster"),
    rewind
      ? game.rewindRemaining
      : game.boosting
        ? flightTime
        : state.boosterUnlocked
          ? game.boostCooldown
          : 0,
    rewind
      ? CONFIG.rewindDuration
      : game.boosting
        ? CONFIG.boostDistance / (game.baseSpeed * CONFIG.boostSpeed)
        : CONFIG.boostCooldown,
    t(
      rewind || game.boosting
        ? game.boosting && !game.boostRemaining
          ? "flightExtending"
          : "powerActive"
        : !state.boosterUnlocked
          ? "toolLocked"
          : game.boostCooldown > 0
            ? "cooldown"
            : "toolReady",
    ),
    rewind || game.boosting,
    rewind ? "hourglass" : "rocket",
  );
  const button = document.querySelector<HTMLButtonElement>("#booster-button")!;
  button.hidden = !runningView;
  button.disabled =
    !state.boosterUnlocked ||
    game.mode !== "running" ||
    game.boosting ||
    game.boostCooldown > 0;
  button.classList.toggle("tool-live", game.boosting);
  document.querySelector("#booster-status")!.textContent =
    !state.boosterUnlocked
      ? t("toolLocked")
      : game.boosting
        ? `${Math.ceil(game.boostRemaining)}m`
        : game.boostCooldown > 0
          ? `${Math.ceil(game.boostCooldown)}s`
          : t("toolReady");
  const notice = document.querySelector<HTMLElement>("#route-notice")!;
  const message =
    game.mode === "rewinding"
      ? t("rewinding")
      : game.mode === "running" && game.wallSide
        ? t((["wallLow", "wallMid", "wallHigh"] as const)[game.wallLevel])
        : game.mode === "running" && game.gapWarning && !game.boosting
          ? t("chasmAhead")
          : "";
  notice.hidden = !message || !!tutorial.active;
  if (notice.textContent !== message) notice.textContent = message;
  if (lastPickupSerial !== game.pickupSerial) {
    lastPickupSerial = game.pickupSerial;
    beep("start");
  }
  if (lastClearSerial !== game.clearSerial) {
    lastClearSerial = game.clearSerial;
    showToast(t("continueHint"));
  }
}
function act(action: string) {
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
    if (game.activateBooster(economy.state.boosterUnlocked)) {
      tutorial.complete("booster");
      beep("start");
      showToast(t("boostHint"));
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
      beep("tick");
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
    if (tutorial.needsBasics) game.prepareTutorialOpening();
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
  let accepted = false;
  if (direction === "left") accepted = game.move(-1);
  if (direction === "right") accepted = game.move(1);
  if (direction === "jump") {
    accepted = game.jump();
    if (accepted) beep("jump");
  }
  if (direction === "slide") {
    accepted = game.slide();
    if (accepted) beep("slide");
  }
  tutorial.action(direction, game, accepted);
}
window.addEventListener("keydown", (event) => {
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
    tutorial.update(game, dt, economy.state.boosterUnlocked);
    const simulationDt = dt * tutorial.timeScale(game);
    game.update(simulationDt);
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
    world!.update(game, simulationDt);
    updateTutorialUi();
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
    updateFeatureUi();
    lastCoins = game.coins;
    document.querySelector("#score")!.textContent = n(game.score);
    document.querySelector("#distance")!.textContent = n(game.distance);
    document.querySelector("#coins")!.textContent = n(game.coins);
    document
      .querySelector<HTMLElement>("#live-hint")!
      .classList.toggle("faded", game.distance > 48);
    if (wasRunning && game.mode === "over") {
      beep("hit");
      resultDelay = 0.65;
      document.body.classList.add("crashed");
    }
    if (game.mode === "over" && !activeDialog) {
      resultDelay -= dt;
      if (resultDelay <= 0) openDialog(runFinalized ? "over" : "revive");
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

window.addEventListener("pagehide", () => {
  if (game.mode === "over") finishRun();
  economy.flush();
});
