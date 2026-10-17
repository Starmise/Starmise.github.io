/**
 * Pila de capas de UI (título, pausa, ficha…). Mientras haya alguna abierta, el juego
 * está en pausa y la capa superior recibe la navegación, venga del teclado o del mando.
 *
 * Una capa es un objeto con:
 *   el                 elemento raíz (se usa para buscar elementos enfocables)
 *   onAction(action)   opcional; devuelve true si gestionó la acción
 *                      acciones: up, down, left, right, confirm, back, tabPrev, tabNext, pause
 *   onShow / onHide    opcionales
 *   nativeKeys         opcional; true = las flechas del teclado hacen lo de siempre en el
 *                      navegador (desplazar la página), p. ej. en el modo lista
 *   sounds             opcional; { open, close } con el nombre del sonido de interfaz al
 *                      abrir/cerrar la capa (null = ninguno). Por defecto 'open' / 'close'.
 *
 * `onSound(nombre)` se llama al abrir/cerrar capas, mover el cursor ('move') y pasar de
 * pestaña o de ficha ('page'); el juego lo conecta al audio (audio/uiSounds.js).
 *
 * Por defecto: arriba/izquierda = elemento anterior, abajo/derecha = siguiente,
 * confirm = clic en el elemento enfocado, back = cerrar la capa.
 */
export class UiStack {
  constructor() {
    this.layers = [];
    this.onChange = null; // (isOpen) => void
    this.onSound = null; // (nombre) => void
    this.onLayers = null; // () => void, tras cada push/pop (ui/backGuard.js)

    // Teclado en los menús. Tab y Enter/Espacio los maneja el navegador de forma nativa.
    window.addEventListener('keydown', (e) => {
      if (!this.top || e.defaultPrevented || isTyping(e)) return;
      const action = KEY_ACTIONS[e.code];
      if (!action) return;
      if (this.top.nativeKeys && NATIVE_ACTIONS.has(action)) return;
      if (this.dispatch(action)) e.preventDefault();
    });
  }

  get top() {
    return this.layers[this.layers.length - 1] ?? null;
  }

  get isOpen() {
    return this.layers.length > 0;
  }

  push(layer) {
    if (this.layers.includes(layer)) return;
    this.layers.push(layer);
    layer.returnFocus = document.activeElement;
    layer.onShow?.();
    this.#layerSound(layer, 'open');
    if (this.layers.length === 1) this.onChange?.(true);
    this.onLayers?.();
  }

  pop(layer = this.top) {
    const i = this.layers.indexOf(layer);
    if (i < 0) return;
    this.layers.splice(i, 1);
    layer.onHide?.();
    this.#layerSound(layer, 'close');
    // Devolver el foco a donde estaba; si ese elemento ya no se ve (p. ej. el título cambió de
    // pantalla mientras tanto), al primer elemento de la capa que queda arriba.
    const back = layer.returnFocus;
    if (back?.isConnected && back.getClientRects?.().length && !back.closest('[hidden]')) back.focus?.({ preventScroll: true });
    else if (this.top) focusFirst(this.top.el);
    if (!this.layers.length) this.onChange?.(false);
    this.onLayers?.();
  }

  clear() {
    while (this.layers.length) this.pop();
  }

  #layerSound(layer, kind) {
    const name = layer.sounds && kind in layer.sounds ? layer.sounds[kind] : kind;
    if (name) this.onSound?.(name);
  }

  /** Despacha una acción a la capa superior. Devuelve true si alguien la gestionó. */
  dispatch(action, fromPad = false) {
    const layer = this.top;
    if (!layer) return false;
    // Deslizadores: izquierda/derecha cambian el valor (el teclado lo hace de forma nativa).
    const el = document.activeElement;
    if (el?.type === 'range' && (action === 'left' || action === 'right')) {
      if (!fromPad) return false;
      if (action === 'left') el.stepDown();
      else el.stepUp();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (layer.onAction?.(action)) {
      if (action === 'tabPrev' || action === 'tabNext') this.onSound?.('page');
      return true;
    }
    switch (action) {
      case 'up':
      case 'left':
      case 'down':
      case 'right': {
        const moved = moveFocus(layer.el, action === 'up' || action === 'left' ? -1 : 1);
        if (moved) this.onSound?.('move');
        return moved;
      }
      case 'confirm': {
        const el = document.activeElement;
        if (el && layer.el.contains(el) && el !== layer.el && typeof el.click === 'function') {
          el.click();
          return true;
        }
        return false;
      }
      case 'back':
        if (layer.closable === false) return false;
        this.pop(layer);
        return true;
      default:
        return false;
    }
  }
}

const KEY_ACTIONS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Escape: 'back',
  Backspace: 'back',
  KeyQ: 'tabPrev',
  KeyE: 'tabNext',
  PageUp: 'tabPrev',
  PageDown: 'tabNext',
};

const NATIVE_ACTIONS = new Set(['up', 'down', 'left', 'right', 'tabPrev', 'tabNext']);

function isTyping(e) {
  const el = e.target;
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'range');
}

export function focusables(root) {
  return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0);
}

export function moveFocus(root, delta) {
  const list = focusables(root);
  if (!list.length) return false;
  const i = list.indexOf(document.activeElement);
  const next = i < 0 ? (delta > 0 ? 0 : list.length - 1) : (i + delta + list.length) % list.length;
  list[next].focus();
  list[next].scrollIntoView?.({ block: 'nearest' });
  return true;
}

export function focusFirst(root) {
  const list = focusables(root);
  (list[0] ?? root).focus({ preventScroll: true });
}
