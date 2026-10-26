import { mtof } from './dsp.js';

/**
 * Ambientes por sala (campo `ambience` de rooms.json). Capas continuas hechas con ruido y
 * osciladores, más eventos sueltos (crujidos, el reloj del Hall, discos duros, pitidos de
 * máquinas arcade). Todo sale del motor (buffers de ruido y de efectos ya generados).
 *
 *   rumble  retumbo grave de la casa           hum    zumbido eléctrico de 60 Hz
 *   wind    viento que entra por las ventanas   fan    ventiladores (CRT, servidores)
 *   rain    lluvia sobre el techo               buzz   tubos de neón
 *   clock   reloj de pie (tic-tac)              creaks / seeks / bleeps / clinks  [min s, max s, volumen]
 */
export const AMBIENCES = {
  hall: { rumble: 0.05, wind: 0.035, rain: 0.008, clock: 0.06, creaks: [14, 38, 0.11] },
  gallery: { rumble: 0.045, wind: 0.02, creaks: [10, 30, 0.13] },
  studio: { rumble: 0.03, hum: 0.012, fan: 0.012, creaks: [25, 60, 0.08] },
  lab: { rumble: 0.02, hum: 0.016, fan: 0.03, seeks: [2.5, 8, 0.05] },
  arcade: { rumble: 0.025, hum: 0.012, buzz: 0.0035, bleeps: [6, 15, 0.014] },
  save: { rumble: 0.02, rain: 0.035 },
  // Taller: tubos fluorescentes, lluvia en el tejado y alguna herramienta metálica que tintinea.
  workshop: { rumble: 0.035, hum: 0.009, rain: 0.012, creaks: [20, 50, 0.07], clinks: [8, 22, 0.06] },
};

const PENTA = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84]; // Re menor pentatónica (como la música)

export class Ambience {
  /**
   * @param engine  el motor de audio (contexto, buffers de ruido y efectos, buses)
   * @param name    clave de AMBIENCES
   */
  constructor(engine, name, when) {
    this.engine = engine;
    this.ctx = engine.ctx;
    this.preset = AMBIENCES[name] ?? AMBIENCES.hall;
    this.sources = [];
    this.next = {};
    this.tickTock = false;

    this.out = this.ctx.createGain();
    this.out.gain.setValueAtTime(0, when);
    this.out.connect(engine.ambBus);
    this.#build(when);

    const t = when;
    const p = this.preset;
    if (p.clock) this.next.clock = t + 0.5;
    for (const key of ['creaks', 'seeks', 'bleeps', 'clinks']) if (p[key]) this.next[key] = t + this.#wait(p[key]) * 0.5;
  }

  fadeIn(when, seconds = 2.5) {
    this.out.gain.setTargetAtTime(1, when, seconds / 3);
  }

  /** Funde y para todo; el objeto ya no se reutiliza. */
  stop(when, seconds = 1.2) {
    this.stopped = true;
    this.out.gain.cancelScheduledValues(when);
    this.out.gain.setTargetAtTime(0, when, seconds / 4);
    for (const s of this.sources) {
      try {
        s.stop(when + seconds + 0.1);
      } catch {
        /* ya parada */
      }
    }
    setTimeout(() => this.out.disconnect(), (seconds + 0.5) * 1000);
  }

