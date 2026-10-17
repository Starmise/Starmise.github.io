/**
 * Pantalla completa (Fullscreen API). En Android oculta la barra del navegador y, si el
 * sistema lo permite, fija la orientación en horizontal. En iPhone no existe para páginas
 * (solo para videos): `fullscreenSupported` es false y el botón no se muestra.
 */
const doc = typeof document !== 'undefined' ? document : null;

export const fullscreenSupported = !!(doc && (doc.fullscreenEnabled || doc.webkitFullscreenEnabled));

export function isFullscreen() {
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export async function toggleFullscreen() {
  if (!fullscreenSupported) return false;
  try {
    if (isFullscreen()) {
      await (doc.exitFullscreen ?? doc.webkitExitFullscreen).call(doc);
      return false;
    }
    const el = doc.documentElement;
    await (el.requestFullscreen ?? el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
    // Mejor esfuerzo: solo funciona en pantalla completa y en navegadores que lo admiten.
    screen.orientation?.lock?.('landscape').catch(() => {});
    return true;
  } catch {
    return isFullscreen();
  }
}

export function onFullscreenChange(fn) {
  if (!doc) return;
  doc.addEventListener('fullscreenchange', () => fn(isFullscreen()));
  doc.addEventListener('webkitfullscreenchange', () => fn(isFullscreen()));
}
