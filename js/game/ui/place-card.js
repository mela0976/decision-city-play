// 目的地卡：goto 步驟開始時，疊在目的地插畫上的一張路名牌（地名、要去做什麼、限時多久）。
// 按一下「出發」才回到街上開始倒數。

import { h, interaction } from '../dom.js?v=d89c3a18';
import { T } from '../strings.js?v=d89c3a18';

export function showPlaceCard({ layer, name, hint, limit, signal, sfx }) {
  return interaction(signal, (done) => {
    const go = h('button', { type: 'button', class: 'btn btn--primary btn--big', id: 'place-go', 'data-primary': true, text: T.depart });
    go.addEventListener('click', () => {
      sfx?.play('select');
      done();
    });
    const card = h(
      'article',
      { class: 'place-card', 'aria-labelledby': 'place-name' },
      h('p', { class: 'place-way' }, h('span', { class: 'place-arrow', 'aria-hidden': 'true', text: '→' }), h('span', { text: T.destination })),
      h('h2', { class: 'sign-plate place-name', id: 'place-name', text: name || '' }),
      hint ? h('p', { class: 'place-hint', text: hint }) : null,
      limit ? h('p', { class: 'place-limit' }, h('span', { text: T.timeLimit }), h('b', { text: limit })) : null,
    );
    const wrap = h('div', { class: 'chapter chapter--card chapter--place' }, card, h('div', { class: 'cine-actions' }, go));
    layer.replaceChildren(wrap);
    go.focus({ preventScroll: true });
    return () => wrap.remove();
  });
}
