import { settings, onSettingsChange } from '../core/settings.js';
import { t } from '../core/i18n.js';
import { haptic } from '../core/haptics.js';
import { fullscreenSupported, isFullscreen, toggleFullscreen, onFullscreenChange } from '../core/fullscreen.js';

const RADIUS = { normal: 52, large: 66 }; // px: recorrido del joystick hasta el aro
const DEADZONE = 0.12;
const RUN_ENTER = 1.12; // arrastrar el dedo más allá del aro (× radio) = correr
const RUN_EXIT = 0.92; // volver hacia dentro deja de correr (histéresis)
const FOLLOW = 1.6; // más lejos que esto, la base sigue al dedo (nunca "se acaba" el joystick)
const TAP_MS = 260; // toque corto sin arrastrar = tocar la escena (examinar lo que hay ahí)
const TAP_SLOP = 12; // px

/**
 * Controles táctiles sobre el HUD:
 *
 * - Joystick flotante: se apoya el dedo en cualquier punto de su mitad de la pantalla y ahí
 *   aparece la base. Hasta el aro se camina (analógico); al sacar el dedo más allá del aro
 *   (el aro exterior se enciende) se corre. Si el dedo se aleja mucho, la base lo sigue, así
 *   que cambiar de dirección es inmediato.
 * - Botón de acción: muestra el verbo y el nombre del objeto al alcance ("Examinar ·
 *   Persona_ERROR", "Abrir · Ala Unreal") y se apaga si no hay ninguno.
 * - Arriba: Mapa, menú ☰ y pantalla completa (si el navegador la admite).
 * - Un toque corto en cualquier punto de la escena llama a `onTap(x, y)`: el juego mira si
 *   ahí hay un objeto o una puerta (tocar para examinar).
 *
 * Los botones reaccionan al apoyar el dedo (pointerdown), no al soltarlo: no hay retardo y
 * funcionan aunque el otro pulgar siga en el joystick. Opciones: "Controles táctiles"
 * (Automático / Siempre / Nunca), tamaño, lado del joystick y vibración.
 */
export class TouchControls {
  constructor(root, input) {
    this.input = input;
    this.device = input.lastDevice;
    this.pointerId = null;
    this.running = false;
    this.onTap = null; // (clientX, clientY) => void

    this.el = document.createElement('div');
    this.el.className = 'touch';
    this.el.innerHTML = `
      <div class="touch__zone" aria-hidden="true">
        <div class="touch__stick"><div class="touch__ring"></div><div class="touch__knob"></div></div>
      </div>
      <div class="touch__top">
        <button type="button" class="touch__btn touch__btn--icon" data-act="fullscreen" tabindex="-1" hidden>${ICON_FS}</button>
        <button type="button" class="touch__btn" data-act="map" tabindex="-1">${t('touch.map')}</button>
        <button type="button" class="touch__btn touch__btn--icon" data-act="pause" tabindex="-1" aria-label="${t('touch.menu')}">☰</button>
      </div>
      <button type="button" class="touch__btn touch__btn--act is-idle" data-act="interact" tabindex="-1">
        <span class="touch__verb">${t('hud.examine')}</span><span class="touch__what"></span>
      </button>
    `;
    root.append(this.el);
    this.zone = this.el.querySelector('.touch__zone');
    this.stick = this.el.querySelector('.touch__stick');
    this.knob = this.el.querySelector('.touch__knob');
    this.actBtn = this.el.querySelector('[data-act="interact"]');
    this.actVerb = this.actBtn.querySelector('.touch__verb');
    this.actWhat = this.actBtn.querySelector('.touch__what');
    this.fsBtn = this.el.querySelector('[data-act="fullscreen"]');
    this.hasTarget = false;

    for (const btn of this.el.querySelectorAll('[data-act]')) {
      btn.addEventListener('pointerdown', (e) => this.#button(e, btn));
      const up = () => btn.classList.remove('is-pressed');
      for (const type of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(type, up);
      // Teclado o lectores de pantalla (click sin puntero): mismo efecto.
      btn.addEventListener('click', (e) => e.detail === 0 && this.#action(btn.dataset.act));
    }
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());

    this.fsBtn.hidden = !fullscreenSupported;
    this.#paintFullscreen();
    onFullscreenChange(() => this.#paintFullscreen());

    this.zone.addEventListener('pointerdown', (e) => this.#start(e));
    this.zone.addEventListener('pointermove', (e) => e.pointerId === this.pointerId && this.#move(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.zone.addEventListener(type, (e) => e.pointerId === this.pointerId && this.#release(e));
    }

    onSettingsChange((key) => ['touch', 'touchSize', 'touchSide'].includes(key) && this.#paint());
    this.#paint();
  }

  /** Toques cortos sobre la escena (fuera del joystick y los botones) también llaman a `onTap`. */
  watchTaps(el) {
    const downs = new Map();
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') downs.set(e.pointerId, { x: e.clientX, y: e.clientY, at: performance.now() });
    });
    el.addEventListener('pointerup', (e) => {
      const d = downs.get(e.pointerId);
      downs.delete(e.pointerId);
      if (!d || !this.visible) return;
      if (performance.now() - d.at < TAP_MS && Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP_SLOP) this.onTap?.(d.x, d.y);
    });
    el.addEventListener('pointercancel', (e) => downs.delete(e.pointerId));
  }

  get visible() {
    return settings.touch === 'on' || (settings.touch === 'auto' && this.device === 'touch');
  }

  setDevice(device) {
    this.device = device;
    this.#paint();
  }

  /** Objeto al alcance (o null): cambia el texto del botón de acción. */
  setTarget(target) {
    const verb = target ? (target.verb ?? t(target.kind === 'door' ? 'hud.open' : 'hud.examine')) : t('hud.examine');
    const what = target?.label ?? '';
    if (this.actVerb.textContent !== verb) this.actVerb.textContent = verb;
    if (this.actWhat.textContent !== what) this.actWhat.textContent = what;
    this.hasTarget = !!target;
    this.actBtn.classList.toggle('is-idle', !target);
    this.actBtn.setAttribute('aria-label', target ? `${verb}: ${what}` : t('touch.nothing'));
  }

  #button(e, btn) {
    if (e.button > 0) return;
    e.preventDefault(); // sin selección de texto ni menú contextual en pulsación larga
    btn.classList.add('is-pressed');
    this.#action(btn.dataset.act);
  }

  #action(act) {
    if (act === 'fullscreen') {
      haptic('tap');
      toggleFullscreen();
      return;
    }
    // Examinar vibra desde el juego (game.js → interact) para que suene igual al tocar la escena.
    if (act !== 'interact') haptic('tap');
    else if (!this.hasTarget) haptic('deny');
    this.input.press(act);
  }

  #paintFullscreen() {
    const on = fullscreenSupported && isFullscreen();
    this.fsBtn.classList.toggle('is-on', on);
    this.fsBtn.setAttribute('aria-label', t(on ? 'touch.exitFullscreen' : 'touch.fullscreen'));
  }