  /** Agenda los eventos sueltos que caigan antes de `until`. */
  schedule(until) {
    if (this.stopped) return;
    const p = this.preset;
    const e = this.engine;
    while (p.clock && this.next.clock < until) {
      this.tickTock = !this.tickTock;
      e.play(this.tickTock ? 'tick' : 'tock', { when: this.next.clock, gain: p.clock, bus: this.out, reverb: 0.5 });
      this.next.clock += 1;
    }
    while (p.creaks && this.next.creaks < until) {
      const [, , gain] = p.creaks;
      const which = `woodCreak${Math.floor(Math.random() * 3)}`;
      e.play(which, { when: this.next.creaks, gain: gain * (0.5 + Math.random() * 0.5), rate: 0.75 + Math.random() * 0.4, bus: this.out, reverb: 0.8 });
      this.next.creaks += this.#wait(p.creaks);
    }
    while (p.seeks && this.next.seeks < until) {
      // Un disco duro buscando: unos clics muy cortos seguidos.
      const [, , gain] = p.seeks;
      const n = 3 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        e.play('latch', { when: this.next.seeks + i * (0.03 + Math.random() * 0.04), gain: gain * (0.4 + Math.random() * 0.6), rate: 2.2 + Math.random() * 0.6, bus: this.out });
      }
      this.next.seeks += this.#wait(p.seeks);
    }
    while (p.clinks && this.next.clinks < until) {
      // Una herramienta que se asienta en su gancho: dos golpecitos metálicos graves.
      const [, , gain] = p.clinks;
      const rate = 0.5 + Math.random() * 0.3;
      for (let i = 0; i < 2; i++) {
        e.play('latch', { when: this.next.clinks + i * (0.09 + Math.random() * 0.08), gain: gain * (i ? 0.45 : 1), rate: rate * (i ? 1.12 : 1), bus: this.out, reverb: 0.9 });
      }
      this.next.clinks += this.#wait(p.clinks);
    }
    while (p.bleeps && this.next.bleeps < until) {
      this.#bleeps(this.next.bleeps, p.bleeps[2]);
      this.next.bleeps += this.#wait(p.bleeps);
    }
  }

  #wait([min, max]) {
    return min + Math.random() * (max - min);
  }

  #loop(buffer, when) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.start(when, Math.random() * buffer.duration);
    this.sources.push(s);
    return s;
  }

  #filter(type, freq, q = 0.707) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  #gain(value) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return g;
  }

  #lfo(freq, depth, target, when) {
    const o = this.ctx.createOscillator();
    o.frequency.value = freq;
    const g = this.#gain(depth);
    o.connect(g).connect(target);
    o.start(when);
    this.sources.push(o);
  }

  #build(when) {
    const { ctx, preset: p, engine: e } = this;
    if (p.rumble) {
      this.#loop(e.noise.brown, when).connect(this.#filter('lowpass', 170)).connect(this.#gain(p.rumble)).connect(this.out);
    }
    if (p.wind) {
      const bp = this.#filter('bandpass', 480, 1.3);
      const g = this.#gain(p.wind);
      this.#loop(e.noise.pink, when).connect(bp).connect(g).connect(this.out);
      this.#lfo(1 / 11, 260, bp.frequency, when); // el viento cambia de tono
      this.#lfo(1 / 19, p.wind * 0.6, g.gain, when); // y de fuerza (ráfagas)
    }
    if (p.rain) {
      const hp = this.#filter('highpass', 900);
      const lp = this.#filter('lowpass', 5200);
      this.#loop(e.noise.white, when).connect(hp).connect(lp).connect(this.#gain(p.rain)).connect(this.out);
      const drum = this.#filter('bandpass', 260, 0.8); // la lluvia en el tejado, más grave
      this.#loop(e.noise.pink, when).connect(drum).connect(this.#gain(p.rain * 1.6)).connect(this.out);
    }
    if (p.hum) {
      const g = this.#gain(p.hum);
      g.connect(this.out);
      for (const [hz, amp] of [[60, 1], [120, 0.55], [180, 0.3], [240, 0.12]]) {
        const o = ctx.createOscillator();
        o.frequency.value = hz * (0.998 + Math.random() * 0.004);
        o.connect(this.#gain(amp)).connect(g);
        o.start(when);
        this.sources.push(o);
      }
    }
    if (p.fan) {
      const lp = this.#filter('lowpass', 1400);
      const hp = this.#filter('highpass', 140);
      const g = this.#gain(p.fan);
      this.#loop(e.noise.pink, when).connect(hp).connect(lp).connect(g).connect(this.out);
      this.#lfo(0.31, p.fan * 0.12, g.gain, when);
    }
    if (p.buzz) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 120;
      const g = this.#gain(p.buzz);
      o.connect(this.#filter('bandpass', 2600, 1.2)).connect(g).connect(this.out);
      o.start(when);
      this.sources.push(o);
      this.#lfo(7.3, p.buzz * 0.35, g.gain, when); // parpadeo del neón
    }
  }

  /** Máquinas arcade en modo demostración, a lo lejos: un arpegio corto de onda cuadrada. */
  #bleeps(when, gain) {
    const ctx = this.ctx;
    const lp = this.#filter('lowpass', 1500);
    const g = this.#gain(gain);
    lp.connect(g).connect(this.out);
    g.connect(this.engine.reverbSend);
    const n = 3 + Math.floor(Math.random() * 4);
    const start = Math.floor(Math.random() * (PENTA.length - n));
    const up = Math.random() < 0.6;
    const step = 0.075 + Math.random() * 0.03;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = mtof(PENTA[up ? start + i : start + n - 1 - i]);
      const env = this.#gain(0);
      const t = when + i * step;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(1, t + 0.005);
      env.gain.setTargetAtTime(0, t + 0.005, step * 0.6);
      o.connect(env).connect(lp);
      o.start(t);
      o.stop(t + step * 4);
      if (i === n - 1) o.onended = () => g.disconnect();
    }
  }
}
