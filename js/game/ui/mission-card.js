// 任務卡與過關結算：疊在過場劇照上的兩張單據（票券的欄位、打孔、騎縫線、等寬數字）。
// 過關時蓋上朱紅印章。年份是一塊壓克力燈箱招牌。

import { h, interaction, formatDelta } from '../dom.js';
import { T, METER_IDS, METER_NAMES } from '../strings.js';

const field = (label, value, className = '') => (value ? h('div', { class: `ticket-field ${className}`.trim() }, h('dt', { text: label }), h('dd', { text: value })) : null);

function stub({ kind, year, no }) {
  return h('header', { class: 'ticket-stub' }, h('span', { class: 'lightbox', text: String(year ?? '') }), h('span', { class: 'ticket-kind', text: kind }), h('span', { class: 'ticket-no', text: String(no ?? '').padStart(2, '0') }));
}

export function showMissionCard({ layer, mission, place, giver, signal, sfx }) {
  return interaction(signal, (done) => {
    const accept = h('button', { type: 'button', class: 'btn btn--primary btn--big', id: 'mission-accept', 'data-primary': true, text: T.acceptMission });
    accept.addEventListener('click', () => {
      sfx?.play('select');
      done();
    });
    const card = h(
      'article',
      { class: 'ticket ticket--mission', 'aria-labelledby': 'mission-title' },
      stub({ kind: T.missionSlip, year: mission.year, no: mission.order }),
      h(
        'div',
        { class: 'ticket-body' },
        h('h2', { id: 'mission-title', text: mission.title }),
        h('p', { class: 'ticket-brief', text: mission.brief || '' }),
        h('dl', { class: 'ticket-fields' }, field(T.field.time, mission.clock, 'is-mono'), field(T.field.place, place), field(T.field.client, giver ? [giver.name, giver.title].filter(Boolean).join('　') : '')),
      ),
    );
    const wrap = h('div', { class: 'chapter chapter--card' }, card, h('div', { class: 'cine-actions' }, accept));
    layer.replaceChildren(wrap);
    accept.focus({ preventScroll: true });
    return () => wrap.remove();
  });
}

export function showMissionClear({ layer, assets, mission, place, before, after, book, signal, sfx }) {
  return interaction(signal, (done) => {
    const back = h('button', { type: 'button', class: 'btn btn--primary btn--big', id: 'clear-next', 'data-primary': true, text: T.next });
    back.addEventListener('click', () => {
      sfx?.play('select');
      done();
    });

    const rows = METER_IDS.map((id) => {
      const delta = (after[id] ?? 0) - (before[id] ?? 0);
      const good = id === 'liver' ? delta < 0 : delta > 0;
      return h(
        'li',
        { dataset: { meter: id } },
        h('span', { class: 'm-name', text: METER_NAMES[id] }),
        h('b', { class: 'm-num', text: String(after[id] ?? 0) }),
        h('em', { class: `clear-delta ${delta === 0 ? '' : good ? 'is-good' : 'is-bad'}`, text: delta === 0 ? '±0' : formatDelta(delta) }),
        h('span', { class: 'm-bar', 'aria-hidden': 'true' }, h('i', { vars: { '--v': String(after[id] ?? 0) } })),
      );
    });

    const card = h(
      'article',
      { class: 'ticket ticket--clear', 'aria-labelledby': 'clear-title' },
      stub({ kind: T.clearSlip, year: mission.year, no: mission.order }),
      h(
        'div',
        { class: 'ticket-body' },
        h('h2', { id: 'clear-title' }, h('span', { class: 'sr-only', text: `${T.cleared}：` }), mission.title),
        h('dl', { class: 'ticket-fields' }, field(T.field.time, mission.clock, 'is-mono'), field(T.field.place, place)),
        h('ul', { class: 'clear-meters' }, rows),
        book
          ? h(
              'div',
              { class: 'clear-book' },
              assets.art(book.cover, { kind: 'wide' }),
              h('p', {}, h('span', { class: 'clear-book-tag', text: T.bookGot }), h('strong', { text: book.title }), h('span', { text: book.theme || '' })),
            )
          : null,
      ),
      h('div', { class: 'stamp', 'aria-hidden': 'true' }, h('span', { text: T.cleared })),
    );
    const wrap = h('div', { class: 'chapter chapter--clear' }, card, h('div', { class: 'cine-actions' }, back));
    layer.replaceChildren(wrap);
    sfx?.play('clear');
    back.focus({ preventScroll: true });
    return () => wrap.remove();
  });
}
