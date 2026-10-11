import { thumbUrl, youtubeEmbed, youtubeThumb } from '../core/assets.js';
import { reducedMotion } from '../core/motion.js';
import { t, changeLanguage, otherLanguage } from '../core/i18n.js';

/**
 * Modo lista: todo el portafolio como una página HTML normal (sin 3D), con los mismos datos
 * que el juego. Es accesible (encabezados, puntos de referencia, foco visible, texto real) y
 * no depende de Three.js, así que se puede abrir sin cargar el juego (`#lista` en la URL).
 *
 *   open({ notice })   muestra la vista (notice: aviso opcional arriba, p. ej. "sin WebGL")
 *   close()
 *   onPlay             callback del botón "Jugar en 3D" / "Volver al juego"
 *   subscribe(fn)      fn(open) al abrir/cerrar (el juego se pausa y mete `layer` en su UiStack)
 *
 * Mientras está abierta, el resto de la página queda `inert` (ni el foco ni los lectores de
 * pantalla llegan al juego que hay detrás).
 */
export class ListView {
  constructor(root, { projects, profile, rooms, baseUrl = './' }) {
    Object.assign(this, { projects, profile, rooms, baseUrl });
    this.isOpen = false;
    this.gameLoaded = false;
    this.webgl = true;
    this.onPlay = null;
    this.listeners = new Set();
    this.savedTitle = document.title;

    this.el = h('div', { class: 'list-mode', hidden: '', tabindex: '-1' });
    this.el.append(this.#header(), this.#toc(), this.#main(), this.#footer());
    root.append(this.el);

    this.notice = this.el.querySelector('.lm-notice');
    this.playBtn = this.el.querySelector('[data-act="play"]');
    this.playBtn.addEventListener('click', () => this.onPlay?.());

    // Enlaces internos: desplazar sin tocar el hash (#lista es el que abre esta vista).
    this.el.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#lm-"]');
      if (!a) return;
      e.preventDefault();
      this.scrollTo(a.getAttribute('href').slice(1));
    });

