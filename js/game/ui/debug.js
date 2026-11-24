// 除錯面板：網址帶 ?debug=1 才會出現。驗收用：設數值、跳任務、看結局、開關阿嬤模組。

import { h } from '../dom.js?v=1dff2833';
import { T, METER_IDS, METER_NAMES } from '../strings.js?v=1dff2833';

export function mountDebug({ game, content }) {
  const inputs = Object.fromEntries(
    METER_IDS.map((id) => [id, h('input', { type: 'number', min: '0', max: '100', step: '1', value: '50', id: `debug-${id}`, inputmode: 'numeric' })]),
  );
  const missionSelect = h(
    'select',
    { id: 'debug-mission', 'aria-label': T.debugJump },
    content.missions.map((m) => h('option', { value: m.id, text: `${m.order ?? ''} ${m.id}` })),
  );

  const sideSelect = h('select', { id: 'debug-side', 'aria-label': T.debugSide }, content.side.missions.map((side) => h('option', { value: side.id, text: `${side.id} ${side.title}` })));
  const yearSelect = h('select', { id: 'debug-year', 'aria-label': T.debugYear }, [...new Set(content.missions.map((m) => m.year))].map((year) => h('option', { value: String(year), text: String(year) })));
  const bondInput = h('input', { type: 'number', step: '1', value: '0', id: 'debug-bond', inputmode: 'numeric' });

  const sync = () => {
    for (const id of METER_IDS) inputs[id].value = String(game.state.meters[id] ?? 0);
    bondInput.value = String(game.state.bond ?? 0);
  };

  // 打開面板的那一下就把目前數值填進欄位（不等 toggle 事件，免得蓋掉剛打的字）。
  const panel = h(
    'details',
    { class: 'debug', id: 'debug-panel' },
    h('summary', { text: T.debugTitle, onClick: () => sync() }),
    h(
      'div',
      { class: 'debug-body' },
      h(
        'div',
        { class: 'debug-meters' },
        METER_IDS.map((id) => h('label', {}, h('span', { text: METER_NAMES[id] }), inputs[id])),
        h('button', {
          type: 'button',
          id: 'debug-apply',
          text: T.debugApply,
          onClick: () => game.debug.setMeters(Object.fromEntries(METER_IDS.map((id) => [id, Number(inputs[id].value)]))),
        }),
      ),
      h('div', { class: 'debug-row' }, missionSelect, h('button', { type: 'button', id: 'debug-jump', text: T.debugJump, onClick: () => game.debug.jumpTo(missionSelect.value) })),
      h(
        'div',
        { class: 'debug-row' },
        content.endings.map((ending) =>
          h('button', { type: 'button', id: `debug-ending-${ending.id}`, text: T.debugEnding(ending.id), onClick: () => game.debug.showEnding(ending.id).then(sync) }),
        ),
        content.grandma?.ending ? h('button', { type: 'button', id: 'debug-ending-grandma', text: T.debugGrandmaEnding, onClick: () => game.debug.showGrandmaEnding().then(sync) }) : null,
      ),
      h('div', { class: 'debug-row' }, h('button', { type: 'button', id: 'debug-car', text: T.debugCar, onClick: () => game.debug.unlockCar() })), // A26
      h('div', { class: 'debug-row' }, h('button', { type: 'button', id: 'debug-grandma', text: T.debugGrandma, onClick: () => game.debug.toggleGrandma() })),
      h(
        'div',
        { class: 'debug-row' },
        h('label', {}, h('span', { text: T.debugBond }), bondInput),
        h('button', { type: 'button', id: 'debug-bond-apply', text: T.debugBondApply, onClick: () => game.debug.setBond(Number(bondInput.value)) }),
      ),
      content.side.missions.length
        ? h('div', { class: 'debug-row' }, sideSelect, h('button', { type: 'button', id: 'debug-side-start', text: T.debugSide, onClick: () => game.debug.startSide(sideSelect.value) }))
        : null,
      h('div', { class: 'debug-row' }, yearSelect, h('button', { type: 'button', id: 'debug-year-done', text: T.debugYear, onClick: () => game.debug.completeYear(Number(yearSelect.value)) })),
      h(
        'div',
        { class: 'debug-row' },
        h('button', { type: 'button', id: 'debug-prologue', text: T.debugPrologue, onClick: () => game.debug.playPrologue() }),
        h('button', { type: 'button', id: 'debug-morning', text: T.debugMorning, onClick: () => game.debug.playMorning() }),
        h('button', { type: 'button', id: 'debug-feed', text: T.debugFeed, onClick: () => game.debug.playFeed(missionSelect.value) }),
        h('button', { type: 'button', id: 'debug-interlude', text: T.debugInterlude, onClick: () => game.debug.playInterlude(missionSelect.value) }),
      ),
    ),
  );
  document.body.append(panel);
  return panel;
}
