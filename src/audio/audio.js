import { settings, onSettingsChange } from '../core/settings.js';
import { rng, pink, brown, white, seamless, reverbIR, toBuffer } from './dsp.js';
import { SFX, FOOTSTEP_VARIANTS, FLOOR_TYPES } from './sfx.js';
import { Score } from './music.js';
import { Ambience } from './ambience.js';

/**
 * Motor de audio del portafolio (Web Audio). Todo el sonido es original y se sintetiza en el
 * navegador: no se descarga ningún archivo de audio.
 *
 * - Silencio hasta la primera interacción: el AudioContext se crea en el primer gesto
 *   (tecla, clic o toque), como piden los navegadores.
 * - Música continua en toda la mansión (music.js); cada sala elige su estado de ánimo,
 *   su ambiente (ambience.js), su suelo para los pasos y su reverberación (rooms.json).
 * - Buses: música · ambiente · efectos · interfaz, con los volúmenes de Opciones
 *   (`volume` general, `music`, `sfx`) y el interruptor `sound`.
 * - Se suspende con la pestaña oculta o el modo lista abierto (no gasta CPU).
 *
 * Grafo:  música ─ filtro (pausa) ─ duck ─ musicVol ─┐
 *         ambiente ─ duck ─────────────── sfxVol ────┼─ master ─ limitador ─ salida
 *         efectos + reverb de sala, interfaz ─ sfxVol ┘
 */

