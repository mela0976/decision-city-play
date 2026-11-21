// 任務之間的過場：
//   showSlide    「提案第 n 頁」蓋章入手（那一年的一句答案）
//   runSincere   一句真心話，話沒顯示完就被台灣的日常打斷。六種打斷各有一個畫面效果與合成音效。

import { h, interaction, reducedMotion } from '../dom.js?v=c70e9ac';
import { T } from '../strings.js?v=c70e9ac';
import { icon } from './icons.js?v=c70e9ac';
import { avatarFor } from './phone.js?v=c70e9ac';

const CHAR_MS = 30;
const CUT_AT = 0.58;

export function showSlide({ layer, page, year, title, signal, sfx }) {
  return interaction(signal, (done) => {
    const keep = h('button', { type: 'button', class: 'btn btn--primary btn--big', id: 'slide-keep', 'data-primary': true, text: T.slideKeep });
    keep.addEventListener('click', () => {
      sfx?.play('select');
      done();
    });
    const slip = h(
      'article',
      { class: 'ticket slide-slip', 'aria-labelledby': 'slide-title' },
      h('header', { class: 'ticket-stub' }, h('span', { class: 'lightbox', text: String(year ?? '') }), h('span', { class: 'ticket-kind', text: T.slidePage(page) }), h('span', { class: 'ticket-no', text: String(page).padStart(2, '0') })),
      h('div', { class: 'ticket-body' }, h('h2', { id: 'slide-title', text: title || '' })),
      h('div', { class: 'stamp', 'aria-hidden': 'true' }, h('span', { text: T.slideStamp })),
    );
    const root = h('div', { class: 'slide-wrap' }, slip, h('div', { class: 'cine-actions' }, keep));
    layer.replaceChildren(root);
    sfx?.play('stamp');
    keep.focus({ preventScroll: true });
    return () => root.remove();
  });
}

/** 每種打斷的畫面。回傳要疊上去的元素。 */
function interruptVisual(kind, { label, sender, assets }) {
  switch (kind) {
    case 'garbage_truck':
      // 黃色跑馬燈橫過畫面
      return h('div', { class: 'fx fx--marquee', 'aria-hidden': 'true' }, h('div', { class: 'fx-marquee-track' }, Array.from({ length: 8 }, () => h('span', { text: label }))));
    case 'alert':
      // 全螢幕警示條與震動樣式
      return h('div', { class: 'fx fx--alert', 'aria-hidden': 'true' }, h('i', { class: 'fx-hazard fx-hazard--top' }), h('div', { class: 'fx-alert-plate' }, h('b', { text: label })), h('i', { class: 'fx-hazard fx-hazard--bottom' }));
    case 'thunder':
      // 閃白，接著雨絲
      return h('div', { class: 'fx fx--thunder', 'aria-hidden': 'true' }, h('i', { class: 'fx-flash' }), h('i', { class: 'fx-rain' }));
    case 'campaign_truck':
      // 一串旗幟橫掃
      return h('div', { class: 'fx fx--flags', 'aria-hidden': 'true' }, h('div', { class: 'fx-flags-row' }, Array.from({ length: 14 }, (_, i) => h('i', { vars: { '--i': String(i) } }))));
    case 'delivery_call':
      // 來電畫面
      return h(
        'div',
        { class: 'fx fx--call', 'aria-hidden': 'true' },
        h('div', { class: 'fx-call-card' }, h('span', { class: 'fx-call-ring' }, icon('phone')), h('b', { text: label }), h('small', { text: T.callIncoming }), h('div', { class: 'fx-call-buttons' }, h('i', { class: 'fx-call-no' }, icon('phone')), h('i', { class: 'fx-call-yes' }, icon('phone')))),
      );
    case 'boss_line':
      // 主管的訊息從上方彈出
      return h('div', { class: 'fx fx--notice', 'aria-hidden': 'true' }, h('div', { class: 'fx-notice-card' }, avatarFor(sender || { name: label }, assets), h('div', {}, h('small', { text: T.messages }), h('b', { text: sender?.name || label }))));
    default:
      return h('div', { class: 'fx', 'aria-hidden': 'true' });
  }
}

export function runSincere({ layer, assets, speaker, text, interrupt, sender, signal, sfx, onState, voice }) {
  return interaction(signal, (done) => {
    const kind = interrupt?.kind || '';
    const label = T.interrupt[kind] || '';
    const cut = Math.max(2, Math.floor(text.length * CUT_AT));
    let shown = 0;
    let typing = 0;
    let interrupted = false;
    let speaking = null;
    let noise = null;

    const typed = h('span', { 'aria-hidden': 'true' });
    const rest = h('span', { class: 'sub-rest', 'aria-hidden': 'true', text });
    const srText = h('span', { class: 'sr-only', text: `${text.slice(0, cut)}——` });
    const line = h('p', { class: 'sub-text' }, srText, typed, rest);
    const caption = h('p', { class: 'fx-caption', hidden: true }, label ? h('b', { text: label }) : null, h('span', { text: interrupt?.text || '' }));
    const nextBtn = h('button', { type: 'button', class: 'btn btn--primary', id: 'sincere-next', 'data-primary': true, text: T.fastForward });
    const fxSlot = h('div', { class: 'fx-slot' });
    const box = h(
      'section',
      { class: 'dlg dlg--sincere', 'aria-label': T.a11yDialogue, dataset: { kind } },
      fxSlot,
      h('div', { class: 'sub' }, h('header', { class: 'sub-who' }, speaker.avatar ? h('span', { class: 'sub-face' }, h('span', { class: 'avatar' }, assets.art(speaker.avatar, { kind: 'square' }))) : null, h('strong', { class: 'sub-name', text: speaker.name || '' }), h('span', { class: 'sub-role', text: speaker.title || '' })), line, caption),
      h('div', { class: 'cine-actions' }, nextBtn),
    );

    const strike = () => {
      if (interrupted) return;
      interrupted = true;
      clearInterval(typing);
      typing = 0;
      // 話停在半句，後面沒說完的不再出現
      typed.textContent = `${text.slice(0, Math.min(shown, cut) || cut)}——`;
      rest.textContent = '';
      box.classList.add('is-interrupted');
      if (reducedMotion()) box.classList.add('is-still');
      fxSlot.replaceChildren(interruptVisual(kind, { label, sender, assets }));
      // 話被打斷：語音同時切掉，換成打斷它的那個聲音
      speaking?.stop();
      speaking = null;
      noise = sfx?.play(kind) || null;
      if (kind === 'alert') navigator.vibrate?.([180, 90, 180]);
      caption.hidden = false;
      nextBtn.textContent = T.next;
      onState?.('interrupted', kind);
    };

    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!interrupted) {
        strike();
        return;
      }
      sfx?.play('select');
      done(kind);
    });
    box.addEventListener('click', (e) => {
      if (e.target instanceof HTMLElement && e.target.closest('button')) return;
      nextBtn.click();
    });

    layer.replaceChildren(box);
    nextBtn.focus({ preventScroll: true });
    onState?.('sincere');
    speaking = voice?.play(text) || null;
    if (reducedMotion()) {
      shown = cut;
      strike();
    } else {
      typing = setInterval(() => {
        shown += 1;
        typed.textContent = text.slice(0, shown);
        rest.textContent = text.slice(shown);
        if (shown >= cut) strike();
      }, CHAR_MS);
    }

    return () => {
      clearInterval(typing);
      speaking?.stop();
      noise?.stop();
      box.remove();
    };
  });
}
