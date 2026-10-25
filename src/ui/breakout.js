import { t } from '../core/i18n.js';
import { reducedMotion } from '../core/motion.js';
import { haptic } from '../core/haptics.js';
import { projectDocument } from './documents.js';
import { focusFirst } from './uiStack.js';
import '../audio/eggSfx.js'; // añade los efectos eggPaddle, eggBrick… al catálogo de audio

/**
 * Easter egg: "STARMISE · Rompemuros", un rompe-ladrillos de consola vieja escondido tras el
 * código Konami (core/konami.js, lo abre game.js). Se descarga solo la primera vez que alguien
 * lo encuentra.
 *
 * - Capa de la UiStack (pausa la mansión, que queda congelada detrás) con su propio estado.
 *   El bucle del juego llama a `frame(dt)` mientras está abierta y deja de dibujar el 3D.
 * - Se dibuja en un canvas de 320×240 (la resolución de la época) escalado sin suavizado, con
 *   la paleta del portafolio. Marcador, avisos y menús son HTML (nítidos, traducibles y accesibles).
 * - La estrella del favicon es la pelota, la barra lleva las franjas de la chaqueta del
 *   personaje y los niveles son la firma STARMISE, la estrella y la mansión.
 * - Los ladrillos de papel sueltan archivos del portafolio: si se atrapan, se pueden abrir al
 *   final de la partida (la ficha de siempre) y quedan en una colección que se recuerda.
 * - Controles: ←/→, A/D o ratón; stick o cruceta; arrastrar en táctil. Lanzar con Espacio,
 *   Enter, ↑, clic, Ⓐ o un toque. Esc / Start / ❚❚ pausa.
 */

const W = 320;
const H = 240;
const R = 2.5; // radio de la pelota (px internos)
const HIT_R = 2; // radio para chocar con ladrillos (un poco más permisivo)
const PADDLE = { w: 44, h: 6, y: 222, speed: 240 };
const MAX_ANGLE = (62 * Math.PI) / 180;
const LIVES = 3;
const MAX_LIVES = 5;
const EXTRA_LIFE_EVERY = 4000;
const FILES_PER_LEVEL = 3;
const STORE_KEY = 'starmise.egg';

// Paleta del portafolio (style.css): hueso, rojo, rojo oscuro, papel y hierro.
const BRICKS = {
  w: { base: '#d8d2c4', hi: '#f4eedf', lo: '#8a8578', hp: 1, pts: 50 },
  r: { base: '#a3172c', hi: '#d03a52', lo: '#5e0d19', hp: 1, pts: 70 },
  d: { base: '#6a0e1c', hi: '#952a40', lo: '#30060c', hp: 2, pts: 120 },
  i: { base: '#3a3530', hi: '#615c52', lo: '#191614', hp: Infinity, pts: 0 },
};
const PAPER = { base: '#d9cfb6', hi: '#f3ead2', lo: '#9c8f70', pts: 150 };

// ---------- Niveles ----------

// Letras de 5 de alto para la firma.
const GLYPHS = {
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  E: ['###', '#..', '##.', '#..', '###'],
};

function word(text, brick, cols) {
  const rows = ['', '', '', '', ''];
  [...text].forEach((ch, i) => {
    GLYPHS[ch].forEach((line, y) => (rows[y] += (i ? '.' : '') + line.replaceAll('#', brick)));
  });
  return rows.map((r) => r.padStart(r.length + Math.floor((cols - r.length) / 2), '.').padEnd(cols, '.'));
}

const LEVELS = [
  {
    name: 'egg.level1', // La firma
    rows: ['d'.repeat(17), '', ...word('STAR', 'w', 17), '', ...word('MISE', 'r', 17)],
  },
  {
    name: 'egg.level2', // La estrella (el favicon, píxel a píxel)
    rows: [
      '.......ww.......',
      '.......wd.......',
      '......wrrw......',
      '......wrrd......',
      '.....wrrrrw.....',
      'wwwwwrrrrrrwwwww',
      '.wdrrrrrrrrrrdd.',
      '...wrrrrrrrrd...',
      '....wrrrrrrd....',
      '....wrrddrrd....',
      '...wrrd..wrrw...',
      '...wrd....wrd...',
      '..wrd......wrw..',
      '..wd........wd..',
    ],
  },
  {
    name: 'egg.level3', // La mansión (el hierro no se rompe)
    rows: [
      '.......ii.......',
      '......drrd......',
      '.....drrrrd.....',
      '....drrrrrrd....',
      '...drrrrrrrrd...',
      '..drrrrrrrrrrd..',
      '.iiiwwiiiiwwiii.',
      '.wwwwwwwwwwwwww.',
      '.ww..wwrrww..ww.',
      '.ww..wwrrww..ww.',
      '.wwwwwwwwwwwwww.',
      '.wwwwwiddiwwwww.',
      '.wwwwwiddiwwwww.',
    ],
  },
];

