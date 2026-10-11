/**
 * Opciones del jugador, guardadas en localStorage (si está disponible).
 * El menú de pausa las edita; quien las usa se suscribe con `onChange`.
 */
const KEY = 'starmise.settings';

const DEFAULTS = {
  lang: null, // 'es' | 'en'; null = aún no se ha elegido (se pregunta al inicio, ver core/i18n.js)
  mode: 'modern', // 'modern' | 'tank'
  ps1: true, // efectos PS1 (resolución, temblor, dithering)
  doorAnim: 'full', // 'full' | 'short' (con movimiento reducido siempre es 'short')
  motion: 'auto', // 'auto' (según el sistema) | 'reduce' | 'full' — ver core/motion.js
  touch: 'auto', // controles táctiles: 'auto' (al tocar la pantalla) | 'on' | 'off'
  perfHint: true, // sugerir el modo lista si el juego va lento
  sound: true, // interruptor general del audio (no pierde los volúmenes)
  volume: 0.8, // volumen general 0..1
  music: 0.75, // música 0..1
  sfx: 0.85, // efectos, ambiente e interfaz 0..1
};

const CHOICES = {
  lang: [null, 'es', 'en'],
  mode: ['modern', 'tank'],
  doorAnim: ['full', 'short'],
  motion: ['auto', 'reduce', 'full'],
  touch: ['auto', 'on', 'off'],
};

const listeners = new Set();

export const settings = load();

export function setSetting(key, value) {
  if (settings[key] === value) return;
  settings[key] = value;
  save();
  listeners.forEach((fn) => fn(key, value));
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function load() {
  const s = { ...DEFAULTS };
  try {
    Object.assign(s, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    /* almacenamiento no disponible */
  }
  for (const [key, values] of Object.entries(CHOICES)) {
    if (!values.includes(s[key])) s[key] = DEFAULTS[key];
  }
  return s;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* los ajustes duran solo esta sesión */
  }
}
