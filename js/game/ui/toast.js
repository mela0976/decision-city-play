import { h } from '../dom.js';

export function createToasts(root) {
  return function toast(text, { tone = 'plain', ms = 2800 } = {}) {
    const item = h('p', { class: `toast toast--${tone}`, text });
    root.append(item);
    while (root.children.length > 3) root.firstElementChild.remove();
    setTimeout(() => item.remove(), ms);
  };
}
