import type { RunnerGame } from "./game.ts";

export type Sound = "coin" | "jump" | "slide" | "hit" | "start" | "tick" | "splash" | "shot" | "ammo"
  | "step" | "swim" | "move" | "wall" | "magnet" | "shield" | "break" | "boost" | "rewind" | "clear" | "fire-pat" | "fire-out";

// Original synthesized score and effects: no downloads or decoding on the play path.
export class GameAudio {
  private context: AudioContext | null = null;
  private effects!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private nextNote = 0;
  private step = 0;
  private playing = false;
  private lastFootfall = -1;
  private lastEffect = new Map<Sound, number>();
  soundEnabled = true;
  musicEnabled = true;

  unlock() {
    try {
      if (!this.context) {
        const ctx = this.context = new AudioContext();
        this.effects = ctx.createGain();
        this.musicBus = ctx.createGain();
        this.effects.connect(ctx.destination);
        this.musicBus.connect(ctx.destination);
        this.musicBus.gain.value = 0;
        this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      void this.context.resume().catch(() => {});
    } catch { /* Audio support is optional. */ }
  }

  private tone(frequency: number, end: number, at: number, duration: number,
    volume: number, type: OscillatorType, bus: GainNode) {
    const ctx = this.context!;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain); gain.connect(bus);
    osc.start(at); osc.stop(at + duration + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  private hiss(at: number, duration: number, volume: number, frequency: number, bus: GainNode) {
    const ctx = this.context!, source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noise;
    filter.type = "lowpass"; filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter); filter.connect(gain); gain.connect(bus);
    source.start(at); source.stop(at + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  play(kind: Sound) {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running" || !this.soundEnabled || document.hidden) return;
    const now = ctx.currentTime;
    if (now - (this.lastEffect.get(kind) ?? -1) < 0.07) return;
    this.lastEffect.set(kind, now);
    const tone = (a: number, b: number, duration = 0.18, volume = 0.07, delay = 0, type: OscillatorType = "sine") =>
      this.tone(a, b, now + delay, duration, volume, type, this.effects);
    switch (kind) {
      case "coin": tone(1046, 1568, 0.15, 0.045); tone(1568, 2093, 0.13, 0.025, 0.07); break;
      case "jump": tone(230, 640, 0.24); break;
      case "slide": this.hiss(now, 0.26, 0.09, 900, this.effects); tone(180, 65, 0.24, 0.04); break;
      case "step": this.hiss(now, 0.055, 0.025, 550, this.effects); tone(95, 55, 0.06, 0.015); break;
      case "swim": tone(340, 650, 0.16, 0.035); this.hiss(now, 0.16, 0.04, 1100, this.effects); break;
      case "move": this.hiss(now, 0.1, 0.045, 1800, this.effects); break;
      case "wall": tone(260, 520, 0.17); tone(390, 780, 0.22, 0.045, 0.08); break;
      case "hit": this.hiss(now, 0.35, 0.16, 1000, this.effects); tone(130, 30, 0.4, 0.12, 0, "triangle"); break;
      case "shot": tone(620, 190, 0.13, 0.06, 0, "triangle"); this.hiss(now, 0.085, 0.065, 1800, this.effects); break;
      case "ammo": tone(540, 720, 0.12, 0.05); tone(790, 970, 0.14, 0.05, 0.065); break;
      case "fire-pat": this.hiss(now, 0.10, 0.075, 1850, this.effects); tone(180, 95, 0.10, 0.04, 0, "triangle"); break;
      case "fire-out": this.hiss(now, 0.27, 0.08, 2950, this.effects); tone(350, 210, 0.18, 0.04, 0, "triangle"); break;
      case "splash": this.hiss(now, 0.5, 0.12, 2200, this.effects); [0, 1, 2].forEach(i => tone(460 + i * 170, 180, 0.22, 0.035, i * 0.09)); break;
      case "magnet": [440, 554, 659, 880].forEach((f, i) => tone(f, f, 0.25, 0.05, i * 0.06)); break;
      case "shield": tone(523, 1046, 0.4); tone(784, 1568, 0.45, 0.035); break;
      case "break": this.hiss(now, 0.28, 0.12, 4200, this.effects); tone(1100, 220, 0.3); break;
      case "boost": this.hiss(now, 0.8, 0.1, 1600, this.effects); tone(100, 850, 0.7, 0.1, 0, "triangle"); break;
      case "rewind": [880, 659, 523, 330].forEach((f, i) => tone(f, f * 0.7, 0.3, 0.06, i * 0.09)); break;
      case "clear": tone(150, 50, 0.16, 0.06); this.hiss(now, 0.16, 0.07, 1600, this.effects); break;
      case "start": [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.28, 0.055, i * 0.09)); break;
      case "tick": tone(660, 550, 0.12, 0.06); break;
    }
  }

  update(game: RunnerGame, dialogOpen: boolean) {
    const ctx = this.context;
    if (!ctx) return;
    this.effects.gain.setTargetAtTime(this.soundEnabled && !document.hidden ? 1 : 0, ctx.currentTime, 0.015);
    const footfall = Math.floor(game.worldTime * (game.wallSide ? 4.5 : 3.5));
    if (game.mode === "running" && !dialogOpen && !game.swimming && !game.boosting && game.y < 0.05 && !game.sliding) {
      if (footfall !== this.lastFootfall) this.play("step");
    }
    this.lastFootfall = footfall;
    const playing = this.musicEnabled && !dialogOpen && !document.hidden && document.hasFocus() &&
      ["ready", "intro", "running"].includes(game.mode) && ctx.state === "running";
    this.musicBus.gain.setTargetAtTime(playing ? 0.45 : 0, ctx.currentTime, 0.08);
    if (!playing) { this.playing = false; return; }
    if (!this.playing) { this.nextNote = ctx.currentTime + 0.03; this.playing = true; }
    if (this.nextNote < ctx.currentTime) this.nextNote = ctx.currentTime;
    // Eight bars at 108 BPM, with a quieter, rounded arrangement underwater.
    const beat = 60 / 108 / 2;
    const melody = [76, 79, 81, 79, 74, 76, 72, 74, 76, 79, 83, 81, 79, 76, 74, 71];
    const chords = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]];
    const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);
    while (this.nextNote < ctx.currentTime + 0.15) {
      const at = this.nextNote, step = this.step % 64;
      const chord = chords[Math.floor(step / 16)];
      const wet = game.swimming;
      if (step % 2 === 0) {
        const f = midi(melody[Math.floor(step / 2) % melody.length] - (wet ? 12 : 0));
        this.tone(f, f, at, beat * 1.65, wet ? 0.055 : 0.07, "sine", this.musicBus);
      }
      const arp = midi(chord[step % 3] + 12);
      this.tone(arp, arp, at, beat * 0.85, 0.025, "triangle", this.musicBus);
      if (step % 8 === 0) {
        for (const note of chord) this.tone(midi(note + 12), midi(note + 12), at, beat * 7.5, 0.018, "sine", this.musicBus);
      }
      if (step % 4 === 0) {
        const bass = midi(chord[0] - 12);
        this.tone(bass, bass, at, beat * 2, 0.09, "triangle", this.musicBus);
        if (!wet) this.tone(95, 38, at, 0.12, 0.09, "sine", this.musicBus);
      }
      if (!wet && step % 4 === 2) this.hiss(at, 0.09, 0.035, 2400, this.musicBus);
      this.nextNote += beat; this.step++;
    }
  }

  silence() {
    if (!this.context) return;
    this.musicBus.gain.cancelScheduledValues(this.context.currentTime);
    this.musicBus.gain.setValueAtTime(0, this.context.currentTime);
    this.effects.gain.setValueAtTime(0, this.context.currentTime);
    this.playing = false;
  }
}
