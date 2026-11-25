// 「訊息」：通用的手機聊天介面（頭像、名字、泡泡、已讀）。
// 不取自任何真實通訊軟體：沒有名稱、標誌，泡泡用米灰與深色玻璃，不用任何平台的代表色。
// showMessages 一則一則顯示對方的訊息；最後一則可以帶回覆選項（數字鍵或點選）。
// 有語音時：一般的訊息出現就播；voiceMessage 為真（阿嬤）則做成語音訊息——播放鍵加波形條，點了才播，文字照樣顯示。

import { h, interaction, arrowFocus } from '../dom.js?v=3b7de7a7';
import { T } from '../strings.js?v=3b7de7a7';
import { icon } from './icons.js?v=3b7de7a7';

export function avatarFor(contact, assets) {
  if (contact.portrait) return h('span', { class: 'avatar' }, assets.art(contact.portrait, { kind: 'square' }));
  return h('span', { class: 'avatar avatar--letter', 'aria-hidden': 'true', text: [...(contact.name || '？')][0] });
}

/** 波形條的高度：從文字算出來的固定樣子，每則訊息長得不一樣。 */
function waveform(text, count = 22) {
  let seed = 7;
  for (const ch of String(text)) seed = (seed * 31 + ch.charCodeAt(0)) % 104729;
  return Array.from({ length: count }, (_, i) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return h('i', { vars: { '--h': `${25 + (seed % 70)}%`, '--i': String(i) } });
  });
}

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}`;

/**
 * contact：{ name, title, portrait }；history：先前的訊息（淡色，只有文字）；messages：這次要顯示的幾則。
 * replies：[{ text, … }]，有的話最後一則之後出現選項，回傳選中的那一個。
 * voice：{ info(text) → { sec } 或 null, play(text, { onEnd }) → { stop } }；voiceMessage：做成語音訊息。
 */
export function showMessages({ layer, assets, contact, history = [], messages, replies = null, me = null, signal, sfx, onState, onReply, voice = null, voiceMessage = false }) {
  return interaction(signal, (done) => {
    let index = -1;
    let speaking = null;
    const thread = h('ol', { class: 'phone-thread' });
    const replyBox = h('div', { class: 'phone-replies', hidden: true });
    const nextBtn = h('button', { type: 'button', class: 'btn btn--primary', id: 'phone-next', 'data-primary': true, text: T.next });
    const actions = h('div', { class: 'cine-actions' }, nextBtn);
    const phone = h(
      'section',
      { class: 'phone', 'aria-label': T.messages },
      h(
        'header',
        { class: 'phone-head' },
        avatarFor(contact, assets),
        h('div', { class: 'phone-who' }, h('strong', { text: contact.name || '' }), contact.title ? h('span', { text: contact.title }) : null),
        h('span', { class: 'phone-app', text: T.messages }),
      ),
      thread,
      replyBox,
    );
    const root = h('div', { class: 'phone-wrap' }, phone, actions);

    for (const text of history) thread.append(h('li', { class: 'msg msg--in msg--old' }, h('p', { text })));

    const scrollDown = () => {
      thread.scrollTop = thread.scrollHeight;
    };
    const hush = () => {
      speaking?.stop();
      speaking = null;
      for (const el of thread.querySelectorAll('.voice-msg.is-playing')) el.classList.remove('is-playing');
    };

    /** 語音訊息：播放鍵、波形條、長度，文字放在下面。 */
    const voiceBubble = (text, info) => {
      // 出現就自動播；波形條只是顯示播放進度的裝飾。整顆泡泡可以點來重播，但不是必要操作。
      const bubble = h('button', { type: 'button', class: 'voice-msg', 'aria-label': T.playVoice, vars: { '--dur': `${Math.max(0.5, info.sec || 0)}s` } }, h('span', { class: 'voice-icon', 'aria-hidden': 'true' }, icon('speaker', { filled: true })), h('span', { class: 'voice-wave', 'aria-hidden': 'true' }, waveform(text)), h('span', { class: 'voice-len', text: clock(info.sec || 0) }));
      const start = () => {
        hush();
        bubble.classList.remove('is-playing');
        void bubble.offsetWidth;
        bubble.classList.add('is-playing');
        speaking = voice.play(text, { onEnd: () => bubble.classList.remove('is-playing') });
      };
      bubble.addEventListener('click', start);
      bubble.start = start;
      return bubble;
    };

    let replyButtons = [];
    const showReplies = () => {
      nextBtn.hidden = true;
      const buttons = replies.map((reply, i) => {
        const button = h('button', { type: 'button', class: 'reply', dataset: { key: String(i + 1) } }, h('kbd', { 'aria-hidden': 'true', text: String(i + 1) }), h('span', { text: reply.text }));
        button.addEventListener('click', () => {
          sfx?.play('select');
          for (const b of buttons) b.disabled = true;
          replyBox.hidden = true;
          // 一選完就交給遊戲層結算並存檔，不等按「繼續」
          onReply?.(reply);
          // 回覆是「怎麼回」的動作描述，用一行註記呈現；阿嬤那則訊息底下標上已讀。
          thread.lastElementChild?.append(h('small', { class: 'msg-read', text: T.read }));
          thread.append(h('li', { class: 'msg msg--note' }, h('p', { text: reply.text }), me?.portrait ? avatarFor(me, assets) : null));
          scrollDown();
          nextBtn.hidden = false;
          nextBtn.onclick = () => {
            sfx?.play('select');
            hush();
            done(reply);
          };
          nextBtn.focus({ preventScroll: true });
          onState?.('message');
        });
        return button;
      });
      replyBox.replaceChildren(...buttons);
      replyButtons = buttons;
      replyBox.hidden = false;
      phone.focus({ preventScroll: true });
      scrollDown();
      onState?.('reply', replies.length);
    };

    const advance = () => {
      hush();
      index += 1;
      if (index >= messages.length) {
        done(null);
        return;
      }
      const text = messages[index];
      const info = voice?.info(text) || null;
      const item = h('li', { class: 'msg msg--in' });
      const bubble = info && voiceMessage ? voiceBubble(text, info) : null;
      if (bubble) item.append(bubble);
      item.append(h('p', { text }));
      thread.append(item);
      sfx?.play('message');
      // 有語音就出現即播；前一則在 hush() 已經停掉，不會疊在一起
      if (bubble) bubble.start();
      else if (info) speaking = voice.play(text);
      scrollDown();
      if (index === messages.length - 1 && replies?.length) showReplies();
    };

    nextBtn.onclick = () => {
      sfx?.play('select');
      advance();
    };

    phone.tabIndex = -1;
    // 焦點放在整張訊息卡上，方向鍵就在回覆之間移動
    arrowFocus(phone, () => replyButtons);
    layer.replaceChildren(root);
    onState?.('message');
    advance();
    if (!nextBtn.hidden) nextBtn.focus({ preventScroll: true });
    return () => {
      hush();
      root.remove();
    };
  });
}