// La pelota: una estrellita de 5×5 (h = hueso, r = rojo).
const STAR = ['..h..', '.hrh.', 'hrrrh', '.hrh.', '.h.h.'];

// ---------- Utilidades ----------

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad6 = (n) => String(Math.max(0, Math.floor(n))).padStart(6, '0');

function loadStore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    return { best: Number(data.best) || 0, files: Array.isArray(data.files) ? data.files.filter((f) => typeof f === 'string') : [] };
  } catch {
    return { best: 0, files: [] };
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* sin almacenamiento (modo privado): el récord dura lo que la visita */
  }
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Fondo: degradado con el tramado 4×4 de la consola y un papel tapiz tenue. */
function paintBackground() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const top = [24, 19, 28];
  const bottom = [9, 8, 11];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (y / H) * 4; // 4 escalones de color mezclados con el tramado
      const step = Math.floor(k + (bayer[(y & 3) * 4 + (x & 3)] + 0.5) / 16);
      const f = clamp(step / 4, 0, 1);
      // Papel tapiz: rombos de 16 px apenas visibles.
      const dx = Math.abs((x % 16) - 8);
      const dy = Math.abs((y % 16) - 8);
      const motif = dx + dy === 6 ? 5 : 0;
      const i = (y * W + x) * 4;
      for (let ch = 0; ch < 3; ch++) img.data[i + ch] = Math.round(top[ch] + (bottom[ch] - top[ch]) * f) + motif;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#2a2622';
  g.fillRect(0, 0, W, 1);
  g.fillRect(0, 0, 1, H);
  g.fillRect(W - 1, 0, 1, H);
  return c;
}

// ---------- Minijuego ----------

export class Breakout {
  constructor(root, stack, { input, audio, fileView, projects }) {
    this.stack = stack;
    this.input = input;
    this.audio = audio;
    this.fileView = fileView;
    this.projects = projects;
    this.store = loadStore();

    this.state = 'closed'; // closed | attract | serve | play | dying | clear | paused | over
    this.demo = false;
    this.held = { left: false, right: false };
    this.bricks = [];
    this.drops = [];
    this.particles = [];
    this.trail = [];
    this.runFiles = [];
    this.paddle = { x: (W - PADDLE.w) / 2, w: PADDLE.w, flash: 0 };
    this.ball = { x: W / 2, y: PADDLE.y - R, vx: 0, vy: 0 };
    this.time = 0;
    this.shake = 0;
    this.touch = null; // arrastre táctil activo
    this.device = null;

    this.#build(root);
    this.bg = paintBackground();
    this.#listen();

    this.layer = {
      el: this.panel,
      onShow: () => {
        this.el.hidden = false;
        this.el.classList.remove('is-on');
        void this.el.offsetWidth; // reinicia la animación de encendido del CRT
        this.el.classList.add('is-on');
      },
      onHide: () => {
        this.el.hidden = true;
        this.state = 'closed';
        this.held.left = this.held.right = false;
        this.touch = null;
        this.audio.setMinigame(false);
      },
      onAction: (action) => this.#onAction(action),
      sounds: { open: null, close: 'close' },
    };
  }

  get isOpen() {
    return this.stack.layers.includes(this.layer);
  }

  open() {
    if (this.isOpen) return;
    this.stack.push(this.layer);
    this.audio.setMinigame(true);
    this.audio.play('eggSecret', { gain: 0.8 });
    this.#attract();
  }

  close() {
    this.stack.pop(this.layer);
  }

  /** Lo llama el bucle del juego en cada frame mientras está abierto. */
  frame(rawDt) {
    const dt = Math.min(Math.max(rawDt, 0), 1 / 30);
    if (this.input.lastDevice !== this.device) this.#paintHint();
    // Con una ficha abierta encima (archivos recuperados) el minijuego espera.
    if (this.stack.top === this.layer) this.#update(dt);
    this.#draw();
  }

  // ---------- Interfaz ----------

