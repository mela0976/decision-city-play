// 選單與二次確認，都用原生 <dialog>（焦點、Esc、背景失效由瀏覽器處理）。

import { h, fill, arrowFocus } from '../dom.js?v=de58bb6c';
import { T } from '../strings.js?v=de58bb6c';

/**
 * items：[{ id, label, onSelect, danger, keepOpen }]，依序排成一欄。
 * keepOpen 的項目按了不關選單（開關類），其餘先關選單再執行。
 */
export function openMenu({ dialog, items, note, extra = null, version = '' }) {
  const buttons = items.map((item, i) => {
    const button = h('button', { type: 'button', class: `btn menu-item${item.danger ? ' btn--danger' : ''}${i === 0 ? ' btn--primary' : ''}`, id: `menu-${item.id}`, text: item.label() });
    button.addEventListener('click', () => {
      if (item.keepOpen) {
        item.onSelect();
        button.textContent = item.label();
      } else {
        dialog.close();
        item.onSelect();
      }
    });
    return button;
  });
  fill(dialog, h('h2', { id: 'menu-title', text: T.menu }), h('div', { class: 'menu-list' }, buttons), extra, note ? h('p', { class: 'menu-note', text: note }) : null, version ? h('p', { class: 'menu-version', id: 'menu-version', text: version }) : null);
  if (!dialog.open) dialog.showModal();
  if (!dialog.dataset.menuArrows) {
    dialog.dataset.menuArrows = '1';
    menuArrows(dialog);
  }
  buttons[0]?.focus({ preventScroll: true });
}

/** 選單方向鍵：上下左右在按鈕與滑桿之間循環；滑桿上的左右鍵留給滑桿本身調音量。 */
function menuArrows(dialog) {
  dialog.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    const onRange = e.target instanceof HTMLInputElement && e.target.type === 'range';
    if (onRange && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    const items = [...dialog.querySelectorAll('.menu-item, .menu-sound input[type="range"], .menu-lang .lang-btn')].filter((b) => !b.disabled && b.offsetParent !== null);
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement);
    const next = at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length;
    items[next].focus();
  });
}

/** 聲音設定：音樂、語音、音效三條音量滑桿，加一顆全部靜音。 */
export function soundControls(sound) {
  const sliders = ['music', 'voice', 'sfx'].map((bus) => {
    const input = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(sound.volumes[bus] * 100)), id: `volume-${bus}` });
    const value = h('output', { for: `volume-${bus}`, text: input.value });
    input.addEventListener('input', () => {
      sound.setVolume(bus, Number(input.value) / 100);
      value.textContent = input.value;
    });
    return h('label', { class: 'volume' }, h('span', { text: T.volume[bus] }), input, value);
  });
  const mute = h('button', { type: 'button', class: 'btn menu-item', id: 'menu-mute', 'aria-pressed': String(sound.muted), text: sound.muted ? T.unmuteAll : T.muteAll });
  mute.addEventListener('click', () => {
    sound.setMuted(!sound.muted);
    mute.textContent = sound.muted ? T.unmuteAll : T.muteAll;
    mute.setAttribute('aria-pressed', String(sound.muted));
  });
  return h('fieldset', { class: 'menu-sound' }, h('legend', { text: T.soundTitle }), sliders, mute);
}

/** 二次確認：預設焦點在「留著」那一顆，Esc 等同取消。回傳 Promise<boolean>。 */
export function askConfirm({ dialog, question, yes, no }) {
  return new Promise((resolve) => {
    const keep = h('button', { type: 'submit', class: 'btn btn--primary', value: 'no', autofocus: true, text: no });
    const discard = h('button', { type: 'submit', class: 'btn btn--danger', value: 'yes', id: 'confirm-yes', text: yes });
    const form = h('form', { method: 'dialog', class: 'confirm-form' }, h('h2', { id: 'confirm-title', text: question }), h('div', { class: 'confirm-actions' }, discard, keep));
    dialog.replaceChildren(form);
    dialog.returnValue = '';
    dialog.addEventListener(
      'close',
      () => {
        const value = dialog.returnValue;
        dialog.returnValue = '';
        resolve(value === 'yes');
      },
      { once: true },
    );
    arrowFocus(form, () => [discard, keep]);
    dialog.showModal();
    keep.focus({ preventScroll: true });
  });
}

/** 沒有 closedby 的瀏覽器（Safari）補上點背景關閉。 */
export function enableLightDismiss(dialogs) {
  if ('closedBy' in HTMLDialogElement.prototype) return;
  const outside = (e, dialog) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  for (const dialog of dialogs) {
    if (dialog.getAttribute('closedby') !== 'any') continue;
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => {
      pressedOutside = outside(e, dialog);
    });
    dialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && outside(e, dialog)) dialog.close();
    });
  }
}
