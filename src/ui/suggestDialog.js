import { focusFirst } from './uiStack.js';
import { t } from '../core/i18n.js';

/**
 * Diálogo breve con dos opciones (capa de la UiStack: pausa el juego, se navega con teclado,
 * mando o toques). Se usa para sugerir el modo lista cuando el equipo va lento.
 *
 *   dialog.open({ title, text, confirm, cancel, onConfirm, onCancel })
 *
 * "Volver" (Esc / Ⓑ) equivale a la opción de cancelar.
 */
export class SuggestDialog {
  constructor(root, stack) {
    this.stack = stack;
    this.el = document.createElement('div');
    this.el.className = 'suggest';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="suggest__panel" role="alertdialog" aria-modal="true" aria-labelledby="suggest-title" aria-describedby="suggest-text" tabindex="-1">
        <h2 id="suggest-title" class="suggest__title"></h2>
        <p id="suggest-text" class="suggest__text"></p>
        <div class="suggest__actions">
          <button type="button" data-act="confirm"></button>
          <button type="button" data-act="cancel"></button>
        </div>
      </div>
    `;
    root.append(this.el);
    this.panel = this.el.querySelector('.suggest__panel');
    this.el.querySelector('[data-act="confirm"]').addEventListener('click', () => this.#finish('confirm'));
    this.el.querySelector('[data-act="cancel"]').addEventListener('click', () => this.#finish('cancel'));

    this.layer = {
      el: this.panel,
      onShow: () => {
        this.el.hidden = false;
        focusFirst(this.panel);
      },
      onHide: () => (this.el.hidden = true),
      onAction: (action) => {
        if (action === 'back' || action === 'pause') {
          this.#finish('cancel');
          return true;
        }
        return false;
      },
    };
  }

  open({ title, text, confirm = t('common.accept'), cancel = t('common.cancel'), onConfirm = null, onCancel = null }) {
    this.handlers = { confirm: onConfirm, cancel: onCancel };
    this.el.querySelector('.suggest__title').textContent = title;
    this.el.querySelector('.suggest__text').textContent = text;
    this.el.querySelector('[data-act="confirm"]').textContent = confirm;
    this.el.querySelector('[data-act="cancel"]').textContent = cancel;
    this.stack.push(this.layer);
  }

  #finish(choice) {
    this.stack.pop(this.layer);
    this.handlers?.[choice]?.();
    this.handlers = null;
  }
}
