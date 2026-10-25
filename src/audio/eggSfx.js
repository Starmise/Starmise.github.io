import { rng, biquad, white, normalize, mixInto, decay, sweepSine, mtof } from './dsp.js';
import { SFX } from './sfx.js';

/**
 * Efectos del minijuego secreto (ui/breakout.js). Originales, sintetizados como el resto
 * (audio/sfx.js): ondas cuadradas de consola vieja mezcladas con las campanas de la mansión.
 * Viajan en el mismo bloque de JS que el minijuego y se añaden al catálogo SFX al cargarlo,
 * así que no pesan nada hasta que alguien introduce el código.
 */

const secs = (sr, s) => Math.round(sr * s);

function square(sr, seconds, freq, cutoff = 5000, duty = 0.5) {
  const n = secs(sr, seconds);
  const d = new Float32Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    d[i] = p % 1 < duty ? 0.6 : -0.6;
    p += freq(i / sr) / sr;
  }
  return biquad(d, sr, 'lowpass', cutoff, 0.7);
}

function bell(sr, seconds, hz, { ratio = 3.5, index = 2, tau = 0.4 } = {}) {
  const n = secs(sr, seconds);
  const d = new Float32Array(n);
  let pc = 0;
  let pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const mod = Math.sin(pm) * index * Math.exp(-t / (tau * 0.35));
    d[i] = Math.sin(pc + mod) * Math.exp(-t / tau) * Math.min(1, t / 0.002);
    pc += (2 * Math.PI * hz) / sr;
    pm += (2 * Math.PI * hz * ratio) / sr;
  }
  return d;
}

/** Nota cuadrada corta con caída (para arpegios). */
function blip(sr, midi, seconds = 0.09, tau = 0.04, duty = 0.5) {
  return decay(square(sr, seconds, () => mtof(midi), 4200, duty), sr, tau, 0.001);
}

/** Rebote en la barra: golpe grave + cuadrada. */
function paddle(sr) {
  const out = new Float32Array(secs(sr, 0.12));
  mixInto(out, decay(sweepSine(secs(sr, 0.1), sr, (t) => 180 - t * 600), sr, 0.025, 0.001), 0, 0.7);
  mixInto(out, blip(sr, 64, 0.07, 0.025, 0.25), 0, 0.6);
  return normalize(out, 0.7);
}

/** Rebote en la pared: más apagado. */
function wall(sr) {
  return normalize(decay(square(sr, 0.05, () => mtof(57), 1600), sr, 0.014, 0.001), 0.4);
}

/** Romper un ladrillo; la altura sube con `rate` según la fila. */
function brick(sr) {
  const out = new Float32Array(secs(sr, 0.14));
  mixInto(out, decay(square(sr, 0.12, (t) => mtof(72) * (1 - t * 1.5), 4000), sr, 0.035, 0.001), 0, 0.8);
  const rand = rng(41);
  const crunch = biquad(white(secs(sr, 0.05), rand), sr, 'bandpass', 3200, 1.2);
  mixInto(out, decay(crunch, sr, 0.01, 0.001), 0, 0.35);
  return normalize(out, 0.6);
}

/** Primer golpe a un ladrillo duro: se agrieta. */
function crack(sr) {
  const out = new Float32Array(secs(sr, 0.16));
  const rand = rng(42);
  const n = biquad(white(secs(sr, 0.12), rand), sr, 'bandpass', 1400, 1.6);
  mixInto(out, decay(n, sr, 0.02, 0.001), 0, 0.8);
  mixInto(out, decay(square(sr, 0.1, () => mtof(52), 1200), sr, 0.03, 0.001), 0, 0.5);
  return normalize(out, 0.6);
}

/** Hierro (no se rompe): campana inarmónica corta. */
function iron(sr) {
  const out = new Float32Array(secs(sr, 0.35));
  mixInto(out, bell(sr, 0.35, 523, { ratio: 2.76, index: 3, tau: 0.09 }), 0, 0.7);
  mixInto(out, bell(sr, 0.35, 811, { ratio: 1.41, index: 2, tau: 0.06 }), 0, 0.35);
  return normalize(out, 0.55);
}

