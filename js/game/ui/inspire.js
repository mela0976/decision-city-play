// 靈感指針：HUD 右上（選單鈕下面）一顆小牌子，發光的 ✦ 加一支箭頭指向最近的靈感、距離，以及撿到幾個。
// 箭頭以玩家朝向為準（往上＝正前方），手機與鍵盤一樣，不需要點它。

import { h } from '../dom.js?v=1448599f';
import { T } from '../strings.js?v=1448599f';

export function createInspireChip(root) {
  const arrow = h('span', { class: 'inspire-arrow', 'aria-hidden': 'true', text: '➤' });
  const dist = h('span', { class: 'inspire-dist' });
  const count = h('b', { class: 'inspire-count' });
  const chip = h('div', { class: 'inspire-chip', id: 'hud-inspire', hidden: true, role: 'img' }, h('span', { class: 'inspire-spark', 'aria-hidden': 'true', text: '✦' }), count, arrow, dist);
  root.append(chip);
  let last = '';
  return {
    el: chip,
    /** near：{ meters, angle } 或 null；auto：自動前往中（撿不到，牌子變暗）。 */
    update({ visible, got, total, near, auto }) {
      chip.hidden = !visible;
      if (!visible) return;
      const deg = near ? Math.round((near.angle * 180) / Math.PI) : 0;
      chip.classList.toggle('is-near', !!near && near.meters <= 40 && !auto);
      chip.classList.toggle('is-auto', !!auto);
      chip.classList.toggle('has-target', !!near);
      arrow.style.setProperty('--turn', `${deg + -90}deg`);
      const key = `${got}/${total}|${near ? near.meters : '-'}|${auto}`;
      if (key === last) return;
      last = key;
      count.textContent = `${got}／${total}`;
      dist.textContent = near ? `${near.meters} m` : '';
      chip.setAttribute('aria-label', near ? T.inspire.a11y(got, total, near.meters) : T.inspire.count(got, total));
      chip.title = auto ? T.inspire.autoMiss : T.inspire.name;
    },
    pop() {
      chip.classList.remove('is-pop');
      void chip.offsetWidth;
      chip.classList.add('is-pop');
    },
  };
}