const MUSIC_TRIM = 1.6; // la partitura sale a ~-24 LUFS; con los volúmenes por defecto queda de fondo, bajo los efectos
const UI_PRIORITY = { move: 1, confirm: 2, back: 2, page: 3, error: 4, close: 4, open: 5, file: 5, start: 6 };

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false; // ya hubo un gesto del usuario
    this.wanted = false; // debería estar sonando ahora mismo
    this.hidden = document.visibilityState === 'hidden';
    this.listOpen = false;
    this.paused = false;
    this.media = false;
    this.minigame = false;
    this.room = null; // definición de rooms.json
    this.ambience = null;
    this.buffers = new Map();
    this.pendingUi = [];
    this.lastMove = 0;
    this.lastStep = -1;
    this.creak = null;

    // Cualquier gesto desbloquea (y reanuda, si el sistema suspendió el audio, p. ej. en iOS).
    const gesture = () => this.#gesture();
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click']) {
      window.addEventListener(type, gesture, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.visibilityState === 'hidden';
      this.#updateActive();
    });
    onSettingsChange((key, value) => {
      // Activar el sonido es un clic: se puede crear el contexto aquí mismo.
      if (key === 'sound' && value && this.unlocked && !this.ctx) this.#create();
      if (key === 'sound') this.#updateActive();
      if (['volume', 'music', 'sfx'].includes(key)) this.#applyVolumes();
    });
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  // ---------- Estado del juego ----------

  /** Sala actual: ambiente, ánimo de la música, suelo y reverberación. */
  setRoom(def) {
    this.room = def;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.score?.setMood(def?.mood ?? 'tense');
    this.ambience?.stop(t, 1.4);
    this.ambience = new Ambience(this, def?.ambience ?? 'hall', t);
    this.ambience.fadeIn(t + 0.3, 2.5);
    this.#setReverb(def?.reverb ?? 1.2);
  }

  /** Menú de pausa o ficha abierta durante el juego: música apagada y ambiente bajo. */
  setPaused(on) {
    this.paused = on;
    this.#applyDucking();
  }

  /** Video del DemoReel sonando: callar música y ambiente. */
  setMedia(on) {
    this.media = on;
    this.#applyDucking();
  }

  /** Minijuego secreto (ui/breakout.js): la mansión sigue sonando, lejos y apagada. */
  setMinigame(on) {
    this.minigame = on;
    this.#applyDucking();
  }

  setListOpen(on) {
    this.listOpen = on;
    this.#updateActive();
  }

  // ---------- Efectos ----------

  /**
   * Reproduce un efecto. opts: gain, rate, when (tiempo del contexto), bus (nodo destino;
   * por defecto efectos), reverb (envío a la reverberación de la sala, 0..1).
   */
  play(name, { gain = 1, rate = 1, when = 0, bus = null, reverb = 0 } = {}) {
    if (!this.ctx || !this.wanted) return null;
    const buffer = this.#buffer(name);
    if (!buffer) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(bus ?? this.sfxBus);
    if (reverb > 0) {
      const send = this.ctx.createGain();
      send.gain.value = reverb;
      g.connect(send).connect(this.reverbSend);
    }
    src.start(Math.max(when, this.ctx.currentTime));
    src.onended = () => g.disconnect();
    return src;
  }

  footstep(running = false) {
    if (!this.wanted) return;
    const floor = FLOOR_TYPES.includes(this.room?.floor) ? this.room.floor : 'stone';
    let v = Math.floor(Math.random() * FOOTSTEP_VARIANTS);
    if (v === this.lastStep) v = (v + 1) % FOOTSTEP_VARIANTS; // nunca el mismo paso dos veces seguidas
    this.lastStep = v;
    this.play(`step_${floor}_${v}`, {
      gain: running ? 0.42 : 0.3,
      rate: 0.93 + Math.random() * 0.14,
      reverb: (this.room?.reverb ?? 1) > 1.5 ? 0.35 : 0.2,
    });
  }

  /** Momentos de la transición de puerta (los lanza DoorTransition). */
  door(cue) {
    if (!this.wanted) return;
    switch (cue) {
      case 'latch':
        this.play('latch', { gain: 0.5, reverb: 0.3 });
        break;
      case 'creak':
        this.creak = this.play('creak', { gain: 0.42, rate: 0.92 + Math.random() * 0.12, reverb: 0.45 });
        break;
      case 'skip': {
        // Saltaron la animación: cortar el chirrido con un fundido corto.
        const c = this.creak;
        if (c) {
          try {
            c.stop(this.ctx.currentTime + 0.08);
          } catch {
            /* ya terminó */
          }
        }
        this.creak = null;
        break;
      }
      case 'shut':
        this.play('shut', { gain: 0.75, reverb: 0.5 });
        break;
      case 'shutSoft':
        this.play('shut', { gain: 0.35, rate: 1.1, reverb: 0.3 });
        break;
      case 'locked':
        this.play('locked', { gain: 0.6, reverb: 0.2 });
        break;
    }
  }

  /**
   * Sonido de interfaz. Si en el mismo instante se piden varios (p. ej. "aceptar" y
   * "abrir ficha" con un solo clic), suena solo el más importante.
   */
  ui(name) {
    if (!this.wanted) return;
    this.pendingUi.push(name);
    if (this.pendingUi.length === 1) setTimeout(() => this.#flushUi(), 0);
  }

  // ---------- Depuración ----------

  /** Nivel actual de la salida (dBFS aprox.), para pruebas y para F3. */
  level() {
    if (!this.analyser || !this.running) return -Infinity;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += v * v;
    return 10 * Math.log10(sum / data.length + 1e-12);
  }

  get state() {
    return {
      context: this.ctx?.state ?? 'sin crear',
      room: this.room?.id,
      ambience: this.room?.ambience,
      mood: this.score?.mood,
      paused: this.paused,
      media: this.media,
      minigame: this.minigame,
      list: this.listOpen,
      hidden: this.hidden,
      level: Math.round(this.level()),
    };
  }

  // ---------- Interno ----------

  #gesture() {
    this.unlocked = true;
    if (!this.ctx && settings.sound) this.#create();
    this.#updateActive();
  }

  #create() {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;
    let ctx;
    try {
      ctx = new Ctx({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    this.ctx = ctx;
    const sr = ctx.sampleRate;
    const r = rng(11);
    this.noise = {
      white: toBuffer(ctx, seamless(white(sr * 4 + sr / 2, r), sr / 2)),
      pink: toBuffer(ctx, seamless(pink(sr * 6 + sr / 2, r), sr / 2)),
      brown: toBuffer(ctx, seamless(brown(sr * 5 + sr / 2, r), sr / 2)),
    };

    const node = (gain = 1) => {
      const g = ctx.createGain();
      g.gain.value = gain;
      return g;
    };
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 10;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.master = node(0);
    this.master.connect(this.limiter).connect(ctx.destination);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.limiter.connect(this.analyser);

    this.musicVol = node(0);
    this.musicDuck = node(1);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicIn = node(MUSIC_TRIM);
    this.musicIn.connect(this.musicFilter).connect(this.musicDuck).connect(this.musicVol).connect(this.master);

    this.sfxVol = node(1);
    this.sfxVol.connect(this.master);
    this.sfxBus = node(1);
    this.sfxBus.connect(this.sfxVol);
    this.ambDuck = node(1);
    this.ambBus = node(1.8); // ambientes ~12 dB por debajo de la música
    this.ambBus.connect(this.ambDuck).connect(this.sfxVol);
    this.uiBus = node(0.8);
    this.uiBus.connect(this.sfxVol);
    this.reverbSend = node(1);
    this.reverbOut = node(1);
    this.reverbOut.connect(this.sfxVol);
    this.reverbCache = new Map();

    this.score = new Score(ctx, this.musicIn, { seed: (Date.now() % 997) + 1 });
    this.musicStarted = false;
    if (this.room) this.setRoom(this.room);
    else this.#setReverb(1.2);
  }

  #updateActive() {
    const ctx = this.ctx;
    if (!ctx) return;
    const wanted = this.unlocked && settings.sound && !this.hidden && !this.listOpen;
    // Reanudar en cada gesto si hace falta (iOS puede interrumpir el audio por su cuenta).
    if (wanted && ctx.state !== 'running') ctx.resume().catch(() => {});
    if (wanted === this.wanted) return;
    this.wanted = wanted;
    clearTimeout(this.suspendTimer);
    if (wanted) {
      if (!this.musicStarted) {
        // Primera vez: la música entra despacio (después del "Pulsa Start").
        this.musicStarted = true;
        this.score.setMood(this.room?.mood ?? 'tense');
        this.score.start(ctx.currentTime + 0.1);
        this.musicFade = 1.4;
      }
      this.#startScheduler();
      this.#applyVolumes();
    } else {
      // Fundido y suspender: sin CPU mientras no se oye.
      this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      this.suspendTimer = setTimeout(() => {
        if (ctx.state === 'running') ctx.suspend().catch(() => {});
        this.#stopScheduler();
      }, 400);
    }
  }

  #startScheduler() {
    if (this.timer) return;
    const tick = () => {
      if (!this.running) return;
      const until = this.ctx.currentTime + 1.2;
      this.score.scheduleUntil(until);
      this.ambience?.schedule(until);
    };
    tick();
    this.timer = setInterval(tick, 200);
  }

  #stopScheduler() {
    clearInterval(this.timer);
    this.timer = null;
  }

  #applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const curve = (v) => Math.max(0, Math.min(1, Number(v) || 0)) ** 1.6; // respuesta más natural al oído
    this.master.gain.setTargetAtTime(this.wanted ? curve(settings.volume) : 0, t, 0.12);
    this.musicVol.gain.setTargetAtTime(curve(settings.music), t, this.musicFade ?? 0.1);
    this.musicFade = 0.1;
    this.sfxVol.gain.setTargetAtTime(curve(settings.sfx), t, 0.08);
  }

  #applyDucking() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const music = this.media ? 0 : this.minigame ? 0.4 : this.paused ? 0.55 : 1;
    const amb = this.media ? 0 : this.minigame ? 0.2 : this.paused ? 0.35 : 1;
    this.musicDuck.gain.setTargetAtTime(music, t, 0.25);
    this.ambDuck.gain.setTargetAtTime(amb, t, 0.25);
    this.musicFilter.frequency.setTargetAtTime(this.minigame ? 700 : this.paused ? 1300 : 20000, t, 0.2);
  }

  #setReverb(seconds) {
    const ctx = this.ctx;
    const key = Math.round(seconds * 10) / 10;
    let buffer = this.reverbCache.get(key);
    if (!buffer) {
      buffer = toBuffer(ctx, reverbIR(ctx.sampleRate, Math.max(0.3, key), { seed: 5, damping: 0.6 }));
      this.reverbCache.set(key, buffer);
    }
    // Un convolver nuevo por sala (cambiar el buffer de uno en uso no es fiable en todos lados).
    const conv = ctx.createConvolver();
    conv.buffer = buffer;
    const old = this.convolver;
    this.reverbSend.connect(conv).connect(this.reverbOut);
    if (old) {
      this.reverbSend.disconnect(old);
      setTimeout(() => old.disconnect(), 3000);
    }
    this.convolver = conv;
  }

  #buffer(name) {
    let b = this.buffers.get(name);
    if (b === undefined) {
      const recipe = SFX[name];
      b = recipe ? toBuffer(this.ctx, recipe(this.ctx.sampleRate)) : null;
      this.buffers.set(name, b);
    }
    return b;
  }

  #flushUi() {
    const list = this.pendingUi;
    this.pendingUi = [];
    if (!this.ctx) return;
    const name = list.reduce((best, n) => ((UI_PRIORITY[n] ?? 0) > (UI_PRIORITY[best] ?? -1) ? n : best), null);
    if (!name) return;
    const now = performance.now();
    if (name === 'move') {
      if (now - this.lastMove < 45) return;
      this.lastMove = now;
    }
    this.play(name, { bus: this.uiBus, gain: name === 'move' ? 0.55 : 1 });
  }
}

export const audio = new AudioEngine();