  #build(root) {
    this.el = document.createElement('div');
    this.el.className = 'egg';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="egg__panel" role="dialog" aria-modal="true" aria-label="${t('egg.aria')}" tabindex="-1">
        <header class="egg__head">
          <p class="egg__brand" aria-hidden="true">${t('egg.logo')}</p>
          <dl class="egg__stats">
            <div><dt>${t('egg.score')}</dt><dd data-stat="score">000000</dd></div>
            <div><dt>${t('egg.best')}</dt><dd data-stat="best">000000</dd></div>
            <div><dt>${t('egg.levelShort')}</dt><dd data-stat="level">1-1</dd></div>
            <div><dt class="egg__sr">${t('egg.lives')}</dt><dd data-stat="lives" class="egg__lives"></dd></div>
          </dl>
          <div class="egg__tools">
            <button type="button" class="egg__tool" data-act="pause" aria-label="${t('egg.pause')}">❚❚</button>
            <button type="button" class="egg__tool" data-act="close" aria-label="${t('egg.close')}">✕</button>
          </div>
        </header>
        <div class="egg__screen">
          <canvas width="${W}" height="${H}" aria-hidden="true"></canvas>
          <p class="egg__banner" aria-live="polite"></p>
          <p class="egg__toast" role="status"></p>
          <div class="egg__card" hidden></div>
        </div>
        <p class="egg__hint"></p>
      </div>
    `;
    root.append(this.el);
    this.panel = this.el.querySelector('.egg__panel');
    this.screen = this.el.querySelector('.egg__screen');
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.card = this.el.querySelector('.egg__card');
    this.banner = this.el.querySelector('.egg__banner');
    this.toastEl = this.el.querySelector('.egg__toast');
    this.hint = this.el.querySelector('.egg__hint');
    this.pauseBtn = this.el.querySelector('[data-act="pause"]');
    this.stats = Object.fromEntries([...this.el.querySelectorAll('[data-stat]')].map((el) => [el.dataset.stat, el]));
    this.statCache = {};

    this.el.addEventListener('click', (e) => {
      const file = e.target.closest('[data-file]');
      if (file) return this.#openFile(file.dataset.file);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'start') this.#start();
      else if (act === 'resume') this.#resume();
      else if (act === 'restart') this.#start();
      else if (act === 'pause') this.state === 'paused' ? this.#resume() : this.#pause();
      else if (act === 'close') this.close();
    });
  }

  #listen() {
    const active = () => this.isOpen && this.stack.top === this.layer;
    const playing = () => ['serve', 'play', 'dying', 'clear'].includes(this.state);

    // Teclado (fase de captura: antes que la UiStack, para que las flechas muevan la barra).
    window.addEventListener(
      'keydown',
      (e) => {
        if (!active() || !playing()) return;
        const dir = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }[e.code];
        if (dir) {
          this.held[dir] = true;
          this.touch = null;
          e.preventDefault();
        } else if (['Space', 'Enter', 'ArrowUp', 'KeyW'].includes(e.code)) {
          if (!e.repeat) this.#launch();
          e.preventDefault();
        } else if (e.code === 'KeyP' && !e.repeat) {
          this.#pause();
          e.preventDefault();
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') e.preventDefault();
      },
      { capture: true },
    );
    window.addEventListener('keyup', (e) => {
      const dir = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' }[e.code];
      if (dir) this.held[dir] = false;
    });
    window.addEventListener('blur', () => (this.held.left = this.held.right = false));

    // Ratón: la barra sigue al puntero sobre la pantalla; clic lanza.
    // Táctil: arrastrar en cualquier parte (también fuera de la pantalla) mueve la barra; un toque lanza.
    this.el.addEventListener('pointerdown', (e) => {
      if (!active() || !playing() || e.target.closest('button, a')) return;
      if (e.pointerType === 'mouse') {
        this.#mouseTo(e.clientX);
        if (e.button === 0) this.#launch();
        return;
      }
      e.preventDefault();
      this.touch = { id: e.pointerId, x: e.clientX, startX: e.clientX, startY: e.clientY, t: performance.now() };
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* sin captura: el arrastre se sigue mientras el dedo esté encima */
      }
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!active() || !playing()) return;
      if (e.pointerType === 'mouse') {
        if (e.target.closest('.egg__screen')) this.#mouseTo(e.clientX);
        return;
      }
      if (!this.touch || e.pointerId !== this.touch.id) return;
      const rect = this.canvas.getBoundingClientRect();
      const scale = W / Math.max(rect.width, 1);
      this.paddle.x = clamp(this.paddle.x + (e.clientX - this.touch.x) * scale * 1.15, 0, W - this.paddle.w);
      this.touch.x = e.clientX;
    });
    const end = (e) => {
      const tch = this.touch;
      if (!tch || e.pointerId !== tch.id) return;
      this.touch = null;
      const moved = Math.hypot(e.clientX - tch.startX, e.clientY - tch.startY);
      if (e.type === 'pointerup' && moved < 12 && performance.now() - tch.t < 320) this.#launch();
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);

    // Al cambiar de pestaña o de app, a la pausa.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isOpen && playing()) this.#pause();
    });
  }

  #mouseTo(clientX) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * W;
    this.paddle.x = clamp(x - this.paddle.w / 2, 0, W - this.paddle.w);
  }

  #onAction(action) {
    switch (this.state) {
      case 'serve':
      case 'play':
      case 'dying':
      case 'clear':
        if (action === 'back' || action === 'pause') this.#pause();
        else if (action === 'confirm') this.#launch();
        // Las direcciones del mando se leen como eje en #update; aquí solo se absorben.
        return true;
      case 'paused':
        if (action === 'back' || action === 'pause') {
          this.#resume();
          return true;
        }
        return false;
      default: // attract, over
        if (action === 'back') {
          this.close();
          return true;
        }
        return action === 'pause';
    }
  }

  #showCard(kind) {
    const s = this.store;
    const total = this.projects.length;
    const collected = s.files.filter((id) => this.projects.some((p) => p.id === id)).length;
    let html = '';
    if (kind === 'attract') {
      html = `
        <p class="egg__found">${t('egg.found')}</p>
        <h2 class="egg__big">${t('egg.logo')}</h2>
        <p class="egg__sub">${t('egg.subtitle')}</p>
        <p class="egg__text">${t('egg.howto')}</p>
        <p class="egg__meta">${t('egg.best')} ${pad6(s.best)} · ${t('egg.collection', { n: collected, total })}</p>
        <div class="egg__menu">
          <button type="button" data-act="start" data-sfx="start">${t('egg.play')}</button>
          <button type="button" data-act="close" data-sfx="back">${t('egg.exit')}</button>
        </div>`;
    } else if (kind === 'paused') {
      html = `
        <h2 class="egg__big egg__big--small">${t('egg.paused')}</h2>
        <div class="egg__menu">
          <button type="button" data-act="resume">${t('egg.resume')}</button>
          <button type="button" data-act="restart">${t('egg.restart')}</button>
          <button type="button" data-act="close" data-sfx="back">${t('egg.exit')}</button>
        </div>`;
    } else if (kind === 'over') {
      const level = LEVELS[this.levelIndex];
      html = `
        <h2 class="egg__big egg__big--red">${t('egg.over')}</h2>
        <p class="egg__meta">${t('egg.score')} ${pad6(this.score)} · ${t('egg.best')} ${pad6(s.best)}${
          this.newBest ? ` <strong class="egg__new">${t('egg.newBest')}</strong>` : ''
        }</p>
        <p class="egg__meta">${t('egg.reached', { level: this.#levelLabel(), name: t(level.name) })}</p>
        <h3 class="egg__h3">${t('egg.filesRun')}</h3>
        ${this.runFiles.length ? '<ul class="egg__files"></ul>' : `<p class="egg__text">${t('egg.filesNone')}</p>`}
        <p class="egg__meta">${t('egg.collection', { n: collected, total })}</p>
        <div class="egg__menu">
          <button type="button" data-act="start" data-sfx="start">${t('egg.again')}</button>
          <button type="button" data-act="close" data-sfx="back">${t('egg.exit')}</button>
        </div>`;
    }
    this.card.innerHTML = html;
    const list = this.card.querySelector('.egg__files');
    if (list) {
      for (const id of this.runFiles) {
        const p = this.projects.find((x) => x.id === id);
        if (!p) continue;
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.file = id;
        b.dataset.sfx = 'file';
        b.textContent = p.title;
        li.append(b);
        list.append(li);
      }
    }
    this.card.hidden = false;
    this.card.scrollTop = 0;
    this.pauseBtn.hidden = kind !== 'paused';
    this.banner.textContent = '';
    focusFirst(this.card.querySelector('.egg__menu') ?? this.card);
  }

  #hideCard() {
    this.card.hidden = true;
    this.card.innerHTML = '';
    this.pauseBtn.hidden = false;
    this.panel.focus({ preventScroll: true });
  }

  #openFile(id) {
    const ids = this.runFiles.filter((x) => this.projects.some((p) => p.id === x));
    const docs = ids.map((x) => {
      const p = this.projects.find((q) => q.id === x);
      return projectDocument(p, this.projects.indexOf(p));
    });
    const index = Math.max(0, ids.indexOf(id));
    if (docs.length) this.fileView.open(docs[index], { docs, index });
  }

  #paintHint() {
    this.device = this.input.lastDevice;
    this.hint.innerHTML = t(`egg.controls.${this.device}`);
    if (this.state === 'serve') this.banner.textContent = this.#serveBanner();
  }

  #serveBanner() {
    return this.bannerTimer > 0 ? this.bannerText : t(`egg.launch.${this.device ?? 'keyboard'}`);
  }

  #paintStats() {
    const lives = '★'.repeat(Math.max(0, this.lives ?? 0));
    const values = {
      score: pad6(this.demo ? 0 : this.score),
      best: pad6(Math.max(this.store.best, this.demo ? 0 : this.score)),
      level: this.#levelLabel(),
      lives,
    };
    for (const [k, v] of Object.entries(values)) {
      if (this.statCache[k] === v) continue;
      this.statCache[k] = v;
      this.stats[k].textContent = v;
    }
    this.stats.lives.setAttribute('aria-label', t('egg.livesLeft', { n: this.lives ?? 0 }));
  }

  #levelLabel() {
    return `${this.round ?? 1}-${(this.levelIndex ?? 0) + 1}`;
  }

  #toast(text, seconds = 2.2) {
    this.toastEl.textContent = text;
    this.toastTimer = seconds;
  }

  #sfx(name, opts) {
    if (!this.demo) this.audio.play(name, opts);
  }

  // ---------- Flujo de la partida ----------

  /** Pantalla de presentación: el nivel 1 se juega solo detrás del menú. */
  #attract() {
    this.demo = true;
    this.round = 1;
    this.lives = LIVES;
    this.score = 0;
    this.#loadLevel(0);
    this.state = 'attract';
    this.#resetBall();
    this.#launchBall();
    this.#paintStats();
    this.#paintHint();
    this.#showCard('attract');
  }

  #start() {
    this.demo = false;
    this.score = 0;
    this.lives = LIVES;
    this.round = 1;
    this.runFiles = [];
    this.newBest = false;
    this.nextExtra = EXTRA_LIFE_EVERY;
    this.toastTimer = 0;
    this.toastEl.textContent = '';
    this.#hideCard();
    this.#loadLevel(0);
    this.#serve(true);
    this.#paintStats();
  }

  #loadLevel(index) {
    this.levelIndex = index;
    const level = LEVELS[index];
    const rows = level.rows;
    const cols = Math.max(...rows.map((r) => r.length));
    const gap = 2;
    const margin = 8;
    const bw = Math.floor((W - margin * 2 - gap * (cols - 1)) / cols);
    const x0 = Math.round((W - (bw * cols + gap * (cols - 1))) / 2);
    const bh = rows.length > 13 ? 6 : 7;
    const top = 22;
    this.bricks = [];
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const kind = BRICKS[ch];
        if (!kind) return;
        this.bricks.push({ type: ch, x: x0 + x * (bw + gap), y: top + y * (bh + gap), w: bw, h: bh, row: y, hp: kind.hp, alive: true, flash: 0, file: false });
      });
    });
    // Ladrillos de papel: sueltan un archivo del portafolio.
    const candidates = shuffle(this.bricks.filter((b) => b.hp === 1));
    candidates.slice(0, FILES_PER_LEVEL).forEach((b) => (b.file = true));
    this.drops = [];
    this.particles = [];
    this.speed = 132 + index * 12 + (this.round - 1) * 22;
    this.maxSpeed = this.speed + 95;
  }

  #serve(newLevel = false) {
    this.state = 'serve';
    this.paddle.x = (W - this.paddle.w) / 2;
    this.#resetBall();
    this.bannerText = newLevel ? `${t('egg.level', { n: this.#levelLabel() })}\n${t(LEVELS[this.levelIndex].name)}` : '';
    this.bannerTimer = newLevel ? 2.2 : 0;
    this.banner.textContent = this.#serveBanner();
  }

  #resetBall() {
    const b = this.ball;
    b.x = this.paddle.x + this.paddle.w / 2;
    b.y = PADDLE.y - R - 0.5;
    b.vx = b.vy = 0;
    this.trail = [];
  }

  #launch() {
    if (this.state !== 'serve') return;
    this.state = 'play';
    this.banner.textContent = '';
    this.bannerTimer = 0;
    this.#launchBall();
    this.#sfx('eggLaunch', { gain: 0.6 });
  }

  #launchBall() {
    // Sale hacia arriba con un ángulo leve, hacia el lado donde está la barra respecto al centro.
    const side = this.paddle.x + this.paddle.w / 2 < W / 2 ? 1 : -1;
    const ang = side * (0.25 + Math.random() * 0.25);
    this.ball.vx = Math.sin(ang) * this.speed;
    this.ball.vy = -Math.cos(ang) * this.speed;
  }

  #pause() {
    if (!['serve', 'play', 'dying', 'clear'].includes(this.state)) return;
    this.resumeState = this.state;
    this.state = 'paused';
    this.held.left = this.held.right = false;
    this.audio.ui('open');
    this.#showCard('paused');
  }

  #resume() {
    if (this.state !== 'paused') return;
    this.state = this.resumeState ?? 'serve';
    this.audio.ui('close');
    this.#hideCard();
    if (this.state === 'serve') this.banner.textContent = this.#serveBanner();
  }

