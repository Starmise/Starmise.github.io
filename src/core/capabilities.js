import { t } from './i18n.js';

/**
 * Qué puede hacer este equipo, sin cargar Three.js (lo usa el arranque para decidir entre el
 * juego y el modo lista).
 *
 *   webgl     el navegador puede crear un contexto WebGL 2 (Three.js lo necesita)
 *   software  el 3D se dibujaría sin aceleración gráfica (SwiftShader, llvmpipe…)
 *   lowEnd    poca memoria (≤ 2 GB) o ≤ 2 núcleos, si el navegador lo informa
 *   saveData  el usuario activó el ahorro de datos
 *   slow      alguno de los tres anteriores → sugerir el modo lista
 *   reasons   frases para explicar por qué se sugiere
 */
export function detectCapabilities() {
  const caps = { webgl: false, renderer: '', software: false, lowEnd: false, saveData: false, slow: false, reasons: [] };

  let gl = null;
  try {
    const canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2');
    if (gl) {
      caps.webgl = true;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      caps.renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
      // Si pidiendo "sin pérdidas graves de rendimiento" no hay contexto, el 3D va por software.
      const strict = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
      if (!strict) caps.software = true;
      strict?.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    caps.webgl = false;
  } finally {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }

  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(caps.renderer)) caps.software = true;
  const memory = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  caps.lowEnd = (memory > 0 && memory <= 2) || (cores > 0 && cores <= 2);
  caps.saveData = !!navigator.connection?.saveData;

  if (caps.software) caps.reasons.push(t('caps.software'));
  if (caps.lowEnd) caps.reasons.push(t('caps.lowEnd'));
  if (caps.saveData) caps.reasons.push(t('caps.saveData'));
  caps.slow = caps.webgl && caps.reasons.length > 0;
  return caps;
}
