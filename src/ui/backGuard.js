/**
 * Botón "atrás" del teléfono (o del navegador) = cerrar la capa de arriba.
 *
 * Sin esto, en Android "atrás" con el menú o una ficha abiertos saca al visitante del
 * portafolio. Mientras haya alguna capa que se pueda cerrar (pausa, ficha, galería…), se deja
 * en el historial una entrada "guardia" con la misma URL; al volver atrás se cierra la capa de
 * arriba y, si quedan más, se vuelve a poner la guardia. Si las capas se cierran desde la
 * interfaz, la guardia se retira sola con `history.back()`.
 *
 * El modo lista tiene su propia entrada (`#lista`, ver shell.js) y no cuenta aquí; el título no
 * se puede cerrar (`closable: false`).
 */
export function installBackGuard(stack, { ignore = () => false } = {}) {
  const KEY = 'starmiseUi';
  let guarded = false;
  let skipPops = 0; // popstate que provocamos nosotros al retirar la guardia

  const closable = () => stack.layers.some((l) => l.closable !== false && !ignore(l));
  const onGuard = () => !!history.state?.[KEY];

  function sync() {
    if (closable()) {
      if (!guarded) {
        history.pushState({ [KEY]: true }, '', location.href);
        guarded = true;
      }
    } else if (guarded) {
      guarded = false;
      if (onGuard()) {
        skipPops++;
        history.back();
      }
    }
  }

  window.addEventListener('popstate', () => {
    if (skipPops > 0) {
      skipPops--;
      return;
    }
    if (!guarded || onGuard()) return; // p. ej. se cerró el modo lista y volvimos a la guardia
    guarded = false;
    const top = stack.top;
    if (top && top.closable !== false && !ignore(top)) stack.dispatch('back');
    sync(); // si queda otra capa abierta, la guardia vuelve
  });

  stack.onLayers = sync;
}
