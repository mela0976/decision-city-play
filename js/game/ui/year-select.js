// 年度選擇（LAUNCH_READINESS #10）：破關一次之後，標題多一顆「年度選擇」。
// 九個年份各一張卡：年份、那一年的主線、完成與否、支線做了幾件。挑一年就單獨重玩那一年的主線，可以順便補支線。
// 重玩結束回到這裡，最上面一張小結果卡。

import { h, arrowFocus } from '../dom.js?v=441539db';
import { T, METER_IDS, METER_NAMES } from '../strings.js?v=441539db';

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');

function resultCard(result) {
  const deltas = METER_IDS.map((id) => {
    const d = result.deltas[id] || 0;
    const good = id === 'liver' ? d < 0 : d > 0;
    return h('li', { class: d ? (good ? 'is-good' : 'is-bad') : '' }, h('span', { text: METER_NAMES[id] }), h('b', { text: signed(d) }));
  });
  const facts = [
    T.replay.sides(result.sidesDone, result.sidesTotal),
    result.punctual ? T.replay.punctual(result.punctual) : '',
    result.inspiration ? T.replay.inspiration(result.inspiration) : '',
  ].filter(Boolean);
  return h(
    'section',
    { class: `year-result${result.cleared ? ' is-cleared' : ''}`, id: 'year-result', 'aria-labelledby': 'year-result-title' },
    h('header', {}, h('span', { class: 'lightbox', text: String(result.year) }), h('strong', { id: 'year-result-title', text: result.title }), h('span', { class: 'year-stamp', text: result.forced ? T.replay.forced : result.cleared ? T.replay.cleared : T.replay.unfinished })),
    h('ul', { class: 'year-deltas' }, deltas),
    facts.length ? h('p', { class: 'year-facts', text: facts.join('　') }) : null,
  );
}

/**
 * years：[{ year, title, place, done, sidesDone, sidesTotal }]
 * result：上一次重玩的結果（可省略）
 */
export function showYearSelect({ screen, assets, years, result = null, onPick, onBack }) {
  const back = h('button', { type: 'button', class: 'btn btn--small', id: 'years-back', text: T.backToTitle, onClick: onBack });
  const cards = years.map((item) =>
    h(
      'li',
      {},
      h(
        'button',
        { type: 'button', class: `year-card${item.done ? ' is-done' : ''}`, dataset: { year: String(item.year) }, 'aria-label': `${item.year}　${item.title}　${item.done ? T.replay.done : T.replay.notDone}　${T.replay.sides(item.sidesDone, item.sidesTotal)}`, onClick: () => onPick(item.year) },
        assets.art(item.splash, { kind: 'cover', className: 'year-art' }),
        h('span', { class: 'year-no', text: String(item.year) }),
        h('strong', { class: 'year-title', text: item.title }),
        h('span', { class: 'year-meta' }, h('span', { class: `year-state${item.done ? ' is-done' : ''}`, text: item.done ? '✓' : '—', 'aria-hidden': 'true' }), h('span', { text: T.replay.sides(item.sidesDone, item.sidesTotal) })),
      ),
    ),
  );
  const grid = h('ol', { class: 'year-grid' }, cards);
  const root = h(
    'section',
    { class: 'years', 'aria-labelledby': 'years-title' },
    h('header', { class: 'years-head' }, h('h2', { id: 'years-title', text: T.replay.title }), back),
    h('div', { class: 'years-body' }, result ? resultCard(result) : null, grid),
  );
  const buttons = () => [...grid.querySelectorAll('.year-card'), back];
  arrowFocus(root, buttons);
  screen.replaceChildren(root);
  const focus = (result && grid.querySelector(`[data-year="${result.year}"]`)) || grid.querySelector('.year-card');
  focus?.setAttribute('data-primary', '');
  focus?.focus({ preventScroll: true });
  // 焦點移到哪一張，動作鍵就按哪一張
  root.addEventListener('focusin', (e) => {
    const card = e.target.closest?.('.year-card');
    if (!card) return;
    for (const other of grid.querySelectorAll('[data-primary]')) other.removeAttribute('data-primary');
    card.setAttribute('data-primary', '');
  });
  return {
    destroy() {
      root.remove();
    },
  };
}