    // Capa para la UiStack del juego (mando y Esc). Las flechas desplazan la página.
    this.layer = { el: this.el, nativeKeys: true, onAction: null };
  }

  open({ notice = '' } = {}) {
    this.notice.textContent = notice;
    this.notice.hidden = !notice;
    this.#paintPlay();
    if (this.isOpen) return;
    this.isOpen = true;
    // Primero los suscriptores (la UiStack del juego guarda el foco actual para devolverlo al cerrar).
    this.listeners.forEach((fn) => fn(true));
    this.el.hidden = false;
    this.#setInert(true);
    this.savedTitle = document.title;
    document.title = t('list.docTitle', { alias: this.profile.alias });
    this.el.scrollTop = 0;
    this.el.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.#stopVideo();
    this.el.hidden = true;
    this.#setInert(false);
    document.title = this.savedTitle;
    this.listeners.forEach((fn) => fn(false));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setGameLoaded(on) {
    this.gameLoaded = on;
    this.#paintPlay();
  }

  setWebgl(on) {
    this.webgl = on;
    this.#paintPlay();
  }

  scrollTo(id) {
    const target = this.el.querySelector(`#${CSS.escape(id)}`);
    if (!target) return;
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    const heading = target.matches('h2, h3') ? target : target.querySelector('h2, h3');
    heading?.focus({ preventScroll: true });
  }

  #paintPlay() {
    this.playBtn.hidden = !this.webgl;
    this.playBtn.textContent = t(this.gameLoaded ? 'list.back' : 'list.play');
  }

  #setInert(on) {
    for (const node of document.body.children) {
      if (node !== this.el && node.tagName !== 'SCRIPT') node.inert = on;
    }
  }

  #stopVideo() {
    const box = this.el.querySelector('.lm-video');
    if (box?.querySelector('iframe')) box.replaceChildren(this.#videoButton());
  }

  // ---------- Construcción ----------

  #header() {
    const p = this.profile;
    const featured = this.projects.filter((x) => x.featured).length;
    const other = otherLanguage();
    const langBtn = h('button', { type: 'button', class: 'lm-btn lm-btn--lang', lang: other.code, title: other.switchLabel }, other.name);
    langBtn.addEventListener('click', () => changeLanguage(other.code));
    return h('header', { class: 'lm-head' },
      h('div', { class: 'lm-head__id' },
        h('p', { class: 'lm-head__alias', 'aria-hidden': 'true' }, p.alias),
        h('h1', { class: 'lm-head__name' }, `${p.name} `, h('span', {}, `· ${p.title}`)),
        h('p', { class: 'lm-head__count' }, t('list.count', { n: this.projects.length, featured })),
      ),
      h('div', { class: 'lm-head__actions' },
        h('button', { type: 'button', class: 'lm-btn lm-btn--primary', 'data-act': 'play' }, t('list.play')),
        h('a', { class: 'lm-btn', href: p.classicSite, target: '_blank', rel: 'noopener' }, t('list.classic')),
        langBtn,
      ),
      h('p', { class: 'lm-notice', role: 'status', hidden: '' }),
    );
  }

  #projectRooms() {
    return this.rooms
      .map((room) => ({ room, items: this.projects.filter((p) => p.room === room.id) }))
      .filter((g) => g.items.length);
  }

  #toc() {
    const links = [
      ['lm-about', t('list.about')],
      ['lm-featured', t('list.featured')],
      ...this.#projectRooms().map(({ room }) => [`lm-room-${room.id}`, room.name]),
      ['lm-skills', t('list.skills')],
      ['lm-contact', t('list.contact')],
    ];
    return h('nav', { class: 'lm-toc', 'aria-label': t('list.sections') },
      h('ul', {}, ...links.map(([id, label]) => h('li', {}, h('a', { href: `#${id}` }, label)))),
    );
  }

  #main() {
    const main = h('main', { class: 'lm-main', id: 'lm-main' });
    main.append(this.#about(), this.#featured());
    for (const { room, items } of this.#projectRooms()) main.append(this.#roomSection(room, items));
    main.append(this.#skills(), this.#trivia(), this.#contact());
    return main;
  }

  #section(id, title, ...children) {
    return h('section', { class: 'lm-section', id, 'aria-labelledby': `${id}-h` },
      h('h2', { id: `${id}-h`, tabindex: '-1' }, title),
      ...children,
    );
  }

  #about() {
    const p = this.profile;
    const body = h('div', { class: 'lm-about' },
      h('div', { class: 'lm-about__text' },
        ...p.about.map((t) => h('p', {}, t)),
        p.studio && h('p', { class: 'lm-about__studio' }, h('strong', {}, t('list.studio')), p.studio.name),
      ),
      p.demoReel && h('figure', { class: 'lm-about__reel' },
        h('div', { class: 'lm-video' }, this.#videoButton()),
        h('figcaption', {}, p.demoReel.title, ' · ',
          h('a', { href: `https://www.youtube.com/watch?v=${p.demoReel.youtubeId}`, target: '_blank', rel: 'noopener' }, t('list.youtube'))),
      ),
    );
    return this.#section('lm-about', t('list.about'), body);
  }

  #videoButton() {
    const reel = this.profile.demoReel;
    const poster = reel.thumbnail ?? youtubeThumb(reel.youtubeId);
    const img = h('img', { src: this.#url(poster), alt: '', loading: 'lazy' });
    img.addEventListener('error', () => img.remove()); // sin miniatura: queda el fondo negro
    const btn = h('button', { type: 'button', class: 'lm-video__play', 'aria-label': t('file.playAria', { title: reel.title }) },
      img,
      h('span', { class: 'lm-video__label' }, t('file.play')),
    );
    btn.addEventListener('click', () => {
      const frame = h('iframe', {
        src: youtubeEmbed(reel),
        title: reel.title,
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        referrerpolicy: 'strict-origin-when-cross-origin',
        allowfullscreen: '',
      });
      btn.replaceWith(frame);
      frame.focus();
    });
    return btn;
  }

  #featured() {
    const items = this.projects.filter((p) => p.featured);
    const list = h('ul', { class: 'lm-featured' },
      ...items.map((p) => h('li', {},
        h('a', { href: `#lm-p-${p.id}`, class: 'lm-featured__item' },
          h('img', { src: this.#url(thumbUrl(p.cover)), alt: '', loading: 'lazy' }),
          h('span', { class: 'lm-featured__title' }, p.title),
          p.tagline && h('span', { class: 'lm-featured__tagline' }, p.tagline),
        ),
      )),
    );
    return this.#section('lm-featured', t('list.featured'), list);
  }

  #roomSection(room, items) {
    const id = `lm-room-${room.id}`;
    return this.#section(id, room.name,
      room.description && h('p', { class: 'lm-section__desc' }, room.description),
      h('div', { class: 'lm-grid' }, ...items.map((p) => this.#card(p))),
    );
  }

  #card(p) {
    const index = this.projects.indexOf(p);
    const id = `lm-p-${p.id}`;
    const details = [
      [t('doc.description'), p.description],
      [t('doc.process'), p.process],
    ].filter(([, text]) => text);
    return h('article', { class: 'lm-card', id, 'aria-labelledby': `${id}-h` },
      h('img', {
        class: 'lm-card__cover',
        src: this.#url(thumbUrl(p.cover)),
        srcset: `${this.#url(thumbUrl(p.cover))} 256w, ${this.#url(p.cover)} 1280w`,
        sizes: '(max-width: 700px) 92vw, 340px',
        alt: t('doc.coverAlt', { title: p.title }),
        loading: 'lazy',
        decoding: 'async',
      }),
      h('div', { class: 'lm-card__body' },
        h('p', { class: 'lm-card__kicker' },
          t('doc.fileNo', { n: String(index + 1).padStart(3, '0') }),
          p.featured && h('span', { class: 'lm-card__star' }, t('list.featuredBadge')),
        ),
        h('h3', { id: `${id}-h`, tabindex: '-1' }, p.title),
        p.tagline && h('p', { class: 'lm-card__tagline' }, p.tagline),
        p.role && h('p', { class: 'lm-card__role' }, h('strong', {}, t('list.role')), p.role),
        p.tags?.length && h('ul', { class: 'lm-tags', 'aria-label': t('file.tags') }, ...p.tags.map((tag) => h('li', {}, tag))),
        details.length && h('details', { class: 'lm-card__more' },
          h('summary', {}, t('list.readMore')),
          ...details.flatMap(([heading, text]) => [h('h4', {}, heading), h('p', {}, text)]),
          p.gallery?.length && h('ul', { class: 'lm-gallery', 'aria-label': t('file.gallery') },
            ...p.gallery.map((src, i) => h('li', {},
              h('a', { href: this.#url(src), target: '_blank', rel: 'noopener', 'aria-label': t('file.imageAria', { n: i + 1, title: p.title }) },
                h('img', { src: this.#url(thumbUrl(src)), alt: '', loading: 'lazy' })),
            )),
          ),
        ),
        p.externalLink && h('a', { class: 'lm-card__link', href: p.externalLink, target: '_blank', rel: 'noopener' },
          `${p.externalLabel || t('doc.viewProject')} ↗`),
      ),
    );
  }

  #skills() {
    const p = this.profile;
    return this.#section('lm-skills', t('list.skills'),
      h('ul', { class: 'lm-skills' }, ...p.skills.map((s) => h('li', {}, s))),
      p.whatIDo?.length && h('h3', { class: 'lm-subhead' }, t('list.whatIDo')),
      p.whatIDo?.length && h('div', { class: 'lm-whatido' },
        ...p.whatIDo.map((w) => h('article', { class: 'lm-whatido__item' },
          w.image && h('img', { src: this.#url(thumbUrl(w.image)), alt: '', loading: 'lazy' }),
          h('div', {}, h('h4', {}, w.title), h('p', {}, w.text)),
        )),
      ),
    );
  }

  #trivia() {
    const items = this.profile.trivia?.items ?? [];
    if (!items.length) return '';
    return this.#section('lm-trivia', t('list.trivia'), h('ul', { class: 'lm-trivia' }, ...items.map((item) => h('li', {}, item))));
  }

  #contact() {
    return this.#section('lm-contact', t('list.contact'),
      h('ul', { class: 'lm-contact' },
        ...this.profile.contact.map((c) => {
          const external = !c.url.startsWith('mailto:');
          return h('li', {}, h('a', { class: 'lm-btn', href: c.url, ...(external ? { target: '_blank', rel: 'noopener' } : {}) },
            external ? `${c.label} ↗` : c.label));
        }),
      ),
    );
  }

  #footer() {
    return h('footer', { class: 'lm-foot' },
      h('p', {}, `${this.profile.alias} · ${this.profile.name} · ${t('common.legal')}`),
    );
  }

  #url(path) {
    return /^(https?:|data:)/.test(path) ? path : this.baseUrl + path;
  }
}

/** Crea un elemento: h('a', { href }, 'texto', otroNodo). Ignora hijos vacíos (false, null, ''). */
function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === false || child == null || child === '' || child === 0) continue;
    node.append(child);
  }
  return node;
}
