import { h } from '../dom.js?v=c1d6a75d';

/** art：一塊插畫（assets.art 的結果），有的話做成一張小卡，插畫當背景。title：小卡上的地名。 */
export function createToasts(root) {
  return function toast(text, { tone = 'plain', ms = 2800, art = null, title = '' } = {}) {
    const item = art
      ? h('div', { class: `toast toast--${tone} toast--place` }, art, h('p', {}, title ? h('strong', { class: 'sign-plate', text: title }) : null, h('span', { text })))
      : h('p', { class: `toast toast--${tone}`, text });
    root.append(item);
    while (root.children.length > 3) root.firstElementChild.remove();
    setTimeout(() => item.remove(), ms);
  };
}
