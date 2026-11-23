// 標題畫面：主視覺滿版，標誌是一支直式霓虹招牌；開始／繼續／年鑑。
// 輸入阿嬤代碼（grandma.json 的 unlock.titleCode）或連點標誌七下會呼叫 onSecret。

import { h, arrowFocus } from '../dom.js?v=7c27097e';
import { T, ZH_T } from '../strings.js?v=7c27097e';
import { langSwitch } from './lang-switch.js?v=7c27097e';

const TAPS_NEEDED = 7;
const TAP_WINDOW_MS = 4000;

export function showTitle({ screen, assets, canContinue, continueNote, grandmaOn, secretCode, badge, error, onStart, onContinue, onProposal, onYears = null, onSecret, onRetry, onFixtures }) {
  // 霓虹招牌是街景的一部分，各語言都掛中文原名；讀屏念目前語言的名字
  const signs = [...ZH_T.name].map((ch, i) => h('span', { class: `sign sign--${i + 1}`, 'aria-hidden': 'true', text: ch }));
  const logo = h('h1', { class: 'logo', 'aria-label': T.name }, signs, h('span', { class: 'logo-en', 'aria-hidden': 'true', text: T.nameEn }));

  let actions;
  if (error) {
    actions = h(
      'div',
      { class: 'title-actions' },
      h('p', { class: 'title-error', role: 'alert' }, h('strong', { text: T.contentFailed }), h('span', { text: error })),
      h('button', { type: 'button', class: 'btn btn--primary', 'data-primary': true, onClick: onRetry, text: T.retryContent }),
      h('button', { type: 'button', class: 'btn', onClick: onFixtures, text: T.useFixtures }),
    );
  } else {
    actions = h(
      'nav',
      { class: 'title-actions', 'aria-label': T.menu },
      // 有存檔時動作鍵是「繼續」，免得一按就把進度蓋掉
      h('button', { type: 'button', class: `btn btn--big${canContinue ? '' : ' btn--primary'}`, id: 'title-start', 'data-primary': !canContinue, onClick: onStart, text: T.start }),
      // 「繼續」上直接寫出會回到誰、幾點，按下去之前就知道會發生什麼
      h(
        'button',
        { type: 'button', class: `btn btn--big${canContinue ? ' btn--primary' : ''}`, id: 'title-continue', 'data-primary': canContinue, disabled: !canContinue, onClick: onContinue },
        h('span', { text: T.resume }),
        canContinue && continueNote ? h('small', { class: 'btn-note', text: continueNote }) : null,
      ),
      h('button', { type: 'button', class: 'btn btn--big', id: 'title-proposal', onClick: onProposal, text: T.proposal }),
      // 破關過一次才出現：挑一年單獨重玩、補支線
      onYears ? h('button', { type: 'button', class: 'btn btn--big', id: 'title-years', onClick: onYears, text: T.replay.button }) : null,
    );
  }

  arrowFocus(actions, () => [...actions.querySelectorAll('button:not([disabled])')]);

  const root = h(
    'section',
    { class: `title${grandmaOn ? ' is-grandma' : ''}` },
    assets.art('title_key', { kind: 'cover', className: 'title-art' }),
    h('div', { class: 'title-scrim', 'aria-hidden': 'true' }),
    h('div', { class: 'title-main' }, logo, h('p', { class: 'title-hook', text: T.hook })),
    actions,
    badge ? h('p', { class: 'title-badge', text: badge }) : null,
    langSwitch(),
  );

  let taps = [];
  const onLogoTap = () => {
    if (!onSecret) return;
    const now = performance.now();
    taps = taps.filter((t) => now - t < TAP_WINDOW_MS);
    taps.push(now);
    logo.classList.remove('is-tapped');
    void logo.offsetWidth;
    logo.classList.add('is-tapped');
    if (taps.length >= TAPS_NEEDED) {
      taps = [];
      onSecret('taps');
    }
  };
  logo.addEventListener('click', onLogoTap);

  let typed = '';
  const code = String(secretCode || '').toUpperCase();
  const onKey = (e) => {
    if (!code || !onSecret || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    typed = (typed + e.key.toUpperCase()).slice(-code.length);
    if (typed === code) {
      typed = '';
      onSecret('code');
    }
  };
  window.addEventListener('keydown', onKey);

  screen.replaceChildren(root);
  root.querySelector('[data-primary]')?.focus({ preventScroll: true });

  return {
    setGrandma(on) {
      root.classList.toggle('is-grandma', on);
    },
    destroy() {
      window.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
