// 語言切換：中文／English／日本語，各用自己的寫法。按下去記住偏好並重新載入（lang.js）。

import { h } from '../dom.js?v=eb4dc5b';
import { T, LANG } from '../strings.js?v=eb4dc5b';
import { LANGS, HTML_LANG, switchLang } from '../lang.js?v=eb4dc5b';

export function langButtons() {
  return LANGS.map((code) =>
    h('button', {
      type: 'button',
      class: 'btn btn--small lang-btn',
      lang: HTML_LANG[code],
      'aria-pressed': String(code === LANG),
      dataset: { lang: code },
      text: T.langNames[code],
      onClick: () => {
        if (code !== LANG) switchLang(code);
      },
    }),
  );
}

/** 標題畫面右上角的一排。 */
export const langSwitch = () => h('nav', { class: 'lang-switch', 'aria-label': T.language }, langButtons());

/** 選單裡的一組（和聲音設定同一種外框）。 */
export const langControls = () => h('fieldset', { class: 'menu-lang' }, h('legend', { text: T.language }), h('div', { class: 'lang-row' }, langButtons()));
