// 語言切換：中文／English／日本語，各用自己的寫法。按下去記住偏好並重新載入（lang.js）。

import { h } from '../dom.js?v=1b0868ba';
import { T, LANG } from '../strings.js?v=1b0868ba';
import { LANGS, HTML_LANG, LANG_SHORT, switchLang } from '../lang.js?v=1b0868ba';

// 全名包在 .lang-name 裡；標題右上角太窄時 CSS 改顯示 data-short 的短寫，讀屏照樣念全名（aria-label）
export function langButtons() {
  return LANGS.map((code) =>
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn--small lang-btn',
        lang: HTML_LANG[code],
        'aria-label': T.langNames[code],
        'aria-pressed': String(code === LANG),
        dataset: { lang: code, short: LANG_SHORT[code] },
        onClick: () => {
          if (code !== LANG) switchLang(code);
        },
      },
      h('span', { class: 'lang-name', text: T.langNames[code] }),
    ),
  );
}

/** 標題畫面右上角的一排。 */
export const langSwitch = () => h('nav', { class: 'lang-switch', 'aria-label': T.language }, langButtons());

/** 選單裡的一組（和聲音設定同一種外框）。 */
export const langControls = () => h('fieldset', { class: 'menu-lang' }, h('legend', { text: T.language }), h('div', { class: 'lang-row' }, langButtons()));
