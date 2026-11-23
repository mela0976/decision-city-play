// 下方提示列的內容：依目前狀態與輸入方式（鍵盤或觸控）決定。
// 回傳 { task, parts }；parts 每段是 { keys: [鍵帽…], text }。

import { T, KEY, HINT } from './strings.js?v=5dbcfc52';

// A24 the engine publishes wait transitions on its canvas before refreshing the ride hint.
let waitingForSignal=false;
globalThis.document?.addEventListener('signal:wait',event=>{waitingForSignal=event.detail.seconds>0;});

const part = (keys, text) => ({ keys: [].concat(keys || []), text: text || '' });
const curbNotes = { parked: T.curbParked, road: T.curbRoad, walk: T.curbWalk, // A24
  // A25 autoride refusals and the stuck-player rescue
  'auto-here': T.autoHere, 'auto-target': T.autoNoTarget, 'auto-route': T.autoNoRoute, 'auto-mount': T.autoNoMount,
  carDrivingTouch: T.carDrivingTouch, carBoard: T.carBoard, carLocked: T.carLocked, carSpace: T.carSpace, carDriving: T.carDriving, // A26
  'auto-landing': T.autoLanding, rescued: T.rescued, dodged: T.dodged,
  // 飛天車飛不過去的原因：建築太高、沒有降落點、地圖邊界
  'flyBlocked-tall': T.flyBlockedTall, 'flyBlocked-landing': T.flyBlockedLanding, 'flyBlocked-boundary': T.flyBlockedBoundary };
export const curbHint = kind => curbNotes[kind] ?? T.curbRoad;
const say = (text) => part([], text);
const numbers = (count) => Array.from({ length: count }, (_, i) => String(i + 1));

// 引擎在建築門口給的 enter：targetId 是地點本身（例如 office、targetName「富幫 A25」），不是某個任務標記
const isPlaceDoor = (context) => !!context.targetName && (context.entrance || context.targetId === 'office');

