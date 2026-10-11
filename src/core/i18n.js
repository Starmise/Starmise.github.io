import { settings, setSetting } from './settings.js';

/**
 * Idioma del portafolio (español o inglés).
 *
 * El idioma se decide ANTES de construir cualquier interfaz (main.js): con `?lang=es|en` en la
 * URL, con el guardado en Opciones (`settings.lang`) o, la primera vez, con la pantalla de
 * elección (ui/languageScreen.js). Después se carga su diccionario (src/i18n/<lang>.js) y
 * arranca el resto. Cambiar de idioma guarda la elección y recarga la página: así toda la
 * interfaz (y los datos) se construye una sola vez, sin repintar nada en caliente.
 *
 *   t('title.start')                 → "Empezar" / "Start"
 *   t('list.count', { n: 22 })       → sustituye {n}
 *   localizeData('projects', data)   → aplica la traducción de src/data/<lang>/ sobre el español
 *
 * Los textos del portafolio siguen viviendo en src/data/*.json (español, fuente única); el
 * inglés está en src/data/en/*.json y solo trae los campos traducidos (lo que falte se queda en
 * español). Los textos de la interfaz están en src/i18n/es.js y src/i18n/en.js.
 */

// `switchLabel` va escrito en su propio idioma: lo lee quien quiere cambiar a él.
export const LANGUAGES = [
  { code: 'es', name: 'Español', switchLabel: 'Ver el portafolio en español' },
  { code: 'en', name: 'English', switchLabel: 'View the portfolio in English' },
];

const LOADERS = {
  es: () => import('../i18n/es.js'),
  en: () => import('../i18n/en.js'),
};

let current = 'es';
let strings = {};
let data = null; // { projects, profile, rooms } traducidos (null en español)

export function lang() {
  return current;
}

/** Idioma ya decidido (URL o guardado), o null si hay que preguntarlo. */
export function presetLanguage() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (isLanguage(fromUrl)) return fromUrl;
  return isLanguage(settings.lang) ? settings.lang : null;
}

/** Sugerencia para la pantalla de elección: el idioma del navegador si es uno de los nuestros. */
export function browserLanguage() {
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
  for (const p of prefs) {
    const code = String(p).slice(0, 2).toLowerCase();
    if (isLanguage(code)) return code;
  }
  return 'en';
}

/** Carga el diccionario del idioma y lo activa (también `<html lang>`). */
export async function loadLanguage(code) {
  if (!isLanguage(code)) code = 'es';
  const mod = await LOADERS[code]();
  current = code;
  strings = mod.strings;
  data = mod.data ?? null;
  document.documentElement.lang = code;
  if (settings.lang !== code) setSetting('lang', code);
  return code;
}

/** Cambia de idioma: lo guarda y recarga la página (conserva `#lista` si estaba abierto). */
export function changeLanguage(code) {
  if (!isLanguage(code) || code === current) return;
  setSetting('lang', code);
  const url = new URL(location.href);
  url.searchParams.delete('lang'); // si no, el parámetro de la URL volvería a mandar
  location.replace(url.href);
}

/** El otro idioma (solo hay dos): para los botones de "cambiar idioma". */
export function otherLanguage() {
  return LANGUAGES.find((l) => l.code !== current);
}

/** Texto de la interfaz. Las variables `{nombre}` se sustituyen con `vars`. Algunas claves son listas. */
export function t(key, vars) {
  let s = strings[key];
  if (s == null) {
    if (import.meta.env.DEV) console.warn(`[i18n] falta la clave "${key}" (${current})`);
    return key;
  }
  if (typeof s !== 'string') return s; // listas (p. ej. la tabla de controles)
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  return s;
}

/**
 * Aplica la traducción de un JSON de datos ('projects' | 'profile' | 'rooms') sobre el original
 * en español. Devuelve una copia; el original no se toca.
 *
 * - projects / rooms: arrays con `id`; la traducción es un objeto `{ [id]: { campo: texto } }`.
 * - profile: objeto; la traducción es un objeto parcial con la misma forma. Los arrays de
 *   textos se sustituyen enteros; los de objetos (p. ej. `contact`, `whatIDo`) se combinan
 *   posición a posición, así que basta con escribir los campos que cambian.
 */
export function localizeData(kind, source) {
  const overlay = data?.[kind];
  if (!overlay) return source;
  if (Array.isArray(source)) {
    return source.map((item) => (overlay[item.id] ? merge(item, overlay[item.id]) : item));
  }
  return merge(source, overlay);
}

function merge(base, over) {
  if (Array.isArray(base) && Array.isArray(over)) {
    if (!base.some(isPlainObject)) return over.slice();
    return base.map((item, i) => (i < over.length ? merge(item, over[i]) : item));
  }
  if (isPlainObject(base) && isPlainObject(over)) {
    const out = { ...base };
    for (const [key, value] of Object.entries(over)) out[key] = key in base ? merge(base[key], value) : value;
    return out;
  }
  return over ?? base;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isLanguage(code) {
  return Object.hasOwn(LOADERS, code ?? '');
}
