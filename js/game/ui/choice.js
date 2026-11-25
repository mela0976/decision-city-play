// 抉擇：選項疊在過場劇照下半的暗部（三個；阿嬤模組開著時多第四個）。
// 選完，結果、數值變化與書中依據用字幕區呈現。
// options 每筆：{ text, feedback, insight, isGrandma, bonusLabel, hint }
// onPick(option) 由遊戲層結算，回傳 { deltas, bonusLabel }。

import { h, fill, interaction, formatDelta, arrowFocus } from '../dom.js?v=1b0868ba';
import { T, METER_IDS, METER_NAMES } from '../strings.js?v=1b0868ba';

export function deltaChips(deltas, className = 'chips') {
  const items = METER_IDS.filter((id) => deltas?.[id]).map((id) => {
    const value = deltas[id];
    const good = id === 'liver' ? value < 0 : value > 0;
    return h('li', { class: good ? 'is-good' : 'is-bad' }, h('span', { text: METER_NAMES[id] }), h('b', { text: formatDelta(value) }));
  });
  return h('ul', { class: className }, items);
}

export function runChoice({ layer, prompt, note, options, onPick, signal, sfx, onState }) {
  return interaction(signal, (done) => {
    const heading = h('h2', { class: 'choice-prompt', id: 'choice-prompt', text: prompt || '' });
    const list = h('div', { class: 'choice-options', vars: { '--n': String(options.length) } });
    const result = h('div', { class: 'choice-result', hidden: true });
    const actions = h('div', { class: 'cine-actions' });
    // 洞察便利貼：題目上方的閱讀資料（不標示哪個選項是答案）
    const noteEl = note ? h('aside', { class: 'choice-note' }, h('b', { text: note.label }), h('p', { text: note.text })) : null;
    const panel = h('section', { class: 'choice', 'aria-labelledby': 'choice-prompt', tabindex: '-1' }, noteEl, heading, list, result, actions);

    const buttons = options.map((option, i) => {
      const button = h(
        'button',
        { type: 'button', class: `option${option.isGrandma ? ' option--grandma' : ''}`, dataset: { index: String(i), key: String(i + 1) } },
        h('kbd', { class: 'option-key', 'aria-hidden': 'true', text: String(i + 1) }),
        option.isGrandma ? h('span', { class: 'option-tag option-tag--grandma', text: T.grandmaOption }) : null,
        option.bonusLabel ? h('span', { class: 'option-tag', text: option.bonusLabel }) : null,
        h('span', { class: 'option-text', text: option.text }),
        option.hint ? h('span', { class: 'option-hint' }, h('b', { text: option.hint.label }), h('span', { text: option.hint.text })) : null,
      );
      button.addEventListener('click', () => pick(option));
      return button;
    });
    list.append(...buttons);
    arrowFocus(panel, () => buttons);

    function pick(option) {
      sfx?.play('select');
      for (const b of buttons) b.disabled = true;
      panel.classList.add('is-answered');
      const outcome = onPick(option) || {};
      const nextBtn = h('button', { type: 'button', class: 'btn btn--primary', id: 'choice-next', 'data-primary': true, text: T.next });
      nextBtn.addEventListener('click', () => {
        sfx?.play('select');
        done(option);
      });
      heading.textContent = option.text;
      noteEl?.remove();
      fill(
        result,
        h('p', { class: 'sub-text choice-feedback', text: option.feedback || '' }),
        h(
          'div',
          { class: 'choice-effects' },
          deltaChips(outcome.deltas),
          outcome.bonusLabel ? h('span', { class: 'bonus-stamp' }, h('b', { text: T.roleBonus }), h('span', { text: outcome.bonusLabel })) : null,
        ),
        option.insight ? h('blockquote', { class: 'insight' }, h('cite', { text: T.insight }), h('p', { text: option.insight })) : null,
      );
      list.hidden = true;
      result.hidden = false;
      actions.replaceChildren(nextBtn);
      nextBtn.focus({ preventScroll: true });
      onState?.('result');
    }

    layer.replaceChildren(panel);
    // 焦點放在面板本身：動作鍵不會誤選第一個選項。數字鍵直接選；方向鍵移到選項上再按動作鍵也行。
    panel.focus({ preventScroll: true });
    onState?.('choice', options.length);
    return () => panel.remove();
  });
}
