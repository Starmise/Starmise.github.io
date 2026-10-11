import { settings, setSetting } from '../core/settings.js';
import { focusFirst } from './uiStack.js';
import { PROFILE_DOCUMENTS, projectDocument, whatIDoDocument } from './documents.js';
import { t, lang, LANGUAGES, changeLanguage, otherLanguage } from '../core/i18n.js';

const TABS = ['inventory', 'map', 'options'];

/**
 * Menú de pausa: Inventario (habilidades y archivos personales), Mapa (salas y proyectos;
 * abre fichas o viaja a una sala) y Opciones. Capa de la UiStack.
 */
export class PauseMenu {
  constructor(root, stack, { fileView, projects, profile, rooms, getCurrentRoom, onTravel, onTitle, onList }) {
    Object.assign(this, { stack, fileView, projects, profile, rooms, getCurrentRoom, onTravel, onTitle, onList });
    this.tab = 'inventory';

    this.el = document.createElement('div');
    this.el.className = 'pause';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="pause__panel" role="dialog" aria-modal="true" aria-label="${t('pause.aria')}" tabindex="-1">
        <header class="pause__head">
          <span class="pause__hint" aria-hidden="true">Q ◂</span>
          <div class="pause__tabs" role="tablist"></div>
          <span class="pause__hint" aria-hidden="true">▸ E</span>
        </header>
        <div class="pause__body"></div>
        <footer class="pause__foot"><span data-hint></span><button type="button" class="pause__resume">${t('pause.resume')}</button></footer>
      </div>
    `;
    root.appendChild(this.el);
    this.panel = this.el.querySelector('.pause__panel');
    this.tabsEl = this.el.querySelector('.pause__tabs');
    this.body = this.el.querySelector('.pause__body');
    this.hint = this.el.querySelector('[data-hint]');
    this.el.querySelector('.pause__resume').addEventListener('click', () => this.close());

    for (const id of TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.role = 'tab';
      b.className = 'pause__tab';
      b.dataset.tab = id;
      b.dataset.sfx = 'page';
      b.textContent = t(`pause.tab.${id}`);
      b.addEventListener('click', () => this.show(id));
      this.tabsEl.append(b);
    }

    this.layer = {
      el: this.panel,
      onShow: () => {
        this.el.hidden = false;
        this.#render();
      },
      onHide: () => (this.el.hidden = true),
      onAction: (action) => {
        if (action === 'tabPrev' || action === 'tabNext') {
          const i = TABS.indexOf(this.tab);
          const d = action === 'tabNext' ? 1 : -1;
          this.show(TABS[(i + d + TABS.length) % TABS.length]);
          return true;
        }
        if (action === 'pause') {
          this.close();
          return true;
        }
        return false;
      },
    };
  }

  get isOpen() {
    return this.stack.layers.includes(this.layer);
  }

  open(tab = this.tab) {
    this.tab = tab;
    if (!this.isOpen) this.stack.push(this.layer);
    else this.#render();
  }

  close() {
    this.stack.pop(this.layer);
  }

  show(tab) {
    this.tab = tab;
    this.#render();
  }

  setDevice(device) {
    this.device = device;
    if (this.isOpen) this.#renderHint();
  }

  #render() {
    for (const b of this.tabsEl.children) {
      const on = b.dataset.tab === this.tab;
      b.setAttribute('aria-selected', on);
      b.tabIndex = on ? 0 : -1;
    }
    this.body.replaceChildren(this.#build(this.tab));
    this.body.scrollTop = 0;
    this.#renderHint();
    focusFirst(this.body);
  }

  #renderHint() {
    const device = ['gamepad', 'touch'].includes(this.device) ? this.device : 'keyboard';
    this.hint.textContent = t(`pause.hint.${device}`);
  }

  #build(tab) {
    if (tab === 'inventory') return this.#inventory();
    if (tab === 'map') return this.#map();
    return this.#options();
  }

  // ---------- Inventario ----------

  #inventory() {
    const p = this.profile;
    const frag = document.createDocumentFragment();
    frag.append(h('h2', t('pause.skills')));
    const grid = h('ul', null, 'inv-grid');
    p.skills.forEach((skill, i) => {
      const li = h('li', null, 'inv-slot');
      li.append(h('span', String(i + 1).padStart(2, '0'), 'inv-slot__n'), h('span', skill, 'inv-slot__label'));
      grid.append(li);
    });
    frag.append(grid);

    frag.append(h('h2', t('pause.personal')));
    const list = h('div', null, 'pause__list');
    const docs = [
      PROFILE_DOCUMENTS.about(p),
      PROFILE_DOCUMENTS.demoreel(p),
      ...p.whatIDo.map(whatIDoDocument),
      PROFILE_DOCUMENTS.trivia(p),
      PROFILE_DOCUMENTS.contact(p),
    ];
    docs.forEach((doc, i) => {
      const label = doc.whatIDo ? t('pause.whatIDoItem', { title: doc.title }) : doc.title;
      list.append(button(label, () => this.fileView.open(doc, { docs, index: i })));
    });
    frag.append(list);
    return frag;
  }

  // ---------- Mapa ----------

  #map() {
    const frag = document.createDocumentFragment();
    const quick = h('div', null, 'pause__list map-quick');
    quick.append(button(t('pause.mapList'), () => this.onList()));
    frag.append(quick);
    const current = this.getCurrentRoom();
    for (const room of this.rooms) {
      const block = h('section', null, 'map-room');
      const head = h('div', null, 'map-room__head');
      const title = h('h2', room.name);
      head.append(title);
      if (room.id === current) head.append(h('span', t('pause.here'), 'map-room__here'));
      else if (room.model) head.append(button(t('pause.go'), () => this.onTravel(room.id), 'map-room__go', t('pause.goAria', { room: room.name })));
      else head.append(h('span', t('pause.soon'), 'map-room__soon'));
      block.append(head);
      if (room.description) block.append(h('p', room.description, 'map-room__desc'));

      const docs = this.#roomDocuments(room.id);
      if (docs.length) {
        const list = h('div', null, 'pause__list');
        docs.forEach((doc, i) => list.append(button(doc.title, () => this.fileView.open(doc, { docs, index: i }))));
        block.append(list);
      }
      frag.append(block);
    }
    return frag;
  }

  #roomDocuments(roomId) {
    const docs = (list) => list.map((p) => projectDocument(p, this.projects.indexOf(p)));
    if (roomId === 'hall') {
      return [
        ...docs(this.projects.filter((p) => p.featured)),
        PROFILE_DOCUMENTS.about(this.profile),
        PROFILE_DOCUMENTS.demoreel(this.profile),
      ];
    }
    if (roomId === 'save-room') return [PROFILE_DOCUMENTS.contact(this.profile), PROFILE_DOCUMENTS.trivia(this.profile)];
    return docs(this.projects.filter((p) => p.room === roomId));
  }

  // ---------- Opciones ----------

  #options() {
    const frag = document.createDocumentFragment();
    const rows = h('div', null, 'opt-list');
    const yesNo = [[true, t('common.yes')], [false, t('common.no')]];
    rows.append(
      languageRow(),
      toggleRow(t('opt.controls'), 'mode', [['modern', t('opt.modern')], ['tank', t('opt.tank')]]),
      toggleRow(t('opt.ps1'), 'ps1', yesNo),
      toggleRow(t('opt.doorAnim'), 'doorAnim', [['full', t('opt.doorFull')], ['short', t('opt.doorShort')]]),
      toggleRow(t('opt.motion'), 'motion',
        [['auto', t('opt.motionAuto')], ['reduce', t('opt.motionReduce')], ['full', t('opt.motionFull')]],
        t('opt.motionNote')),
      toggleRow(t('opt.touch'), 'touch', [['auto', t('opt.touchAuto')], ['on', t('opt.touchOn')], ['off', t('opt.touchOff')]]),
      toggleRow(t('opt.perfHint'), 'perfHint', yesNo),
      toggleRow(t('opt.sound'), 'sound', yesNo, t('opt.soundNote')),
      sliderRow(t('opt.volume'), 'volume'),
      sliderRow(t('opt.music'), 'music'),
      sliderRow(t('opt.sfx'), 'sfx', t('opt.sfxNote')),
    );
    frag.append(rows);

    frag.append(h('h2', t('pause.controls')));
    const table = h('dl', null, 'controls-list');
    for (const [action, key, pad] of t('pause.controlsList')) {
      table.append(h('dt', action), h('dd', `${key}  ·  ${pad}`));
    }
    frag.append(table);

    const links = h('div', null, 'pause__list');
    const classic = document.createElement('a');
    classic.className = 'pause__item';
    classic.href = this.profile.classicSite;
    classic.target = '_blank';
    classic.rel = 'noopener';
    classic.textContent = t('pause.classic');
    links.append(button(t('pause.list'), () => this.onList()), classic, button(t('pause.toTitle'), () => this.onTitle()));
    frag.append(links);
    return frag;
  }
}

/** Idioma: cambiarlo recarga la página (vuelve al título) con el otro idioma. */
function languageRow() {
  const row = h('div', null, 'opt-row');
  const labelEl = h('span', t('opt.language'), 'opt-row__label');
  labelEl.append(h('small', t('opt.languageNote'), 'opt-row__note'));
  row.append(labelEl);
  const name = LANGUAGES.find((l) => l.code === lang())?.name ?? lang();
  const b = button(`◂ ${name} ▸`, () => changeLanguage(otherLanguage().code), 'opt-row__value');
  b.setAttribute('aria-label', t('opt.aria', { label: t('opt.language'), value: name }));
  row.append(b);
  return row;
}

function toggleRow(label, key, options, note) {
  const row = h('div', null, 'opt-row');
  const labelEl = h('span', label, 'opt-row__label');
  if (note) labelEl.append(h('small', note, 'opt-row__note'));
  row.append(labelEl);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'opt-row__value';
  const paint = () => {
    const i = options.findIndex(([v]) => v === settings[key]);
    b.textContent = `◂ ${options[i]?.[1] ?? options[0][1]} ▸`;
    b.setAttribute('aria-label', t('opt.aria', { label, value: options[i]?.[1] ?? options[0][1] }));
  };
  b.addEventListener('click', () => {
    const i = options.findIndex(([v]) => v === settings[key]);
    setSetting(key, options[(i + 1) % options.length][0]);
    paint();
  });
  paint();
  row.append(b);
  return row;
}

function sliderRow(label, key, note) {
  const row = h('label', null, 'opt-row');
  const labelEl = h('span', label, 'opt-row__label');
  if (note) labelEl.append(h('small', note, 'opt-row__note'));
  row.append(labelEl);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.1';
  input.value = String(settings[key]);
  input.addEventListener('input', () => setSetting(key, Number(input.value)));
  row.append(input);
  return row;
}

function button(label, onClick, className = 'pause__item', ariaLabel) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', onClick);
  return b;
}

function h(tag, text, className) {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (className) n.className = className;
  return n;
}
