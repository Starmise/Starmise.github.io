/**
 * Deslizar a los lados con el dedo (solo táctil). Para que el desplazamiento vertical siga
 * siendo del navegador, el elemento debe tener `touch-action: pan-y` (ver style.css).
 *
 *   onSwipe(el, (dir) => …)   dir = 1 (hacia la izquierda: siguiente) | -1 (hacia la derecha: anterior)
 *
 * `onDrag(dx)` opcional: mientras el dedo se mueve en horizontal (para que el contenido lo
 * siga un poco); se llama con 0 al soltar.
 */
export function onSwipe(el, onDone, { threshold = 56, onDrag = null } = {}) {
  let s = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || s || e.target.closest?.('input[type="range"], iframe')) return;
    s = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), horizontal: null };
  });
  el.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.horizontal === null && Math.hypot(dx, dy) > 10) s.horizontal = Math.abs(dx) > Math.abs(dy) * 1.4;
    if (s.horizontal) onDrag?.(dx);
  });
  const end = (e, cancelled) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const fast = performance.now() - s.at < 700 || Math.abs(dx) > threshold * 2.2;
    const ok = !cancelled && s.horizontal && Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.4 && fast;
    s = null;
    onDrag?.(0);
    if (ok) onDone(dx < 0 ? 1 : -1);
  };
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
}
