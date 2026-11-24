// 選角：一排職能卡（立繪、職稱、一句話、起始數值），選中的那張在下方攤開介紹與專屬加成。
// 寬螢幕六張並排；直向或窄螢幕改成可左右滑動的卡片，滑到中間那張就是選中的。
// 鍵盤：左右鍵換人，動作鍵（空白鍵、Enter、E）確認。

import { h, fill, reducedMotion } from '../dom.js?v=c7fd08ae';
import { T, METER_IDS, METER_NAMES } from '../strings.js?v=c7fd08ae';

export function showRoleSelect({ screen, assets, roles, onPick, onBack, sfx }) {
  let selected = roles[0];
  let settle = 0;
  let ignoreScrollUntil = 0;

  const detail = h('div', { class: 'role-detail', 'aria-live': 'polite' });
  const confirm = h('button', { type: 'button', class: 'btn btn--primary btn--big', id: 'role-confirm', 'data-primary': true });
  confirm.addEventListener('click', () => onPick(selected));

  const cards = roles.map((role) => {
    const meters = h(
      'ul',
      { class: 'role-meters' },
      METER_IDS.map((id) =>
        h(
          'li',
          { dataset: { meter: id } },
          h('span', { text: METER_NAMES[id] }),
          h('span', { class: 'm-bar', 'aria-hidden': 'true' }, h('i', { vars: { '--v': String(role.start?.[id] ?? 0) } })),
          h('b', { text: String(role.start?.[id] ?? 0) }),
        ),
      ),
    );
    const card = h(
      'button',
      { type: 'button', class: 'role-card', dataset: { role: role.id }, 'aria-pressed': 'false' },
      assets.art(role.portrait, { kind: 'portrait' }),
      h('strong', { class: 'role-title', text: role.title }),
      h('span', { class: 'role-tagline', text: role.tagline || '' }),
      meters,
    );
    card.addEventListener('click', () => {
      sfx?.play('select');
      select(role, { reveal: true });
      confirm.focus({ preventScroll: true });
    });
    return card;
  });
  const row = h('div', { class: 'roles-row', vars: { '--n': String(roles.length) } }, cards);

  function select(role, { reveal = false } = {}) {
    selected = role;
    for (const card of cards) card.setAttribute('aria-pressed', String(card.dataset.role === role.id));
    fill(
      detail,
      h('p', { class: 'role-team', text: role.team || '' }),
      h('p', { class: 'role-intro', text: role.intro || '' }),
      role.perk ? h('p', { class: 'role-perk' }, h('strong', { text: role.perk.name || '' }), h('span', { text: role.perk.desc || '' })) : null,
    );
    confirm.textContent = T.confirmRole(role.title);
    if (reveal && row.scrollWidth > row.clientWidth + 4) {
      ignoreScrollUntil = performance.now() + 700;
      cards[roles.indexOf(role)]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  // 滑動停下來時，選中最靠近中間的那張。
  row.addEventListener('scroll', () => {
    if (performance.now() < ignoreScrollUntil) return;
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (row.scrollWidth <= row.clientWidth + 4) return;
      const box = row.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      let best = null;
      for (const card of cards) {
        const r = card.getBoundingClientRect();
        const gap = Math.abs(r.left + r.width / 2 - middle);
        if (!best || gap < best.gap) best = { gap, card };
      }
      const role = roles.find((x) => x.id === best?.card.dataset.role);
      if (role && role !== selected) select(role);
    }, 120);
  });

  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea, dialog')) return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const next = roles[(roles.indexOf(selected) + step + roles.length) % roles.length];
    sfx?.play('select');
    select(next, { reveal: true });
  };
  window.addEventListener('keydown', onKey);

  const root = h(
    'section',
    { class: 'roles', 'aria-labelledby': 'roles-title' },
    h('header', { class: 'roles-head' }, h('h2', { id: 'roles-title', text: T.pickRole }), h('button', { type: 'button', class: 'btn btn--small', onClick: onBack, text: T.backToTitle })),
    row,
    h('footer', { class: 'roles-foot' }, detail, confirm),
  );

  select(selected);
  screen.replaceChildren(root);
  confirm.focus({ preventScroll: true });

  return {
    destroy() {
      clearTimeout(settle);
      window.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
