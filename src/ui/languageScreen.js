import { LANGUAGES } from '../core/i18n.js';

/**
 * Pantalla de elección de idioma: lo primero que se ve en la primera visita (después se
 * recuerda; se cambia desde el título, Opciones o el modo lista). Es bilingüe a propósito y
 * no depende del juego (ni de Three.js, ni de input.js), así que se maneja sola con ratón,
 * toque, teclado (←→↑↓, Enter) y mando (cruceta/stick y Ⓐ).
 *
 *   const code = await chooseLanguage({ suggested: 'es' });
 */
export function chooseLanguage({ suggested = 'es' } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'lang-screen';
    el.innerHTML = `
      <div class="lang-screen__inner" role="dialog" aria-modal="true" aria-labelledby="lang-screen-title">
        <p class="lang-screen__logo" aria-hidden="true">Starmise</p>
        <h1 id="lang-screen-title" class="lang-screen__title">
          <span lang="es">Elige tu idioma</span><span class="lang-screen__sep" aria-hidden="true"> · </span><span lang="en">Choose your language</span>
        </h1>
        <div class="lang-screen__options">
          ${LANGUAGES.map((l) => `<button type="button" lang="${l.code}" data-lang="${l.code}">${l.name}</button>`).join('')}
        </div>
        <p class="lang-screen__note">
          <span lang="es">Puedes cambiarlo después en Opciones.</span><br />
          <span lang="en">You can change it later in Options.</span>
        </p>
      </div>
    `;
    document.body.append(el);
    const buttons = [...el.querySelectorAll('[data-lang]')];
    const focusAt = (i) => buttons[(i + buttons.length) % buttons.length].focus();
    const index = () => Math.max(0, buttons.indexOf(document.activeElement));
    focusAt(Math.max(0, buttons.findIndex((b) => b.dataset.lang === suggested)));

    let done = false;
    let raf = 0;
    const finish = (code) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 250);
      resolve(code);
    };

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lang]');
      if (b) finish(b.dataset.lang);
    });

    function onKey(e) {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1, Tab: e.shiftKey ? -1 : 1 }[e.key];
      if (step) {
        e.preventDefault();
        focusAt(index() + step);
      } else if (e.key === 'Escape') {
        e.preventDefault(); // la pantalla no se puede saltar: siempre hay que elegir
      }
      // Enter y Espacio: el clic nativo del botón con foco.
    }
    window.addEventListener('keydown', onKey, true);

    // Mando: cruceta o stick mueven, Ⓐ (botón 0) o Start (9) eligen.
    let held = { move: 0, press: true }; // `press: true` ignora un botón ya pulsado al aparecer
    const poll = () => {
      raf = requestAnimationFrame(poll);
      const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p?.connected);
      if (!pad) return;
      const b = (i) => !!pad.buttons[i]?.pressed;
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      const move = b(14) || b(12) || x < -0.5 || y < -0.5 ? -1 : b(15) || b(13) || x > 0.5 || y > 0.5 ? 1 : 0;
      if (move && move !== held.move) focusAt(index() + move);
      const press = b(0) || b(9);
      if (press && !held.press) finish(buttons[index()].dataset.lang);
      held = { move, press };
    };
    if (navigator.getGamepads) raf = requestAnimationFrame(poll);
  });
}
