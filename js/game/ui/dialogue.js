// 任務對話：過場劇照上的字幕。說話者名字小字在上、台詞置中在畫面底部。
// 逐字顯示；按一次快轉到整句，再按一次到下一句。點畫面任何地方也可以。
// extra 可帶一顆職能專屬的按鈕（例如業務 AE 的安撫客戶），一場對話只能用一次。
// voice 有的話每句字幕出現時播對應的語音：第一下快轉只把字顯示完、語音繼續；第二下才跳下一句並停掉語音。

import { h, interaction, reducedMotion, arrowFocus } from '../dom.js?v=96676fd2';
import { T } from '../strings.js?v=96676fd2';

const CHAR_MS = 26;

export function runDialogue({ layer, lines, speakerOf, assets, extra, signal, sfx, onLine, voice }) {
  return interaction(signal, (done) => {
    let index = 0;
    let typing = 0;
    let shown = 0;
    let full = '';
    let speaking = null;

    const face = h('span', { class: 'sub-face', hidden: true });
    const name = h('strong', { class: 'sub-name' });
    const role = h('span', { class: 'sub-role' });
    const srText = h('span', { class: 'sr-only' });
    // 整句先排好版、還沒輪到的字只是看不見，置中的字幕才不會邊打邊跳。
    const typed = h('span', { 'aria-hidden': 'true' });
    const rest = h('span', { class: 'sub-rest', 'aria-hidden': 'true' });
    const text = h('p', { class: 'sub-text' }, srText, typed, rest);
    const nextBtn = h('button', { type: 'button', class: 'btn btn--primary', id: 'dlg-next', 'data-primary': true });
    const extraBtn = extra ? h('button', { type: 'button', class: 'btn btn--perk', id: 'dlg-perk', text: extra.label }) : null;

    const box = h(
      'section',
      { class: 'dlg', 'aria-label': T.a11yDialogue },
      h('div', { class: 'sub' }, h('header', { class: 'sub-who' }, face, name, role), text),
      h('div', { class: 'cine-actions' }, extraBtn, nextBtn),
    );

    arrowFocus(box, () => [extraBtn, nextBtn].filter(Boolean));

    const finishTyping = () => {
      clearInterval(typing);
      typing = 0;
      shown = full.length;
      typed.textContent = full;
      rest.textContent = '';
      nextBtn.textContent = T.next;
      box.classList.remove('is-typing');
    };

    const showLine = () => {
      const line = lines[index];
      const who = speakerOf(line.who);
      full = line.text;
      // 說話者的小頭像；清單裡沒有就只顯示名字
      face.hidden = !(who.avatar && assets);
      if (face.dataset.key !== (who.avatar || '')) {
        face.dataset.key = who.avatar || '';
        face.replaceChildren(...(face.hidden ? [] : [h('span', { class: 'avatar' }, assets.art(who.avatar, { kind: 'square' }))]));
      }
      name.textContent = who.name;
      role.textContent = who.title || '';
      box.dataset.side = who.isPlayer ? 'player' : 'npc';
      srText.textContent = full;
      onLine?.(who);
      speaking = voice?.play(line.who, full) || null;
      if (lines[index + 1]) voice?.preload?.(lines[index + 1].who, lines[index + 1].text);
      if (reducedMotion()) {
        finishTyping();
        return;
      }
      shown = 0;
      typed.textContent = '';
      rest.textContent = full;
      nextBtn.textContent = T.fastForward;
      box.classList.add('is-typing');
      typing = setInterval(() => {
        shown += 1;
        typed.textContent = full.slice(0, shown);
        rest.textContent = full.slice(shown);
        if (shown >= full.length) finishTyping();
      }, CHAR_MS);
    };

    const advance = () => {
      if (typing) {
        finishTyping();
        return;
      }
      sfx?.play('select');
      speaking?.stop();
      speaking = null;
      index += 1;
      if (index >= lines.length) {
        done();
        return;
      }
      showLine();
    };

    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      advance();
    });
    box.addEventListener('click', (e) => {
      if (e.target instanceof HTMLElement && e.target.closest('button')) return;
      advance();
    });
    extraBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      extraBtn.disabled = true;
      extra.onUse();
      nextBtn.focus({ preventScroll: true });
    });

    layer.replaceChildren(box);
    if (lines.length === 0) {
      queueMicrotask(done);
    } else {
      showLine();
      nextBtn.focus({ preventScroll: true });
    }

    return () => {
      clearInterval(typing);
      speaking?.stop();
      box.remove();
    };
  });
}
