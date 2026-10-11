import { projects, profile, rooms } from './data/index.js';
import { detectCapabilities } from './core/capabilities.js';
import { ListView } from './ui/listView.js';

/**
 * Lo que comparten el arranque (main.js) y el juego (game.js) sin cargar Three.js:
 * las capacidades del equipo y el modo lista, con su ruta `#lista`.
 *
 * Abrir el modo lista desde el juego añade `#lista` al historial, así que "atrás" en el
 * navegador (o en el móvil) vuelve al juego.
 */
export const caps = detectCapabilities();

// Título y descripción de la página en el idioma elegido (el HTML trae los de español).
document.title = profile.site?.title ?? document.title;
if (profile.site?.description) document.querySelector('meta[name="description"]')?.setAttribute('content', profile.site.description);

export const listView = new ListView(document.body, {
  projects,
  profile,
  rooms,
  baseUrl: import.meta.env.BASE_URL,
});
listView.setWebgl(caps.webgl);

const LIST_HASH = '#lista';
let pushed = false; // true si #lista lo añadimos nosotros (entonces cerrar = history.back())

export function wantsList() {
  return location.hash === LIST_HASH;
}

export function openList(notice = '') {
  if (!wantsList()) {
    history.pushState(null, '', LIST_HASH);
    pushed = true;
  }
  listView.open({ notice });
}

export function closeList() {
  if (wantsList()) {
    if (pushed) {
      pushed = false;
      history.back(); // `popstate` cierra la vista
      return;
    }
    history.replaceState(null, '', location.pathname + location.search);
  }
  listView.close();
}

// Atrás/adelante o editar la URL a mano.
function syncWithUrl() {
  if (wantsList()) listView.open();
  else {
    pushed = false;
    listView.close();
  }
}
window.addEventListener('popstate', syncWithUrl);
window.addEventListener('hashchange', syncWithUrl);
