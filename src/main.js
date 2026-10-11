import { presetLanguage, browserLanguage, loadLanguage } from './core/i18n.js';
import { chooseLanguage } from './ui/languageScreen.js';

/**
 * Punto de entrada. Primero el idioma (todo lo demás se construye ya traducido):
 *
 *   - `?lang=es|en` en la URL o el idioma guardado → directo
 *   - la primera visita                            → pantalla de elección (ui/languageScreen.js)
 *
 * Luego boot.js decide entre el modo lista y el juego. El
 * diccionario de cada idioma se descarga solo si se usa (src/i18n/).
 */
async function start() {
  let code = presetLanguage();
  if (!code) {
    code = await chooseLanguage({ suggested: browserLanguage() });
  }
  await loadLanguage(code);
  await import('./boot.js');
}

start().catch((err) => {
  console.error(err);
  document.getElementById('ui').textContent =
    'No se pudo cargar el portafolio / The portfolio could not be loaded. Recarga la página / Please reload.';
});
