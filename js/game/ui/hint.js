// 下方提示列：永遠在畫面底部置中。左段是現在要做什麼，右段是現在能按什麼；按鍵名稱用小鍵帽。

import { h, fill } from '../dom.js';

export function createHint({ root, stage }) {
  const taskEl = root.querySelector('#hint-task');
  const keysEl = root.querySelector('#hint-keys');
  let enabled = true;
  let last = '';
  let flashTimer = 0;

  const render = ({ task, parts }) => {
    const signature = JSON.stringify([task, parts]);
    if (signature === last) return;
    last = signature;
    taskEl.textContent = task || '';
    taskEl.hidden = !task;
    const nodes = [];
    parts.forEach((item, i) => {
      if (i > 0) nodes.push(h('span', { class: 'hint-sep', 'aria-hidden': 'true', text: '·' }));
      nodes.push(h('span', { class: 'hint-part' }, item.keys.map((key) => h('kbd', { text: key })), item.text ? h('span', { text: item.text }) : null));
    });
    fill(keysEl, nodes);
    root.hidden = !enabled || (!task && parts.length === 0);
  };

  const applyEnabled = () => {
    stage.dataset.hint = enabled ? 'on' : 'off';
    if (!enabled) root.hidden = true;
    else {
      const keep = last;
      last = '';
      if (keep) {
        const [task, parts] = JSON.parse(keep);
        render({ task, parts });
      }
    }
  };
  applyEnabled();

  return {
    set: render,
    /** 短暫放大閃一下，提醒玩家往下看。 */
    flash(ms = 2600) {
      clearTimeout(flashTimer);
      root.classList.remove('is-flash');
      void root.offsetWidth;
      root.classList.add('is-flash');
      flashTimer = setTimeout(() => root.classList.remove('is-flash'), ms);
    },
    get enabled() {
      return enabled;
    },
    setEnabled(flag) {
      enabled = !!flag;
      applyEnabled();
    },
  };
}
