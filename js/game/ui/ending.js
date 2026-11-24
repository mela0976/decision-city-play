// 結局與成績單：結局圖、蓋章的等第；成績單是一張單據（欄位、騎縫線、等寬數字），列四項數值、任務數、問答正確率、提案頁數。

import { h } from '../dom.js?v=b7b57ceb';
import { T, METER_IDS, METER_NAMES } from '../strings.js?v=b7b57ceb';

export function showEnding({ screen, assets, ending, stamp, meters, missionsDone, missionsTotal, quiz, books, ownedYears, extraPages = 0, side = null, role, coffees = 0, note, onAgain, onShare = null, sfx }) {
  const rate = quiz.asked > 0 ? `${Math.round((quiz.right / quiz.asked) * 100)}%` : '—';
  const again = h('button', { type: 'button', class: 'btn btn--primary btn--big', id: 'ending-again', 'data-primary': true, text: T.playAgain });
  again.addEventListener('click', () => {
    sfx?.play('select');
    onAgain();
  });

  // 分享成果：產生一張分享圖（有檔案分享就用系統分享，沒有就下載並複製網址）
  const share = onShare ? h('button', { type: 'button', class: 'btn btn--big', id: 'ending-share', text: T.share.button }) : null;
  share?.addEventListener('click', async () => {
    sfx?.play('select');
    share.disabled = true;
    try {
      await onShare();
    } finally {
      share.disabled = false;
    }
  });

  const root = h(
    'section',
    { class: 'ending', dataset: { ending: ending.id || '' }, 'aria-labelledby': 'ending-title' },
    h(
      'div',
      { class: 'ending-story' },
      assets.art(ending.image, { kind: 'wide', className: 'ending-art' }),
      h('div', { class: `stamp stamp--grade${[...String(stamp)].length > 2 ? ' stamp--long' : ''}`, 'aria-hidden': 'true' }, h('span', { text: stamp })),
      h('h2', { id: 'ending-title', text: ending.title || '' }),
      h('p', { class: 'ending-text', text: ending.text || '' }),
      note ? h('p', { class: 'ending-note', text: note }) : null,
    ),
    h(
      'div',
      { class: 'report ticket' },
      h('header', { class: 'ticket-stub' }, h('span', { class: 'ticket-kind', text: T.reportSlip }), role ? h('span', { class: 'report-role', text: role }) : null),
      h(
        'ul',
        { class: 'report-meters' },
        METER_IDS.map((id) =>
          h(
            'li',
            { dataset: { meter: id } },
            h('span', { class: 'm-name', text: METER_NAMES[id] }),
            h('span', { class: 'm-bar', 'aria-hidden': 'true' }, h('i', { vars: { '--v': String(meters[id] ?? 0) } })),
            h('b', { class: 'm-num', text: String(meters[id] ?? 0) }),
          ),
        ),
      ),
      h(
        'dl',
        { class: 'report-facts' },
        h('div', {}, h('dt', { text: T.reportMissions }), h('dd', { id: 'report-missions', text: `${missionsDone}／${missionsTotal}` })),
        h('div', {}, h('dt', { text: T.reportQuiz }), h('dd', { id: 'report-quiz', text: rate })),
        h('div', {}, h('dt', { text: T.reportBooks }), h('dd', { id: 'report-books', text: `${ownedYears.length + extraPages}／${books.length + extraPages}` })),
        coffees > 0 ? h('div', {}, h('dt', { text: T.burnout.fact }), h('dd', { id: 'report-coffees', text: String(coffees) })) : null,
      ),
      // 支線：完成幾個、書裡的章節讀了幾章
      side ? h('p', { class: 'report-side', id: 'report-side' }, h('span', { text: T.reportSide }), h('b', { text: `${side.sidesDone}／${side.sidesTotal}` }), h('span', { text: T.reportChapters }), h('b', { text: `${side.read}／${side.total}` })) : null,
      h(
        'ol',
        { class: 'report-books', 'aria-label': T.reportBooks },
        books.map((book) => {
          const owned = ownedYears.includes(book.year);
          return h('li', { class: owned ? 'is-owned' : 'is-locked', 'aria-label': owned ? `${book.year} ${book.title}` : `${book.year} ${T.blankPage}` }, h('span', { 'aria-hidden': 'true', text: String(book.year) }));
        }),
      ),
      h('div', { class: 'report-actions' }, share, again),
    ),
  );

  screen.replaceChildren(root);
  again.focus({ preventScroll: true });
  return { destroy: () => root.remove() };
}
