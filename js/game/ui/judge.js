// 2026 評審速覽：評審先看這一頁。上面是 2026 那本書的書名、主旨與三個重點，兩個動作（直接玩 2026、九年年鑑全部攤開）；
// 下面是整本書的目錄：依書的頁序分 Intro／People／Model／AI 四段，每篇一列寫頁碼、篇名、作者、一句摘要、在遊戲裡的哪一關。
// 摘要預設兩行，點篇名展開全文。

import { h, fill, arrowFocus } from '../dom.js?v=3b7de7a7';
import { T } from '../strings.js?v=3b7de7a7';

const SECTIONS = ['Intro', 'People', 'Model', 'AI'];

/**
 * book：books.json 的 2026 那一筆（已換成目前語言）。
 * chapters：[{ id, title, summary, section, page, authors: [{ name, role }], where: { main, title } }]
 */
export function openJudge({ dialog, book, chapters, canPlay = true, onPlay, onYearbook }) {
  const close = h('button', { type: 'button', class: 'btn btn--small', text: T.close, onClick: () => dialog.close() });
  const play = canPlay ? h('button', { type: 'button', class: 'btn btn--primary', id: 'judge-play', onClick: onPlay, text: T.judge.play }) : null;
  const yearbook = h('button', { type: 'button', class: 'btn', id: 'judge-yearbook', onClick: onYearbook, text: T.judge.yearbook });

  const hero = h(
    'section',
    { class: 'judge-hero' },
    h('p', { class: 'judge-book' }, h('span', { class: 'lightbox', text: String(book?.year || 2026) }), h('span', { text: [book?.title, book?.subtitle].filter(Boolean).join('｜') })),
    book?.theme ? h('p', { class: 'judge-theme', text: book.theme }) : null,
    book?.keyPoints?.length ? h('ul', { class: 'judge-points' }, book.keyPoints.map((point) => h('li', { text: point }))) : null,
    h('div', { class: 'judge-actions' }, play, yearbook),
  );

  const row = (chapter) => {
    const toggle = h('button', { type: 'button', class: 'judge-title', 'aria-expanded': 'false', text: chapter.title });
    const item = h(
      'li',
      { class: 'judge-row', dataset: { chapter: chapter.id } },
      h('span', { class: 'judge-page', text: String(chapter.page ?? '') }),
      h(
        'div',
        { class: 'judge-text' },
        h('h4', {}, toggle),
        chapter.authors?.length ? h('p', { class: 'judge-authors' }, chapter.authors.map((a) => h('span', {}, h('strong', { text: a.name }), a.role ? ` ${a.role}` : ''))) : null,
        h('p', { class: 'judge-summary', text: chapter.summary || '' }),
        chapter.where ? h('span', { class: `judge-where${chapter.where.main ? ' is-main' : ''}` }, h('b', { text: chapter.where.main ? T.mainTag : T.sideTag }), chapter.where.title) : null,
      ),
    );
    toggle.addEventListener('click', () => {
      const open = item.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    return item;
  };

  const groups = SECTIONS.map((name) => ({ name, items: chapters.filter((c) => c.section === name).sort((a, b) => (a.page ?? 0) - (b.page ?? 0)) })).filter((g) => g.items.length);
  const toc = h(
    'div',
    { class: 'judge-toc' },
    groups.map((g) => h('section', { class: 'judge-section', dataset: { section: g.name } }, h('h3', {}, g.name, h('span', { class: 'judge-count', text: String(g.items.length) })), h('ol', { class: 'judge-list' }, g.items.map(row)))),
  );

  const head = h('header', { class: 'sheet-head' }, h('h2', { id: 'judge-title', text: T.judge.button }), close);
  fill(dialog, head, h('div', { class: 'ironwork', 'aria-hidden': 'true' }), hero, toc);
  if (!dialog.dataset.judgeArrows) {
    dialog.dataset.judgeArrows = '1';
    arrowFocus(dialog, () => [...dialog.querySelectorAll('.sheet-head .btn, .judge-actions .btn, .judge-title')]);
  }
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  (play || yearbook).focus({ preventScroll: true });
}
