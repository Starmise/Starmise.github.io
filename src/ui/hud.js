import { t } from '../core/i18n.js';

/**
 * HUD: prompt de interacción, ayuda de controles (teclado, mando o táctil) y avisos breves.
 * En táctil el prompt no muestra tecla (el botón de acción de la pantalla hace de tecla) y la
 * ayuda se oculta: los controles en pantalla se explican solos.
 */
export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.prompt = document.getElementById('prompt');
    this.promptVerb = this.prompt.querySelector('[data-verb]');
    this.promptKey = this.prompt.querySelector('[data-key]');
    this.promptLabel = this.prompt.querySelector('[data-label]');
    this.help = document.getElementById('help');
    this.status = document.getElementById('status');
    this.toast = document.getElementById('toast');
    this.toastTimer = 0;
    this.promptTarget = null;
    this.device = 'keyboard';
    this.setDevice('keyboard');
  }

  setVisible(on) {
    this.root.hidden = !on;
  }

  setPrompt(target) {
    if (target === this.promptTarget) return;
    this.promptTarget = target;
    this.prompt.hidden = !target;
    if (!target) return;
    this.promptVerb.textContent = target.verb ?? t(target.kind === 'door' ? 'hud.open' : 'hud.examine');
    this.promptLabel.textContent = target.label ?? target.id;
  }

  setDevice(device) {
    this.device = device;
    const pad = device === 'gamepad';
    this.promptKey.textContent = pad ? 'Ⓐ' : 'E';
    this.promptKey.hidden = device === 'touch';
    this.help.innerHTML = device === 'touch' ? '' : t(pad ? 'hud.help.gamepad' : 'hud.help.keyboard');
  }

  setStatus(text) {
    this.status.textContent = text;
  }

  flash(text, ms = 1800) {
    this.toast.textContent = text;
    this.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast.hidden = true), ms);
  }
}
