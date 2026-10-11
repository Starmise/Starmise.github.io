import projectsSource from './projects.json';
import profileSource from './profile.json';
import roomsSource from './rooms.json';
import { lang, localizeData } from '../core/i18n.js';

/**
 * Los datos del portafolio en el idioma activo. El español (los JSON de esta carpeta) es la
 * fuente única; las traducciones (en/*.json) solo cambian los textos. Este módulo se evalúa
 * después de elegir el idioma (main.js), así que basta con importarlo.
 */
export const projects = localizeData('projects', projectsSource);
export const profile = localizeData('profile', profileSource);
export const rooms = localizeData('rooms', roomsSource);

// En desarrollo, avisar de lo que falte por traducir (se muestra en español).
if (import.meta.env.DEV && lang() !== 'es') {
  const missing = [
    ...projects.filter((p, i) => p.description === projectsSource[i].description).map((p) => `projects: ${p.id}`),
    ...rooms.filter((r, i) => r.name === roomsSource[i].name).map((r) => `rooms: ${r.id}`),
  ];
  if (missing.length) console.warn(`[i18n] sin traducir a "${lang()}":`, missing);
}