function launch(sr) {
  return normalize(decay(square(sr, 0.14, (t) => 330 + t * 2600, 4500, 0.25), sr, 0.06, 0.002), 0.45);
}

/** Atrapar un archivo: papel + campanita ascendente. */
function file(sr) {
  const out = new Float32Array(secs(sr, 0.6));
  const rand = rng(43);
  const slide = biquad(white(secs(sr, 0.12), rand), sr, 'bandpass', (t) => 1800 + t * 9000, 0.9);
  for (let i = 0; i < slide.length; i++) slide[i] *= Math.sin((Math.PI * i) / slide.length);
  mixInto(out, slide, 0, 0.35);
  [74, 78, 81, 86].forEach((m, i) => mixInto(out, bell(sr, 0.45, mtof(m), { tau: 0.18, index: 1.2 }), secs(sr, 0.04 + i * 0.055), 0.35));
  return normalize(out, 0.6);
}

/** Vida extra. */
function life(sr) {
  const out = new Float32Array(secs(sr, 0.5));
  [69, 73, 76, 81, 85].forEach((m, i) => mixInto(out, blip(sr, m, 0.09, 0.05, 0.25), secs(sr, i * 0.06), 0.6));
  return normalize(out, 0.55);
}

/** Se escapó la estrella: cae con vibrato. */
function lose(sr) {
  const n = secs(sr, 0.8);
  const d = square(sr, 0.8, (t) => 440 * 2 ** (-t * 2.4) * (1 + 0.03 * Math.sin(t * 2 * Math.PI * 9)), 2400);
  for (let i = 0; i < n; i++) d[i] *= Math.min(1, (n - i) / (sr * 0.1));
  return normalize(d, 0.5);
}

/** Muro derribado: arpegio en Re menor que se resuelve hacia arriba. */
function clear(sr) {
  const out = new Float32Array(secs(sr, 1.6));
  [62, 65, 69, 74, 77, 81].forEach((m, i) => mixInto(out, blip(sr, m, 0.12, 0.06), secs(sr, i * 0.075), 0.5));
  mixInto(out, bell(sr, 1.1, mtof(86), { tau: 0.45, index: 1.4, ratio: 2.01 }), secs(sr, 0.45), 0.6);
  mixInto(out, bell(sr, 1.1, mtof(81), { tau: 0.4, index: 1.1, ratio: 2.01 }), secs(sr, 0.47), 0.4);
  return normalize(out, 0.6);
}

/** Fin del juego: campanas graves que bajan (el tono de la mansión). */
function over(sr) {
  const out = new Float32Array(secs(sr, 2.6));
  [[62, 0], [58, 0.35], [55, 0.7], [50, 1.05]].forEach(([m, at]) => {
    mixInto(out, bell(sr, 1.5, mtof(m), { tau: 0.6, index: 1.8, ratio: 2.01 }), secs(sr, at), 0.6);
    mixInto(out, blip(sr, m - 12, 0.25, 0.12, 0.5), secs(sr, at), 0.3);
  });
  return normalize(out, 0.65);
}

/** El código Konami: arpegio rapidísimo hacia arriba y un acorde de campanas. */
function secret(sr) {
  const out = new Float32Array(secs(sr, 1.8));
  [50, 57, 62, 65, 69, 74, 77, 81, 86].forEach((m, i) => mixInto(out, blip(sr, m, 0.08, 0.04, 0.25), secs(sr, i * 0.045), 0.45));
  for (const [m, g] of [[74, 0.6], [81, 0.45], [86, 0.35], [89, 0.25]]) {
    mixInto(out, bell(sr, 1.3, mtof(m), { tau: 0.5, index: 1.6, ratio: 2.01 }), secs(sr, 0.42), g);
  }
  return normalize(out, 0.7);
}

Object.assign(SFX, {
  eggPaddle: paddle,
  eggWall: wall,
  eggBrick: brick,
  eggCrack: crack,
  eggIron: iron,
  eggLaunch: launch,
  eggFile: file,
  eggLife: life,
  eggLose: lose,
  eggClear: clear,
  eggOver: over,
  eggSecret: secret,
});
