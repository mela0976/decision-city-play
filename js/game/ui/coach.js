// 第一次遊玩的互動教學：序幕之後、前往晨會的路上，畫面左側一張小清單（轉向、前進、地圖、自動前往）。
// 做到一項就打勾、淡出那一項；全部完成或 60 秒後收起，可以略過。只出現一次（存在偏好 coachDone），操作手冊可以重看。
// 「做到」看的是引擎狀態，不看鍵碼：engine.player 的朝向與位置變化、autoride:change；
// 地圖：看引擎的 map:change（M 鍵、點小地圖、觸控按鈕都由引擎發）。

import { h } from '../dom.js?v=70a6a7b0';
import { T, KEY } from '../strings.js?v=70a6a7b0';

export const COACH_STEPS = ['turn', 'forward', 'map', 'auto'];
const LIMIT_MS = 60000;
const TICK_MS = 120;
const TURN_RAD = 0.6; // 累積轉了約 35° 算「轉向」
const FORWARD_MS = 700; // 朝車頭方向累積前進 0.7 秒算「前進」
const DONE_FADE_MS = 900;
const CLOSE_MS = 1400;

const NS = 'http://www.w3.org/2000/svg';
function glyph(d) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}
// 觸控版的圖示：搖桿（圓）裡的方向、小地圖
const STICK_SIDE = 'M12 3a9 9 0 110 18 9 9 0 010-18zM8 9.5L5.5 12 8 14.5M16 9.5l2.5 2.5-2.5 2.5';
const STICK_UP = 'M12 3a9 9 0 110 18 9 9 0 010-18zM9.5 9L12 6.5 14.5 9M12 6.5v6';
const MAP = 'M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5zM9 4v13.5M15 6.5V20';

const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * root：#stage。engine：遊戲用的引擎。canRun()：現在算不算在自由騎乘（世界有在跑、沒有選單）。
 * isDone()／markDone()：偏好裡的 coachDone。
 */
export function createCoach({ root, engine, canRun, isDone, markDone }) {
  const keys = (list) => h('span', { class: 'coach-keys coach-keys--kb' }, list.map((k) => h('kbd', { text: k })));
  const touch = (...kids) => h('span', { class: 'coach-keys coach-keys--touch' }, kids);
  const row = (step, kb, tc) => h('li', { class: 'coach-step', dataset: { step } }, kb, tc, h('span', { class: 'coach-text', text: T.coach[step] }), h('span', { class: 'coach-check', 'aria-hidden': 'true' }));
  const items = {
    turn: row('turn', keys([KEY.left, KEY.right]), touch(glyph(STICK_SIDE))),
    forward: row('forward', keys([KEY.up]), touch(glyph(STICK_UP))),
    map: row('map', keys([KEY.map]), touch(glyph(MAP))),
    auto: row('auto', keys([KEY.auto]), touch(h('b', { class: 'coach-glyph', text: '➤' }))),
  };
  const skip = h('button', { type: 'button', class: 'btn btn--small coach-skip', id: 'coach-skip', text: T.coach.skip });
  const time = h('i', { class: 'coach-time', 'aria-hidden': 'true' });
  const panel = h('aside', { id: 'coach', class: 'coach', 'aria-label': T.coach.label, hidden: true }, h('ol', { class: 'coach-list' }, COACH_STEPS.map((s) => items[s])), skip, time);
  root.append(panel);

  let running = false;
  let done = new Set();
  let timer = 0;
  let closeTimer = 0;
  let elapsed = 0;
  let last = null;
  let turned = 0;
  let forwardMs = 0;
  let autoOn = false;
  const unsubs = [];

  const tick = (step, why = '') => {
    if (!running || done.has(step)) return;
    done.add(step);
    const li = items[step];
    li.classList.add('is-done');
    li.dataset.why = why;
    setTimeout(() => li.classList.add('is-gone'), DONE_FADE_MS);
    panel.dataset.done = String(done.size);
    if (done.size === COACH_STEPS.length) finish('complete');
  };

  const poll = () => {
    if (!running) return;
    if (!canRun()) {
      last = null;
      panel.dataset.paused = 'true';
      return;
    }
    delete panel.dataset.paused;
    elapsed += TICK_MS;
    time.style.setProperty('--left', String(Math.max(0, 1 - elapsed / LIMIT_MS)));
    if (elapsed >= LIMIT_MS) {
      finish('timeout');
      return;
    }
    let p;
    try {
      p = engine.player;
    } catch {
      return;
    }
    if (!p || !Number.isFinite(p.x)) return;
    // 自動前往時，車子自己轉、自己走，不算玩家做到
    if (last && !autoOn && !engine.autoRide) {
      const turn = Number.isFinite(p.heading) && Number.isFinite(last.heading) ? Math.abs(angle(p.heading - last.heading)) : 0;
      turned += Math.min(turn, TURN_RAD); // 一次轉很大（假引擎直接換方向、或傳送）最多算一次
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const along = dx * Math.cos(p.heading || 0) + dy * Math.sin(p.heading || 0);
      if (along > 1e-6 && Math.hypot(dx, dy) > 1e-6) forwardMs += TICK_MS;
      if (turned >= TURN_RAD) tick('turn', 'heading');
      if (forwardMs >= FORWARD_MS) tick('forward', 'position');
    }
    last = { x: p.x, y: p.y, heading: p.heading };
  };

  const onEngine = (event, fn) => {
    engine.on?.(event, fn);
    unsubs.push(() => engine.off?.(event, fn));
  };

  function bind() {
    onEngine('autoride:change', ({ on } = {}) => {
      autoOn = !!on;
      if (on) tick('auto', 'autoride:change');
    });
    onEngine('map:change', ({ open } = {}) => {
      if (open) tick('map', 'map:change');
    });
  }

  function finish(reason) {
    if (!running) return;
    running = false;
    clearInterval(timer);
    for (const off of unsubs.splice(0)) off();
    panel.dataset.end = reason;
    markDone?.(reason);
    panel.classList.add('is-closing');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      panel.hidden = true;
      panel.classList.remove('is-closing');
    }, reason === 'complete' ? CLOSE_MS : 260);
  }

  skip.addEventListener('click', () => {
    finish('skip');
    document.getElementById('city')?.focus({ preventScroll: true });
  });

  return {
    /** 開始教學；force 給「操作手冊」的重看用（不看偏好）。 */
    start({ force = false } = {}) {
      if (running || (!force && isDone?.())) return false;
      clearTimeout(closeTimer);
      running = true;
      done = new Set();
      elapsed = 0;
      last = null;
      turned = 0;
      forwardMs = 0;
      autoOn = !!engine.autoRide;
      for (const li of Object.values(items)) {
        li.classList.remove('is-done', 'is-gone');
        delete li.dataset.why;
      }
      delete panel.dataset.end;
      panel.dataset.done = '0';
      time.style.setProperty('--left', '1');
      panel.classList.remove('is-closing');
      panel.hidden = false;
      bind();
      timer = setInterval(poll, TICK_MS);
      return true;
    },
    /** 離開自由騎乘的那段路（例如抵達晨會）：收起來，也算看過了。 */
    stop(reason = 'left') {
      finish(reason);
    },
    get running() {
      return running;
    },
    get done() {
      return [...done];
    },
  };
}
