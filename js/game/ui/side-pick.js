// 同一個地點有不只一件事可以做（主線、收工、幾個支線）：先出一張清單讓玩家選。
// 第一項是預設（動作鍵就選它）；數字鍵或點選其他項；「先不要」回到街上。

import { h, interaction, arrowFocus } from '../dom.js?v=2104ee78';
import { T } from '../strings.js?v=2104ee78';

/** entries：[{ tag, title, sub, value }]。回傳選中的 value，取消回傳 null。 */
export function pickWork({ layer, place, entries, signal, sfx }) {
  return interaction(signal, (done) => {
    const buttons = entries.map((entry, i) => {
      const button = h(
        'button',
        { type: 'button', class: `pick-item${entry.main ? ' pick-item--main' : ''}`, dataset: { key: String(i + 1) }, ...(i === 0 ? { 'data-primary': true } : {}) },
        i < 9 ? h('kbd', { 'aria-hidden': 'true', text: String(i + 1) }) : null,
        h('span', { class: 'pick-text' }, h('small', { text: [entry.tag, entry.sub].filter(Boolean).join('　') }), h('strong', { text: entry.title || '' })),
      );
      button.addEventListener('click', () => {
        sfx?.play('select');
        done(entry.value);
      });
      return button;
    });
    const cancel = h('button', { type: 'button', class: 'btn btn--small', id: 'pick-cancel', text: T.pickCancel });
    cancel.addEventListener('click', () => {
      sfx?.play('select');
      done(null);
    });
    const panel = h(
      'section',
      { class: 'pick', 'aria-labelledby': 'pick-title', tabindex: '-1' },
      h('header', { class: 'pick-head' }, h('h2', { class: 'sign-plate', id: 'pick-title', text: place || '' }), h('span', { class: 'pick-count', text: T.pickCount(entries.length) }), cancel),
      h('div', { class: 'pick-list' }, buttons),
    );
    arrowFocus(panel, () => [...buttons, cancel]);
    const wrap = h('div', { class: 'pick-wrap' }, panel);
    layer.replaceChildren(wrap);
    buttons[0]?.focus({ preventScroll: true });
    return () => wrap.remove();
  });
}
