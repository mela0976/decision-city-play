// 操作手冊：選單裡的一頁，列出按鍵、觸控與一天的流程。內容在語言檔的 T.manual。

import { h, fill } from '../dom.js?v=441539d';
import { T } from '../strings.js?v=441539d';

export function openManual({ dialog, onClose, onReplay = null }) {
  const close = h('button', { type: 'button', class: 'btn btn--primary manual-close', text: T.manual.close });
  close.addEventListener('click', () => dialog.close());
  const sections = T.manual.sections.map((s) =>
    h('section', { class: 'manual-section' },
      h('h3', { text: s.h }),
      h('dl', { class: 'manual-rows' }, s.rows.flatMap(([key, desc]) => [h('dt', { text: key }), h('dd', { text: desc })])),
    ),
  );
  // 重看互動教學：關掉手冊，回到街上就重新開始那張小清單（只在自由騎乘時給）
  const replay = onReplay ? h('button', { type: 'button', class: 'btn manual-replay', id: 'manual-replay', text: T.coach.replay }) : null;
  replay?.addEventListener('click', () => {
    dialog.close();
    onReplay();
  });
  fill(dialog, h('h2', { id: 'manual-title', text: T.manual.title }), h('div', { class: 'manual-body' }, sections), h('div', { class: 'manual-actions' }, replay, close));
  dialog.addEventListener('close', () => onClose?.(), { once: true });
  if (!dialog.open) dialog.showModal();
  close.focus({ preventScroll: true });
}
