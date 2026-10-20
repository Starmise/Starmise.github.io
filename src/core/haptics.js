import { settings } from './settings.js';

/**
 * Vibración breve en pantallas táctiles (Vibration API). Solo Android/Chrome la admite;
 * en iPhone no existe y no pasa nada. Se apaga con la opción "Vibración".
 */
export const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

const PATTERNS = {
  tap: 8, // botón en pantalla
  run: 12, // empezar a correr con el joystick
  act: [14, 40, 10], // examinar / abrir
  deny: [20, 50, 20], // nada que hacer (demasiado lejos, puerta cerrada)
};

export function haptic(kind = 'tap') {
  if (!canVibrate || !settings.haptics) return;
  try {
    navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tap);
  } catch {
    /* algunos navegadores lo bloquean sin gesto previo */
  }
}