  #paint() {
    const on = this.visible;
    this.el.hidden = !on;
    this.el.classList.toggle('touch--large', settings.touchSize === 'large');
    this.el.classList.toggle('touch--swap', settings.touchSide === 'right');
    this.radius = RADIUS[settings.touchSize] ?? RADIUS.normal;
    document.documentElement.classList.toggle('touch-ui', on);
    if (!on) this.#release();
  }

  #start(e) {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.zone.setPointerCapture?.(e.pointerId);
    this.downAt = performance.now();
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.maxTravel = 0;
    // La base aparece donde se apoya el dedo (sin salirse de la zona).
    this.zoneRect = this.zone.getBoundingClientRect();
    const r = this.zoneRect;
    const m = this.radius + 10;
    this.cx = clamp(e.clientX, r.left + m, r.right - m);
    this.cy = clamp(e.clientY, r.top + m, r.bottom - m);
    this.#placeStick();
    this.stick.classList.add('is-active');
    this.#move(e);
  }

  #placeStick() {
    this.stick.style.left = `${this.cx - this.zoneRect.left}px`;
    this.stick.style.top = `${this.cy - this.zoneRect.top}px`;
  }

  #move(e) {
    const R = this.radius;
    this.maxTravel = Math.max(this.maxTravel, Math.hypot(e.clientX - this.downX, e.clientY - this.downY));
    let dx = e.clientX - this.cx;
    let dy = e.clientY - this.cy;
    let dist = Math.hypot(dx, dy);
    // La base sigue al dedo cuando se aleja demasiado.
    if (dist > R * FOLLOW) {
      const k = (dist - R * FOLLOW) / dist;
      this.cx += dx * k;
      this.cy += dy * k;
      this.#placeStick();
      dx = e.clientX - this.cx;
      dy = e.clientY - this.cy;
      dist = R * FOLLOW;
    }
    const mag = Math.min(1, dist / R);
    const nx = dist ? dx / dist : 0;
    const ny = dist ? dy / dist : 0;
    const shown = Math.min(dist, R * RUN_ENTER);
    this.knob.style.transform = `translate(${nx * shown}px, ${ny * shown}px)`;
    const k = mag < DEADZONE ? 0 : (mag - DEADZONE) / (1 - DEADZONE);
    const run = this.running ? dist > R * RUN_EXIT : dist > R * RUN_ENTER;
    if (run && !this.running) haptic('run');
    this.running = run;
    this.stick.classList.toggle('is-running', run);
    this.input.setTouch(nx * k, -ny * k, run);
  }

  #release(e) {
    if (this.pointerId === null) return;
    const tap = e && performance.now() - this.downAt < TAP_MS && this.maxTravel < TAP_SLOP;
    this.pointerId = null;
    this.running = false;
    this.stick.classList.remove('is-active', 'is-running');
    this.stick.style.left = this.stick.style.top = '';
    this.knob.style.transform = '';
    this.input.setTouch(0, 0, false);
    if (tap) this.onTap?.(this.downX, this.downY);
  }
}

const ICON_FS = `<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" shape-rendering="crispEdges">
  <path class="fs-in" d="M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5"/>
  <path class="fs-out" d="M6 1v5H1M15 6h-5V1M10 15v-5h5M1 10h5v5"/>
</svg>`;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
