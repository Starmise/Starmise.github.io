/**
 * Código Konami (↑ ↑ ↓ ↓ ← → ← → B A) desde cualquier dispositivo. Lo usa el easter egg
 * (ui/breakout.js), pero el detector no sabe nada de él.
 *
 * - Teclado: flechas, luego B y A.
 * - Mando: cruceta o stick, luego Ⓑ y Ⓐ. Las pulsaciones del mando llegan ya convertidas en
 *   acciones de menú (`Input.consumeUi()`); el bucle del juego las pasa por `feed(acción)`, que
 *   devuelve true si esa pulsación completó el código (así la última Ⓐ no "hace clic" en el menú).
 * - Táctil: ocho deslizamientos (arriba, arriba, abajo, abajo, izquierda, derecha, izquierda,
 *   derecha) y dos toques, en cualquier parte de la pantalla.
 *
 * Si pasan más de PAUSE_MS entre dos pulsaciones, se empieza de cero: así caminar con las
 * flechas no lo activa por casualidad.
 *
 *   const konami = watchKonami({ onCode: () => …, blocked: () => menúSecretoAbierto });
 */
const SEQUENCE = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'];
const PAUSE_MS = 3000;

const KEY_TOKENS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyB: 'b',
  KeyA: 'a',
};
const PAD_TOKENS = { up: 'up', down: 'down', left: 'left', right: 'right', back: 'b', confirm: 'a' };
const MODIFIERS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

// Táctil: un deslizamiento es un trazo de al menos SWIPE_PX en menos de SWIPE_MS; un toque,
// menos de TAP_PX en menos de TAP_MS. Los trazos largos (p. ej. caminar con el joystick) no cuentan.
const SWIPE_PX = 36;
const SWIPE_MS = 700;
const TAP_PX = 14;
const TAP_MS = 350;

export function watchKonami({ onCode, blocked = () => false }) {
  let history = [];
  let last = 0;

  function push(token) {
    if (blocked()) {
      history = [];
      return false;
    }
    const now = performance.now();
    if (now - last > PAUSE_MS) history = [];
    last = now;
    history.push(token);
    if (history.length > SEQUENCE.length) history.shift();
    if (!matches(history)) return false;
    history = [];
    onCode();
    return true;
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.repeat || MODIFIERS.has(e.code) || isTyping(e)) return;
      push(KEY_TOKENS[e.code] ?? 'x');
    },
    { capture: true },
  );

  // Eventos táctiles (no de puntero): un deslizamiento vertical sobre un menú hace que el
  // navegador empiece a desplazar y cancele el puntero, pero touchend sí llega.
  const touches = new Map();
  window.addEventListener(
    'touchstart',
    (e) => {
      for (const tch of e.changedTouches) touches.set(tch.identifier, { x: tch.clientX, y: tch.clientY, t: performance.now() });
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    'touchend',
    (e) => {
      for (const tch of e.changedTouches) {
        const start = touches.get(tch.identifier);
        if (!start) continue;
        touches.delete(tch.identifier);
        const dx = tch.clientX - start.x;
        const dy = tch.clientY - start.y;
        const dist = Math.hypot(dx, dy);
        const ms = performance.now() - start.t;
        if (dist <= TAP_PX && ms <= TAP_MS) push('tap');
        else if (dist >= SWIPE_PX && ms <= SWIPE_MS) {
          push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
        }
      }
    },
    { capture: true, passive: true },
  );
  window.addEventListener('touchcancel', (e) => [...e.changedTouches].forEach((tch) => touches.delete(tch.identifier)), {
    capture: true,
    passive: true,
  });

  return {
    /** Acción de menú del mando (Input.consumeUi). true = completó el código. */
    feed(action) {
      return push(PAD_TOKENS[action] ?? 'x');
    },
  };
}

function matches(history) {
  if (history.length < SEQUENCE.length) return false;
  // En táctil, B y A son dos toques.
  return SEQUENCE.every((want, i) => history[i] === want || (history[i] === 'tap' && (want === 'b' || want === 'a')));
}

function isTyping(e) {
  const el = e.target;
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}
