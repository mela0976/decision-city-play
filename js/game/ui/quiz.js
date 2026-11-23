// 問答：四個選項，可按數字鍵 1–4 或直接點，疊在劇照下半。作答後顯示對錯、解說與出處。
// removed：開場就刪掉的錯誤選項索引（數據分析師的加成），沒有就傳 -1。
// onAnswer(isCorrect) 由遊戲層結算，回傳數值變化。

import { h, fill, interaction, arrowFocus } from '../dom.js?v=1448599f';
import { T } from '../strings.js?v=1448599f';
import { deltaChips } from './choice.js?v=1448599f';

export function runQuiz({ layer, question, removed = -1, removedLabel, position, total, onAnswer, signal, sfx, onState }) {
  return interaction(signal, (done) => {
    const result = h('div', { class: 'quiz-result', hidden: true });
    const actions = h('div', { class: 'cine-actions' });
    const buttons = question.options.map((text, i) => {
      const button = h(
        'button',
        { type: 'button', class: 'quiz-option', dataset: { index: String(i), key: String(i + 1) }, disabled: i === removed },
        h('kbd', { class: 'quiz-mark', 'aria-hidden': 'true', text: String(i + 1) }),
        h('span', { class: 'quiz-option-text', text }),
      );
      if (i === removed) {
        button.classList.add('is-removed');
        if (removedLabel) button.append(h('em', { class: 'quiz-removed', text: removedLabel }));
      }
      button.addEventListener('click', () => answer(i));
      return button;
    });

    const panel = h(
      'section',
      { class: 'quiz', 'aria-labelledby': 'quiz-q', tabindex: '-1' },
      h('header', { class: 'quiz-head' }, h('span', { class: 'quiz-count', text: `${position}／${total}` }), question.context ? h('p', { class: 'quiz-context', text: question.context }) : null, h('h2', { id: 'quiz-q', text: question.q })),
      h('div', { class: 'quiz-options' }, buttons),
      result,
      actions,
    );

    arrowFocus(panel, () => buttons);

    function answer(index) {
      const correct = index === question.answer;
      sfx?.play(correct ? 'right' : 'wrong');
      buttons.forEach((b, i) => {
        b.disabled = true;
        b.classList.toggle('is-answer', i === question.answer);
        b.classList.toggle('is-wrong', i === index && !correct);
      });
      panel.classList.add('is-answered', correct ? 'is-right' : 'is-miss');
      const deltas = onAnswer(correct) || {};
      const nextBtn = h('button', { type: 'button', class: 'btn btn--primary', id: 'quiz-next', 'data-primary': true, text: position < total ? T.nextQuestion : T.finishQuiz });
      nextBtn.addEventListener('click', () => {
        sfx?.play('select');
        done(correct);
      });
      fill(
        result,
        h('div', { class: 'quiz-verdict' }, h('strong', { text: correct ? T.quizRight : T.quizWrong }), deltaChips(deltas)),
        h('p', { class: 'quiz-explain', text: question.explain || '' }),
        question.source ? h('p', { class: 'quiz-source' }, h('span', { text: `${T.source}：` }), h('cite', { text: question.source })) : null,
      );
      result.hidden = false;
      actions.replaceChildren(nextBtn);
      nextBtn.focus({ preventScroll: true });
      onState?.('quiz-result');
    }

    layer.replaceChildren(panel);
    panel.focus({ preventScroll: true });
    onState?.('quiz', question.options.length);
    return () => panel.remove();
  });
}