export function hintFor(state, mode) {
  const touch = mode === 'touch';
  switch (state?.kind) {
    case 'title':
      return { task: '', parts: touch ? [say(`${HINT.tap} ${HINT.start}`)] : [part(KEY.action, state.canContinue ? HINT.resume : HINT.start)] };
    case 'years':
      return { task: touch ? '' : HINT.pickYear, parts: touch ? [say(HINT.tapYear)] : [part([KEY.left, KEY.right], HINT.select), part(KEY.action, HINT.confirm)] };
    case 'error':
      return { task: '', parts: touch ? [say(`${HINT.tap} ${HINT.retry}`)] : [part(KEY.action, HINT.retry)] };
    case 'roles':
      return {
        task: HINT.pickRole,
        parts: touch ? [say(`${HINT.swipe} ${HINT.switchRole}`), say(HINT.tapConfirm)] : [part([KEY.left, KEY.right], HINT.switchRole), part(KEY.action, HINT.thisOne)],
      };
    case 'ride': {
      const task = !state.place ? '' : state.arrived ? HINT.arrived(state.place) : HINT.goTo(state.place);
      if (state.auto) return { task, parts: [say(waitingForSignal?HINT.signalWait:T.autoRiding), say(touch ? HINT.cancelTouch : HINT.cancelKeyboard)] };
      // goto 步驟一開始先提醒可以自動前往
      if (state.remindAuto) return { task, parts: touch ? [say(HINT.tapAuto), say(`${HINT.stick} ${HINT.move}`)] : [part(KEY.auto, T.autoRide), part(KEY.arrows, HINT.move)] };
      const context = state.context;
      if (context?.action) {
        const what = context.action === 'drive' ? T.carTake : state.work ? state.work : context.action === 'talk' && context.targetName ? HINT.talkTo(context.targetName) : context.action === 'enter' ? (isPlaceDoor(context) ? HINT.enterPlace(context.targetName) : HINT.enterMission) : HINT.interact; // A26
        return { task, parts: [touch ? say(`${HINT.tapAction} ${what}`) : part(KEY.action, what)] };
      }
      // A22 featured vehicle hint
      if (touch) return { task, parts: state.canAuto ? [say(`${HINT.stick} ${HINT.move}`), say(HINT.tapAuto), part('T', HINT.flyCar)] : [say(`${HINT.stick} ${HINT.move}`), part('T', HINT.flyCar)] };
      const move = part(KEY.arrows, HINT.move);
      const auto = part(KEY.auto, T.autoRide);
      const map = part(KEY.map, HINT.map);
      const tesla = part('T', HINT.flyCar);
      if (state.carUnlocked) { // A26 preserve the normal action prompt by showing vehicle keys only when free.
        const vehicle = part('C', state.driving ? T.carExit : T.carTake);
        return { task, parts: [move, ...(state.canAuto ? [auto] : []), map, vehicle, ...(state.driving ? [part('V', T.carView)] : []), tesla] };
      }
      return { task, parts: state.canAuto ? [move, auto, map, tesla] : [move, map, tesla] };
    }
    case 'card':
      return { task: HINT.newMission, parts: touch ? [say(`${HINT.tap} ${T.acceptMission}`)] : [part(KEY.action, T.acceptMission), part(KEY.esc, HINT.menu)] };
    case 'pick':
      return { task: state.place || '', parts: touch ? [say(HINT.tapOption)] : [part(numbers(Math.min(state.count || 2, 9)), HINT.select), part(KEY.arrows, HINT.move), part(KEY.action, HINT.confirm)] };
    case 'place':
      return { task: state.place ? HINT.goTo(state.place) : '', parts: touch ? [say(`${HINT.tap} ${T.depart}`)] : [part(KEY.action, T.depart), part(KEY.esc, HINT.menu)] };
    case 'dialogue':
      // 序幕與收尾還沒有（或已經沒有）選單可開，就不提 Esc
      return { task: state.speaker ? HINT.talkTo(state.speaker) : '', parts: touch ? [say(`${HINT.tap} ${HINT.next}`)] : state.menu === false ? [part(KEY.action, HINT.next)] : [part(KEY.action, HINT.next), part(KEY.esc, HINT.menu)] };
    case 'choice':
      return { task: HINT.choose, parts: touch ? [say(HINT.tapOption)] : [part(numbers(state.count || 3), HINT.select), part(KEY.arrows, HINT.move), part(KEY.action, HINT.confirm)] };
    case 'result':
      return { task: HINT.seeResult, parts: touch ? [say(`${HINT.tap} ${HINT.next}`)] : [part(KEY.action, HINT.next)] };
    case 'quiz':
      return { task: HINT.answer, parts: touch ? [say(HINT.tapAnswer)] : [part(numbers(state.count || 4), HINT.select), part(KEY.arrows, HINT.move), part(KEY.action, HINT.confirm)] };
    case 'quiz-result':
      return { task: HINT.seeExplain, parts: touch ? [say(`${HINT.tap} ${HINT.next}`)] : [part(KEY.action, HINT.next)] };
    case 'clear':
      return { task: HINT.missionDone, parts: touch ? [say(`${HINT.tap} ${HINT.next}`)] : [part(KEY.action, HINT.next)] };
    case 'cutscene':
      return { task: '', parts: touch ? [say(`${HINT.tap} ${HINT.skip}`)] : [part(KEY.action, HINT.skip)] };
    case 'flyover':
      return { task: state.place || '', parts: touch ? [say(`${HINT.tapAction} ${HINT.skip}`)] : [part(KEY.action, HINT.skip)] };
    case 'feed':
      return { task: '', parts: touch ? [say(`${HINT.tapScreen} ${HINT.nextPost}`)] : [part(KEY.action, HINT.skip)] };
    case 'slide':
      return { task: T.slidePage(state.page || ''), parts: touch ? [say(`${HINT.tap} ${HINT.keepSlide}`)] : [part(KEY.action, HINT.keepSlide)] };
    case 'message':
      return { task: [T.messages, state.name].filter(Boolean).join('　'), parts: touch ? [say(`${HINT.tap} ${HINT.next}`)] : [part(KEY.action, HINT.next)] };
    case 'reply':
      return { task: HINT.reply, parts: touch ? [say(HINT.tapReply)] : [part(numbers(state.count || 3), HINT.replyKeys), part(KEY.arrows, HINT.move), part(KEY.action, HINT.confirm)] };
    case 'ask':
      return { task: state.title || '', parts: touch ? [say(`${HINT.tap} ${T.takeBasket}`)] : [part(KEY.action, T.takeBasket)] };
    case 'ending':
      return { task: HINT.dayOver, parts: touch ? [say(`${HINT.tap} ${T.playAgain}`)] : [part(KEY.action, T.playAgain)] };
    default:
      return { task: '', parts: [] };
  }
}
