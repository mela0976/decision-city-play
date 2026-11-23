// 手機裡的「支線任務」：按年份分組的清單。最上面是整體進度（章節已讀 n／總數）與每年的進度。
// 每個支線：標題、地點、出題者、對應的書中章節、狀態（未開放／可做／完成）；可做的可以設為導航目標。

import { h, fill, arrowFocus } from '../dom.js?v=9b45bc39';
import { T, chapterQuote } from '../strings.js?v=9b45bc39';

export function openSideList({ dialog, groups, progress, target, onNavigate, onClear }) {
  const close = h('button', { type: 'button', class: 'btn btn--small', text: T.close, onClick: () => dialog.close() });
  const years = h(
    'ol',
    { class: 'side-years', 'aria-label': T.sideYearProgress },
    groups.map((group) =>
      h('li', { class: group.open ? 'is-open' : 'is-locked' }, h('span', { class: 'lightbox lightbox--small', text: String(group.year) }), h('b', { text: `${group.read}／${group.total}` }), h('span', { class: 'm-bar', 'aria-hidden': 'true' }, h('i', { vars: { '--v': String(group.total ? Math.round((group.read / group.total) * 100) : 0) } }))),
    ),
  );
  const firstOpen = groups.find((group) => group.open && group.items.some((item) => item.status === 'open'));
  const sections = groups.map((group) => {
    const rows = group.items.map((item) => {
      const isTarget = item.id === target;
      const action =
        item.status === 'open'
          ? h('button', {
              type: 'button',
              class: `btn btn--small side-go${isTarget ? ' is-on' : ''}`,
              dataset: { side: item.id },
              'aria-pressed': String(isTarget),
              text: isTarget ? T.sideNavOn : T.sideNav,
              onClick: () => {
                dialog.close();
                if (isTarget) onClear?.();
                else onNavigate?.(item.id);
              },
            })
          : null;
      return h(
        'li',
        { class: `side-row side-row--${item.status}`, dataset: { side: item.id } },
        h('div', { class: 'side-main' }, h('strong', { text: item.status === 'locked' ? T.sideLockedTitle : item.title }), h('span', { class: 'side-meta', text: [item.place, item.giver].filter(Boolean).join('　') }), item.chapters.map((title) => h('span', { class: 'side-chapter', text: chapterQuote(title) }))),
        h('div', { class: 'side-side' }, h('span', { class: `side-state side-state--${item.status}`, text: T.sideStatus[item.status] }), action),
      );
    });
    return h(
      'details',
      { class: 'side-year', open: group === firstOpen || (!firstOpen && group === groups[0]) },
      h('summary', {}, h('span', { class: 'lightbox lightbox--small', text: String(group.year) }), h('span', { class: 'side-year-count', text: T.sideYearCount(group.sidesDone, group.sidesTotal) }), h('span', { class: `side-state side-state--${group.open ? 'open' : 'locked'}`, text: group.open ? T.sideYearOpen : T.sideYearLocked })),
      h('ol', { class: 'side-rows' }, rows),
    );
  });
  fill(
    dialog,
    h('header', { class: 'sheet-head' }, h('h2', { id: 'sidelist-title', text: T.sideTitle }), close),
    h('div', { class: 'ironwork', 'aria-hidden': 'true' }),
    h('p', { class: 'side-progress', id: 'side-progress' }, h('span', { text: T.chaptersRead }), h('b', { text: `${progress.read}／${progress.total}` }), h('span', { text: T.sideDone }), h('b', { text: `${progress.sidesDone}／${progress.sidesTotal}` })),
    years,
    h('div', { class: 'side-body' }, sections),
  );
  if (!dialog.dataset.sideArrows) {
    dialog.dataset.sideArrows = '1';
    arrowFocus(dialog, () => [...dialog.querySelectorAll('.sheet-head button, summary, .side-go')]);
    dialog.addEventListener('focusin', (e) => e.target.scrollIntoView?.({ block: 'nearest' }));
  }
  if (!dialog.open) dialog.showModal();
  (dialog.querySelector('.side-go') || close).focus({ preventScroll: true });
}
