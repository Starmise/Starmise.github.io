import { t } from '../core/i18n.js';
import { onSwipe } from './swipe.js';

/**
 * Visor de imágenes de la galería de una ficha: la imagen a pantalla completa sobre la ficha,
 * sin salir del juego (antes se abría en otra pestaña, incómodo en el móvil). Capa de la
 * UiStack: ◂ ▸ / flechas / Q·E / LB·RB / deslizar cambian de imagen; ✕, Esc, Ⓑ, "atrás" del
 * teléfono o tocar fuera de la imagen lo cierran. "Abrir original" sigue disponible.
 */
export class ImageViewer {
  constructor(root, stack) {
    this.stack = stack;
    this.images = [];
    this.index = 0;
    this.title = '';

    this.el = document.createElement('div');
    this.el.className = 'viewer';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="viewer__panel" role="dialog" aria-modal="true" tabindex="-1">
        <figure class="viewer__figure"><img alt="" /></figure>
        <div class="viewer__bar">
          <button type="button" class="viewer__btn" data-step="-1" data-sfx="page" aria-label="${t('viewer.prev')}">◂</button>
          <span class="viewer__count" aria-live="polite"></span>
          <button type="button" class="viewer__btn" data-step="1" data-sfx="page" aria-label="${t('viewer.next')}">▸</button>
          <a class="viewer__open" target="_blank" rel="noopener">${t('viewer.open')}</a>
          <button type="button" class="viewer__btn viewer__close" data-close aria-label="${t('viewer.close')}">✕</button>
        </div>
      </div>
    `;
    root.append(this.el);
    this.panel = this.el.querySelector('.viewer__panel');
    this.img = this.el.querySelector('img');
    this.count = this.el.querySelector('.viewer__count');
    this.openLink = this.el.querySelector('.viewer__open');
    this.figure = this.el.querySelector('.viewer__figure');

    this.el.addEventListener('click', (e) => {
      const step = e.target.closest('[data-step]')?.dataset.step;
      if (step) return this.step(Number(step));
      if (e.target.closest('[data-close]')) return this.close();
      // Tocar fuera de la imagen y de la barra cierra.
      if (!e.target.closest('img, .viewer__bar')) this.close();
    });
    onSwipe(this.figure, (dir) => this.step(dir), {
      onDrag: (dx) => (this.img.style.transform = dx ? `translateX(${dx * 0.5}px)` : ''),
    });

    this.layer = {
      el: this.panel,
      onShow: () => {
        this.el.hidden = false;
        this.panel.focus({ preventScroll: true });
      },
      onHide: () => {
        this.el.hidden = true;
        this.img.removeAttribute('src');
      },
      onAction: (action) => {
        if (['left', 'tabPrev'].includes(action)) return this.step(-1);
        if (['right', 'tabNext'].includes(action)) return this.step(1);
        if (action === 'pause') {
          this.close();
          return true;
        }
        return false;
      },
      sounds: { open: 'page', close: 'close' },
    };
  }

  /** images: URLs completas; index: la que se ve primero. */
  open(images, index = 0, title = '') {
    this.images = images;
    this.title = title;
    this.index = index;
    this.#paint();
    this.stack.push(this.layer);
  }

  close() {
    this.stack.pop(this.layer);
  }

  step(delta) {
    if (this.images.length < 2) return true;
    this.index = (this.index + delta + this.images.length) % this.images.length;
    this.#paint();
    return true;
  }

  #paint() {
    const n = this.images.length;
    const src = this.images[this.index];
    this.img.src = src;
    this.img.style.transform = '';
    this.openLink.href = src;
    this.count.textContent = n > 1 ? `${this.index + 1} / ${n}` : '';
    for (const b of this.el.querySelectorAll('[data-step]')) b.hidden = n < 2;
    const label = t('viewer.aria', { n: this.index + 1, total: n, title: this.title });
    this.panel.setAttribute('aria-label', label);
    this.img.alt = label;
  }
}
