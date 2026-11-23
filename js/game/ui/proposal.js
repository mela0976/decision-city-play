// 「今晚的提案」：每過一關拿到一頁。每頁是那一年的一句答案（slide 標題）、年鑑的三個重點與一句話；
// 還沒拿到的是空白頁。阿嬤線累積夠了，最後多一頁阿嬤的那一句。

import { h, fill, arrowFocus } from '../dom.js?v=986dcfc6';
import { T, chapterQuote } from '../strings.js?v=986dcfc6';

/**
 * pages：[{ no, year, title, points, quote, source, owned, grandma }]
 */
// 英日版：書名與章節名是譯名，頁尾註明一行（中文版是空字串，不顯示）
const translatedNote = () => (T.translatedNote ? h('p', { class: 'translated-note', text: T.translatedNote }) : null);

export function openProposal({ dialog, pages, appendix = [], inspirations = [] }) {
  const body = h('div', { class: 'proposal-body' });
  const close = h('button', { type: 'button', class: 'btn btn--small', text: T.close, onClick: () => dialog.close() });
  const owned = pages.filter((page) => page.owned).length;

  const thumb = (page) => {
    const label = page.grandma ? T.grandmaPage : T.pageNo(page.no);
    if (!page.owned) {
      return h('li', { class: 'page page--blank', 'aria-label': `${label}　${T.blankPage}` }, h('span', { class: 'page-no', 'aria-hidden': 'true', text: String(page.no).padStart(2, '0') }), h('span', { class: 'page-blank', 'aria-hidden': 'true', text: T.blankPage }));
    }
    const open = h(
      'button',
      { type: 'button', class: `page page--owned${page.grandma ? ' page--grandma' : ''}`, dataset: { page: String(page.no) } },
      h('span', { class: 'page-no', text: String(page.no).padStart(2, '0') }),
      page.year ? h('span', { class: 'lightbox lightbox--small', text: String(page.year) }) : null,
      h('strong', { class: 'page-title', text: page.title || label }),
    );
    open.addEventListener('click', () => showPage(page));
    return h('li', {}, open);
  };

  arrowFocus(body, () => [...body.querySelectorAll('.page--owned, .slide-nav button')]);

  const showGrid = (focusNo) => {
    fill(
      body,
      h('ol', { class: 'proposal-grid' }, pages.map(thumb)),
      // 附錄：做完的支線各留一張章節卡，多了就在面板裡往下捲
      appendix.length
        ? h(
            'section',
            { class: 'appendix', 'aria-labelledby': 'appendix-title' },
            h('h3', { id: 'appendix-title' }, T.appendixTitle, h('span', { class: 'appendix-count', text: String(appendix.length) })),
            h(
              'ol',
              { class: 'appendix-list' },
              appendix.map((card) => h('li', { class: 'appendix-card', dataset: { side: card.id } }, h('span', { class: 'lightbox lightbox--small', text: String(card.year) }), h('strong', { text: card.title }), h('p', { text: card.text }), card.chapters.map((title) => h('span', { class: 'side-chapter', text: chapterQuote(title) })))),
            ),
          )
        : null,
      // 沿路撿到的靈感：自己騎車經過才撿得到，一個一行
      inspirations.length
        ? h(
            'section',
            { class: 'appendix appendix--inspire', 'aria-labelledby': 'inspire-title' },
            h('h3', { id: 'inspire-title' }, T.inspire.appendix, h('span', { class: 'appendix-count', text: String(inspirations.length) })),
            h('ol', { class: 'inspire-list' }, inspirations.map((line) => h('li', { text: line }))),
          )
        : null,
      translatedNote(),
    );
    const target = focusNo ? body.querySelector(`[data-page="${focusNo}"]`) : body.querySelector('.page--owned');
    (target || close).focus({ preventScroll: true });
  };

  const showPage = (page) => {
    const ownedPages = pages.filter((p) => p.owned);
    const at = ownedPages.indexOf(page);
    const back = h('button', { type: 'button', class: 'btn btn--small', text: T.backToList, onClick: () => showGrid(page.no) });
    const prev = h('button', { type: 'button', class: 'btn btn--small', text: T.prevPage, disabled: at <= 0, onClick: () => showPage(ownedPages[at - 1]) });
    const next = h('button', { type: 'button', class: 'btn btn--small', text: T.nextPage, disabled: at >= ownedPages.length - 1, onClick: () => showPage(ownedPages[at + 1]) });
    fill(
      body,
      h(
        'article',
        { class: `slide${page.grandma ? ' slide--grandma' : ''}`, 'aria-labelledby': 'slide-page-title' },
        h('header', { class: 'slide-head' }, h('span', { class: 'page-no', text: String(page.no).padStart(2, '0') }), page.year ? h('span', { class: 'lightbox', text: String(page.year) }) : null, page.source ? h('span', { class: 'slide-source', text: page.source }) : null),
        h('h3', { id: 'slide-page-title', text: page.title || '' }),
        page.points?.length ? h('ul', { class: 'slide-points' }, page.points.map((point) => h('li', { text: point }))) : null,
        page.quote ? h('blockquote', { class: 'slide-quote', text: page.quote }) : null,
      ),
      page.source ? translatedNote() : null,
      h('div', { class: 'slide-nav' }, back, prev, next),
    );
    (at < ownedPages.length - 1 ? next : back).focus({ preventScroll: true });
  };

  const head = h('header', { class: 'sheet-head' }, h('h2', { id: 'proposal-title', text: `${T.proposalTitle}　${owned}／${pages.length}` }), close);
  arrowFocus(head, () => [close, ...body.querySelectorAll('.page--owned, .slide-nav button')]);
  fill(dialog, head, h('div', { class: 'ironwork', 'aria-hidden': 'true' }), body);
  if (!dialog.open) dialog.showModal();
  showGrid();
}
