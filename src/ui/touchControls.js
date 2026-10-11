import { settings, onSettingsChange } from '../core/settings.js';
import { t } from '../core/i18n.js';

const RADIUS = 52; // px: recorrido del joystick
const DEADZONE = 0.14;
const RUN_AT = 0.9; // empujar hasta el borde = correr

/**
 * Controles táctiles sobre el HUD:
 *
 * - Joystick virtual: se apoya el dedo en cualquier punto de la mitad izquierda y ahí aparece
 *   la base (en reposo se ve tenue abajo a la izquierda). Empujarlo hasta el borde = correr.
 * - Botón de acción (abajo a la derecha): muestra el verbo del objeto al alcance
 *   ("Examinar", "Abrir"…) y se apaga si no hay ninguno.
 * - Mapa y menú (arriba a la derecha).
 *
 * Se muestran con la opción "Controles táctiles" en Automático al tocar la pantalla, o siempre
 * con "Siempre". Escriben en Input con `setTouch()` y `press()`.
 */
export class TouchControls {
  constructor(root, input) {
    this.input = input;
    this.device = input.lastDevice;
    this.pointerId = null;

    this.el = document.createElement('div');
    this.el.className = 'touch';
    this.el.innerHTML = `
      <div class="touch__zone" aria-hidden="true">
        <div class="touch__stick"><div class="touch__knob"></div></div>
      </div>
      <div class="touch__top">
        <button type="button" class="touch__btn" data-act="map">${t('touch.map')}</button>
        <button type="button" class="touch__btn" data-act="pause" aria-label="${t('touch.menu')}">☰</button>
      </div>
      <button type="button" class="touch__btn touch__btn--act is-idle" data-act="interact">${t('hud.examine')}</button>
    `;
    root.append(this.el);
    this.zone = this.el.querySelector('.touch__zone');
    this.stick = this.el.querySelector('.touch__stick');
    this.knob = this.el.querySelector('.touch__knob');
    this.actBtn = this.el.querySelector('[data-act="interact"]');

    for (const btn of this.el.querySelectorAll('[data-act]')) {
      btn.addEventListener('click', () => this.input.press(btn.dataset.act));
    }
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());

    this.zone.addEventListener('pointerdown', (e) => this.#start(e));
    this.zone.addEventListener('pointermove', (e) => e.pointerId === this.pointerId && this.#move(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.zone.addEventListener(type, (e) => e.pointerId === this.pointerId && this.#release());
    }

    onSettingsChange((key) => key === 'touch' && this.#paint());
    this.#paint();
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
    if (this.actBtn.textContent !== verb) this.actBtn.textContent = verb;
    this.actBtn.classList.toggle('is-idle', !target);
    this.actBtn.setAttribute('aria-label', target ? `${verb}: ${target.label ?? ''}` : t('touch.nothing'));
  }

  #paint() {
    const on = this.visible;
    this.el.hidden = !on;
    document.documentElement.classList.toggle('touch-ui', on);
    if (!on) this.#release();
  }

  #start(e) {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.zone.setPointerCapture?.(e.pointerId);
    // La base aparece donde se apoya el dedo (sin salirse de la zona).
    const r = this.zone.getBoundingClientRect();
    const m = RADIUS + 10;
    this.cx = clamp(e.clientX, r.left + m, r.right - m);
    this.cy = clamp(e.clientY, r.top + m, r.bottom - m);
    this.stick.style.left = `${this.cx - r.left}px`;
    this.stick.style.top = `${this.cy - r.top}px`;
    this.stick.classList.add('is-active');
    this.#move(e);
  }

  #move(e) {
    const dx = e.clientX - this.cx;
    const dy = e.clientY - this.cy;
    const dist = Math.hypot(dx, dy);
    const mag = Math.min(1, dist / RADIUS);
    const nx = dist ? dx / dist : 0;
    const ny = dist ? dy / dist : 0;
    this.knob.style.transform = `translate(${nx * mag * RADIUS}px, ${ny * mag * RADIUS}px)`;
    const k = mag < DEADZONE ? 0 : (mag - DEADZONE) / (1 - DEADZONE);
    const run = mag >= RUN_AT;
    this.stick.classList.toggle('is-running', run);
    this.input.setTouch(nx * k, -ny * k, run);
  }

  #release() {
    if (this.pointerId === null) return;
    this.pointerId = null;
    this.stick.classList.remove('is-active', 'is-running');
    this.stick.style.left = this.stick.style.top = '';
    this.knob.style.transform = '';
    this.input.setTouch(0, 0, false);
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
