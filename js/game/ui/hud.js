// HUD：職稱與立繪、時鐘、四項數值、目前任務與提示、倒數、電台跑馬燈、小地圖外框、選單鈕。
// 骨架寫在 index.html（小地圖 canvas 要在引擎建立前就存在），這裡只負責填內容。

import { h, formatDelta, reducedMotion } from '../dom.js?v=7c27097e';
import { T, METER_IDS, METER_NAMES } from '../strings.js?v=7c27097e';
import { icon } from './icons.js?v=7c27097e';

export function createHud({ root, assets, onMenu, onRadio, onAutoRide }) {
  const $ = (id) => root.querySelector(`#${id}`);
  const els = {
    portrait: $('hud-portrait'),
    role: $('hud-role'),
    clock: $('hud-clock'),
    meters: $('hud-meters'),
    task: $('hud-task'),
    taskTitle: $('hud-task-title'),
    taskHint: $('hud-task-hint'),
    timer: $('hud-timer'),
    auto: $('hud-autoride'),
    map: $('hud-map'),
    menu: $('hud-menu'),
    radio: $('hud-radio'),
    station: $('radio-station'),
    ticker: $('radio-ticker'),
    text: $('radio-text'),
  };

  const rows = {};
  for (const id of METER_IDS) {
    const fill = h('i');
    const num = h('b', { class: 'm-num', text: '0' });
    const row = h('li', { dataset: { meter: id } }, h('span', { class: 'm-name', text: METER_NAMES[id] }), h('span', { class: 'm-bar', 'aria-hidden': 'true' }, fill), num);
    rows[id] = { row, fill, num };
    els.meters.append(row);
  }

  // 選單鈕：窄螢幕只留三條線的圖示（字仍給螢幕報讀），寬螢幕照舊寫「選單」
  els.menu.replaceChildren(icon('menu', { className: 'menu-icon' }), h('span', { class: 'menu-name', text: T.menu }));
  els.menu.addEventListener('click', onMenu);
  els.map.querySelector('canvas')?.setAttribute('aria-label', T.mapToggle);
  els.auto.textContent = T.autoRide;
  els.auto.addEventListener('click', onAutoRide);
  els.station.setAttribute('title', T.radioSwitch);
  // 電台名放在自己的 span 裡：窄螢幕只留圖示（名字仍給螢幕報讀），寬螢幕照舊顯示名字
  const stationName = h('span', { class: 'radio-name' });
  els.station.replaceChildren(icon('radio', { className: 'radio-icon' }), stationName);
  els.station.addEventListener('click', onRadio);

  let rotateTimer = 0;

  return {
    show(flag) {
      root.hidden = !flag;
    },
    setRole(role, { grandmaOn = false } = {}) {
      els.role.textContent = role?.title || '';
      els.portrait.replaceChildren(assets.art(grandmaOn ? 'grandma_portrait' : role?.portrait, { kind: 'portrait' }));
    },
    setClock(clock) {
      els.clock.textContent = clock;
      els.clock.setAttribute('datetime', clock);
    },
    setMeters(meters, deltas = null) {
      for (const id of METER_IDS) {
        const { row, fill, num } = rows[id];
        const value = meters[id] ?? 0;
        fill.style.setProperty('--v', String(value));
        num.textContent = String(value);
        row.classList.toggle('is-danger', id === 'liver' && value >= 80);
        const delta = deltas?.[id];
        if (delta) {
          const good = id === 'liver' ? delta < 0 : delta > 0;
          const chip = h('em', { class: `m-delta ${good ? 'is-good' : 'is-bad'}`, text: formatDelta(delta) });
          row.append(chip);
          setTimeout(() => chip.remove(), 1600);
        }
      }
    },
    setTask(title, hint = '') {
      els.task.hidden = !title;
      els.taskTitle.textContent = title || '';
      els.taskHint.textContent = hint || '';
    },
    setTimer(seconds) {
      if (seconds == null) {
        els.timer.hidden = true;
        els.timer.classList.remove('is-urgent');
        return;
      }
      const s = Math.max(0, Math.ceil(seconds));
      els.timer.hidden = false;
      els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      els.timer.setAttribute('aria-label', `${T.timeLeft} ${T.seconds(s)}`);
      els.timer.classList.toggle('is-urgent', s <= 10);
    },
    setRadio(station) {
      clearInterval(rotateTimer);
      els.radio.hidden = station === undefined;
      if (!station) {
        stationName.textContent = T.radioOff;
        els.text.textContent = '';
        els.ticker.classList.remove('is-rolling');
        return;
      }
      stationName.textContent = station.name || '';
      const lines = (station.ticker || []).filter(Boolean);
      if (reducedMotion() || lines.length === 0) {
        let index = 0;
        els.ticker.classList.remove('is-rolling');
        els.text.textContent = lines[0] || '';
        if (lines.length > 1) {
          rotateTimer = setInterval(() => {
            index = (index + 1) % lines.length;
            els.text.textContent = lines[index];
          }, 6000);
        }
      } else {
        const text = lines.join('　◆　');
        els.text.textContent = text;
        els.text.style.setProperty('--dur', `${Math.max(12, text.length * 0.32)}s`);
        els.ticker.classList.remove('is-rolling');
        void els.ticker.offsetWidth;
        els.ticker.classList.add('is-rolling');
      }
    },
    /** 自動前往的按鈕：有導航點、引擎也支援時才出現；進行中換字。 */
    setAutoRide({ visible, on }) {
      els.auto.hidden = !visible;
      els.auto.textContent = on ? T.autoRiding : T.autoRide;
      els.auto.setAttribute('aria-pressed', String(!!on));
    },
  };
}