  #loseBall() {
    if (this.demo) {
      this.#resetBall();
      this.#launchBall();
      return;
    }
    this.lives--;
    this.state = 'dying';
    this.dyingTimer = 1.1;
    this.drops = [];
    this.banner.textContent = this.lives > 0 ? t('egg.ballLost') : '';
    this.#sfx('eggLose', { gain: 0.7 });
    this.#shake(4);
    if (this.input.lastDevice === 'touch') haptic('deny');
    this.#paintStats();
  }

  #levelClear() {
    if (this.demo) {
      this.#loadLevel(0);
      this.#resetBall();
      this.#launchBall();
      return;
    }
    // Lo que venía cayendo se recoge solo.
    for (const d of this.drops) this.#collect(d.id, true);
    this.drops = [];
    this.state = 'clear';
    this.clearTimer = 2.2;
    const last = this.levelIndex === LEVELS.length - 1;
    this.banner.textContent = last ? t('egg.mansionClear') : t('egg.clear');
    this.#addScore(500 * this.round);
    this.#sfx('eggClear', { gain: 0.8 });
  }

  #nextLevel() {
    let index = this.levelIndex + 1;
    if (index >= LEVELS.length) {
      index = 0;
      this.round++;
    }
    this.#loadLevel(index);
    this.#serve(true);
    this.#paintStats();
  }

  #gameOver() {
    this.state = 'over';
    if (this.score > this.store.best) {
      this.store.best = this.score;
      this.newBest = true;
      saveStore(this.store);
    }
    this.#sfx('eggOver', { gain: 0.8 });
    this.#paintStats();
    this.#showCard('over');
  }

  #addScore(points) {
    if (this.demo) return;
    this.score += points;
    if (this.score >= this.nextExtra) {
      this.nextExtra += EXTRA_LIFE_EVERY;
      if (this.lives < MAX_LIVES) {
        this.lives++;
        this.#toast(t('egg.extraLife'), 1.6);
        this.#sfx('eggLife', { gain: 0.6 });
      }
    }
    this.#paintStats();
  }

  /** Archivo atrapado (o recogido al terminar el nivel). */
  #collect(id, quiet = false) {
    if (this.runFiles.includes(id)) return;
    this.runFiles.push(id);
    if (!this.store.files.includes(id)) {
      this.store.files.push(id);
      saveStore(this.store);
    }
    this.#addScore(250 * this.round);
    const p = this.projects.find((x) => x.id === id);
    this.#toast(t('egg.fileGot', { title: p?.title ?? id }));
    if (!quiet) {
      this.#sfx('eggFile', { gain: 0.7 });
      if (this.input.lastDevice === 'touch') haptic('act');
    }
  }

  /** Qué archivo suelta un ladrillo de papel: primero los que aún no están en la colección. */
  #pickFile() {
    const taken = new Set([...this.runFiles, ...this.drops.map((d) => d.id)]);
    const free = this.projects.filter((p) => !taken.has(p.id));
    if (!free.length) return null;
    const fresh = free.filter((p) => !this.store.files.includes(p.id));
    const pool = fresh.length ? fresh : free;
    return pool[Math.floor(Math.random() * pool.length)].id;
  }

  #shake(px) {
    if (!reducedMotion()) this.shake = Math.max(this.shake, px);
  }

  // ---------- Simulación ----------

  #update(dt) {
    this.time += dt;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.textContent = '';
    }
    if (['paused', 'over'].includes(this.state)) return;

    this.shake = Math.max(0, this.shake - dt * 18);
    this.paddle.flash = Math.max(0, this.paddle.flash - dt);
    for (const b of this.bricks) if (b.flash > 0) b.flash -= dt;
    this.#updateParticles(dt);

    if (this.state === 'attract') {
      // La barra juega sola (sin ser perfecta).
      const target = this.ball.x - this.paddle.w / 2 + Math.sin(this.time * 1.3) * 12;
      const dx = clamp(target - this.paddle.x, -PADDLE.speed * 0.8 * dt, PADDLE.speed * 0.8 * dt);
      this.paddle.x = clamp(this.paddle.x + dx, 0, W - this.paddle.w);
      this.#stepBall(dt);
      return;
    }

    this.#movePaddle(dt);

    if (this.state === 'serve') {
      if (this.bannerTimer > 0) {
        this.bannerTimer -= dt;
        if (this.bannerTimer <= 0) this.banner.textContent = this.#serveBanner();
      }
      this.ball.x = this.paddle.x + this.paddle.w / 2;
      this.ball.y = PADDLE.y - R - 0.5;
    } else if (this.state === 'play') {
      this.#stepBall(dt);
      this.#updateDrops(dt);
    } else if (this.state === 'dying') {
      this.dyingTimer -= dt;
      if (this.dyingTimer <= 0) {
        if (this.lives > 0) this.#serve();
        else this.#gameOver();
      }
    } else if (this.state === 'clear') {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.#nextLevel();
    }
  }

  #movePaddle(dt) {
    const keys = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    const axis = this.input.pad.axes.x;
    const dir = keys || (Math.abs(axis) > 0.05 ? axis : 0);
    if (dir) this.paddle.x = clamp(this.paddle.x + dir * PADDLE.speed * dt, 0, W - this.paddle.w);
  }

  #stepBall(dt) {
    const b = this.ball;
    const dist = Math.hypot(b.vx, b.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / 1.5));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      // Eje X
      b.x += b.vx * h;
      if (b.x < R + 1) {
        b.x = R + 1;
        b.vx = Math.abs(b.vx);
        this.#sfx('eggWall', { gain: 0.4 });
      } else if (b.x > W - R - 1) {
        b.x = W - R - 1;
        b.vx = -Math.abs(b.vx);
        this.#sfx('eggWall', { gain: 0.4 });
      }
      let hit = this.#brickAt(b);
      if (hit) {
        b.x -= b.vx * h;
        b.vx = -b.vx;
        this.#hitBrick(hit);
      }
      // Eje Y
      b.y += b.vy * h;
      if (b.y < R + 1) {
        b.y = R + 1;
        b.vy = Math.abs(b.vy);
        this.#sfx('eggWall', { gain: 0.4 });
      }
      hit = this.#brickAt(b);
      if (hit) {
        b.y -= b.vy * h;
        b.vy = -b.vy;
        this.#hitBrick(hit);
      }
      if (this.state !== 'play' && this.state !== 'attract') return; // el nivel terminó con este golpe

      // Barra: el ángulo de salida depende de dónde pegue (centro = recto, bordes = abierto).
      const p = this.paddle;
      if (b.vy > 0 && b.y + R >= PADDLE.y && b.y - R <= PADDLE.y + PADDLE.h && b.x + R >= p.x && b.x - R <= p.x + p.w) {
        b.y = PADDLE.y - R;
        const off = clamp((b.x - (p.x + p.w / 2)) / (p.w / 2 + R), -1, 1);
        this.speed = Math.min(this.speed + 1.5, this.maxSpeed);
        const ang = off * MAX_ANGLE;
        b.vx = Math.sin(ang) * this.speed;
        b.vy = -Math.cos(ang) * this.speed;
        p.flash = 0.08;
        this.#sfx('eggPaddle', { gain: 0.55 });
        if (!this.demo && this.input.lastDevice === 'touch') haptic('tap');
      }
      if (b.y - R > H) {
        this.#loseBall();
        return;
      }
    }
    if (!reducedMotion()) {
      this.trail.push({ x: b.x, y: b.y });
      if (this.trail.length > 6) this.trail.shift();
    }
  }

  #brickAt(b) {
    for (const br of this.bricks) {
      if (!br.alive) continue;
      if (b.x + HIT_R > br.x && b.x - HIT_R < br.x + br.w && b.y + HIT_R > br.y && b.y - HIT_R < br.y + br.h) return br;
    }
    return null;
  }

  #hitBrick(br) {
    br.flash = 0.07;
    if (br.type === 'i') {
      this.#sfx('eggIron', { gain: 0.45 });
      return;
    }
    br.hp--;
    if (br.hp > 0) {
      this.#sfx('eggCrack', { gain: 0.55 });
      this.#addScore(10 * this.round);
      return;
    }
    br.alive = false;
    const kind = br.file ? PAPER : BRICKS[br.type];
    this.#addScore(kind.pts * this.round);
    this.speed = Math.min(this.speed + 0.5, this.maxSpeed);
    // Más agudo cuanto más arriba (escala pentatónica de Re).
    const steps = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31];
    const semis = steps[clamp(13 - br.row, 0, steps.length - 1)] - 7;
    this.#sfx('eggBrick', { gain: 0.5, rate: 2 ** (semis / 12) });
    this.#burst(br, br.file ? PAPER.base : BRICKS[br.type].base);
    this.#shake(1.2);
    if (br.file && !this.demo) {
      const id = this.#pickFile();
      if (id) this.drops.push({ x: br.x + br.w / 2, y: br.y + br.h / 2, id });
    }
    if (!this.bricks.some((b) => b.alive && b.type !== 'i')) this.#levelClear();
  }

  #updateDrops(dt) {
    const p = this.paddle;
    for (const d of this.drops) {
      d.y += 44 * dt;
      if (d.y + 4 >= PADDLE.y && d.y - 4 <= PADDLE.y + PADDLE.h && d.x + 5 >= p.x && d.x - 5 <= p.x + p.w) {
        d.done = true;
        this.#collect(d.id);
      } else if (d.y > H + 8) d.done = true;
    }
    this.drops = this.drops.filter((d) => !d.done);
  }

  #burst(br, color) {
    const n = reducedMotion() ? 3 : 7;
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: br.x + Math.random() * br.w,
        y: br.y + Math.random() * br.h,
        vx: (Math.random() - 0.5) * 90,
        vy: -20 - Math.random() * 50,
        life: 0.45 + Math.random() * 0.3,
        color,
      });
    }
  }

  #updateParticles(dt) {
    for (const q of this.particles) {
      q.life -= dt;
      q.vy += 220 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    this.particles = this.particles.filter((q) => q.life > 0 && q.y < H);
  }

  // ---------- Dibujo ----------

  #draw() {
    const g = this.ctx;
    g.save();
    if (this.shake > 0.3) {
      g.translate(Math.round((Math.random() - 0.5) * this.shake), Math.round((Math.random() - 0.5) * this.shake));
    }
    g.drawImage(this.bg, 0, 0);

    for (const br of this.bricks) if (br.alive) this.#drawBrick(g, br);

    // Archivos que caen: una hoja con su pestaña roja (parpadea un poco para llamar la atención).
    const blink = !reducedMotion() && Math.floor(this.time * 6) % 2 === 0;
    for (const d of this.drops) {
      const x = Math.round(d.x - 4);
      const y = Math.round(d.y - 3);
      g.fillStyle = '#a3172c';
      g.fillRect(x, y - 1, 4, 1);
      g.fillStyle = blink ? '#fff8e6' : PAPER.base;
      g.fillRect(x, y, 9, 7);
      g.fillStyle = PAPER.lo;
      g.fillRect(x + 7, y, 2, 2);
      g.fillStyle = '#4a4238';
      g.fillRect(x + 2, y + 3, 5, 1);
      g.fillRect(x + 2, y + 5, 4, 1);
    }

    this.#drawPaddle(g);

    const showBall = this.state !== 'dying' && this.state !== 'clear' && this.state !== 'over';
    if (showBall) {
      g.fillStyle = 'rgba(216, 210, 196, 0.25)';
      for (let i = 0; i < this.trail.length - 1; i++) {
        const p = this.trail[i];
        g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);
      }
      const bx = Math.round(this.ball.x) - 2;
      const by = Math.round(this.ball.y) - 2;
      STAR.forEach((row, y) => {
        [...row].forEach((c, x) => {
          if (c === '.') return;
          g.fillStyle = c === 'h' ? '#f4eedf' : '#a3172c';
          g.fillRect(bx + x, by + y, 1, 1);
        });
      });
    }

    for (const q of this.particles) {
      g.fillStyle = q.color;
      g.fillRect(Math.round(q.x), Math.round(q.y), 2, 2);
    }
    g.restore();
  }

  #drawBrick(g, br) {
    const { x, y, w, h } = br;
    const c = br.file ? PAPER : BRICKS[br.type];
    g.fillStyle = br.flash > 0 ? '#ffffff' : c.base;
    g.fillRect(x, y, w, h);
    if (br.flash > 0) return;
    g.fillStyle = c.hi;
    g.fillRect(x, y, w, 1);
    g.fillRect(x, y, 1, h);
    g.fillStyle = c.lo;
    g.fillRect(x, y + h - 1, w, 1);
    g.fillRect(x + w - 1, y, 1, h);
    if (br.file) {
      // Renglones y un clip rojo: es un documento.
      g.fillStyle = '#6d6455';
      g.fillRect(x + 3, y + 2, w - 8, 1);
      if (h > 6) g.fillRect(x + 3, y + 4, w - 10, 1);
      g.fillStyle = '#a3172c';
      g.fillRect(x + w - 4, y, 2, 3);
    } else if (br.type === 'd' && br.hp === 1) {
      // Grieta.
      g.fillStyle = c.lo;
      const cx = x + Math.floor(w * 0.4);
      g.fillRect(cx, y + 1, 1, 2);
      g.fillRect(cx + 1, y + 3, 1, 2);
      g.fillRect(cx, y + 5, 1, h - 6);
      g.fillRect(cx + 2, y + 3, 3, 1);
    } else if (br.type === 'i') {
      g.fillStyle = c.hi;
      g.fillRect(x + 2, y + 2, 1, 1);
      g.fillRect(x + w - 3, y + 2, 1, 1);
      g.fillRect(x + 2, y + h - 3, 1, 1);
      g.fillRect(x + w - 3, y + h - 3, 1, 1);
    }
  }

  /** La barra: negra con las franjas roja y crema de la chaqueta del personaje. */
  #drawPaddle(g) {
    const x = Math.round(this.paddle.x);
    const y = PADDLE.y;
    const w = this.paddle.w;
    const lit = this.paddle.flash > 0;
    const rows = lit
      ? ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#f4eedf', '#d8d2c4']
      : ['#8a8578', '#2a2622', '#a3172c', '#d9cfb6', '#2a2622', '#4a443d'];
    rows.forEach((color, i) => {
      g.fillStyle = color;
      const inset = i === 0 || i === rows.length - 1 ? 1 : 0;
      g.fillRect(x + inset, y + i, w - inset * 2, 1);
    });
    // Remates de los extremos.
    g.fillStyle = lit ? '#ffffff' : '#5d594f';
    g.fillRect(x, y + 1, 2, PADDLE.h - 2);
    g.fillRect(x + w - 2, y + 1, 2, PADDLE.h - 2);
  }
}
