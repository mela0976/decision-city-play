// 遊戲控制器：一天的推進、任務執行、數值、存檔、阿嬤模組、結局。
// 任務、角色、題目的文字全部來自 content；這裡只有流程與規則。

import { h, interaction, arrowFocus, clockToHours, hoursToClock } from './dom.js?v=7c913f1f';
import { T, METER_IDS, METER_NAMES, PLACES, LANDMARKS, LANG } from './strings.js?v=7c913f1f';
import { pickEnding, metersForEnding } from './endings.js?v=7c913f1f';
import { hintFor, curbHint } from './hints.js?v=7c913f1f';
import { voiceKey, voiceInfo } from './sound.js?v=7c913f1f';
import { createHud } from './ui/hud.js?v=7c913f1f';
import { createToasts } from './ui/toast.js?v=7c913f1f';
import { showTitle } from './ui/title.js?v=7c913f1f';
import { showRoleSelect } from './ui/role-select.js?v=7c913f1f';
import { runDialogue } from './ui/dialogue.js?v=7c913f1f';
import { runChoice } from './ui/choice.js?v=7c913f1f';
import { runQuiz } from './ui/quiz.js?v=7c913f1f';
import { showMissionCard, showMissionClear, showChapterCard } from './ui/mission-card.js?v=7c913f1f';
import { pickWork } from './ui/side-pick.js?v=7c913f1f';
import { openSideList } from './ui/side-list.js?v=7c913f1f';
import { blankGain, scaleSideEffects, yearDone, openSides, sidesAt, chapterProgress, chapterTitles, sideGroups, appendixCards } from './side.js?v=7c913f1f';
import { showPlaceCard } from './ui/place-card.js?v=7c913f1f';
import { playCutscene } from './ui/cutscene.js?v=7c913f1f';
import { showEnding } from './ui/ending.js?v=7c913f1f';
import { openProposal } from './ui/proposal.js?v=7c913f1f';
import { playLines, playPrologue, playMorning, playFeedFor, playInterlude, playFinale, proposalPages, grandmaWithUs } from './story.js?v=7c913f1f'; // A26
import { openMenu, askConfirm, enableLightDismiss, soundControls } from './ui/menu.js?v=7c913f1f';
import { openManual } from './ui/manual.js?v=7c913f1f';
import { openElderCard } from './ui/elder-card.js?v=7c913f1f';
import { langControls } from './ui/lang-switch.js?v=7c913f1f';
import { createCoach } from './ui/coach.js?v=7c913f1f';
import { shareResult } from './share.js?v=7c913f1f';
import { VERSION } from './version.js?v=7c913f1f';
import { placeInspirations, sweepPickups, nearestPickup, punctualBonus, INSPIRE_BRAND_EVERY, INSPIRE_BRAND } from './ride.js?v=7c913f1f';
import { createInspireChip } from './ui/inspire.js?v=7c913f1f';
import { showYearSelect } from './ui/year-select.js?v=7c913f1f';

// 固定規則：docs/CONTRACTS.md 第 3.4 節。
const QUIZ_RIGHT = { trust: 3 };
const QUIZ_WRONG = { liver: 3 };
const GOTO_LATE_LIVER = 5;
const RELIEF = { riverside: -10, breakfast: -5, convenience: -5, night_market: -5 };
// 契約沒有定的數字（回報時列為假設）。
const REMIND_AUTO_MS = 6000;
const FLYOVER_GUARD_MS = 15000;
const GOTO_ESTIMATE_FACTOR = 1.4;
const START_CLOCK = '08:00';
const HOURS_AFTER_MISSION = 0.5;
const ENDING_HOUR = 22;
const AE_CALM_EFFECTS = { trust: 3, sales: 3 };
const LOC = { home: 'home', final: 'rechao', temple: 'temple', grandma: 'gamadiam', office: 'office', nightMarket: 'night_market' };
// 主角的語音：依職能用女聲或男聲（契約第 6 節）。
const PLAYER_VOICE = { ae: 'player_f', media: 'player_f', creative: 'player_f', cx: 'player_f', planner: 'player_m', data: 'player_m' };
const AMBIENT_MS = 300;
const EGG_TEMPLE = 'egg:temple';
const EGG_GRANDMA = 'egg:gamadiam';
const GOTO_MARKER = 'goto';
const FINAL_MARKER = 'rechao';
const MORNING_MARKER = 'morning';
const OFFICE_REPLY_MS = 1200;
const RIDE_TICK_MS = 100;
// 年度重玩的起始數值：職能的起始值，越晚的年份往一天的那個時段推一點（第 k 年：三項 +2k、肝指數 +4k）
const REPLAY_DRIFT = { brand: 2, sales: 2, trust: 2, liver: 4 };

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const clone = (value) => JSON.parse(JSON.stringify(value));
const sample = (list) => (list && list.length ? list[Math.floor(Math.random() * list.length)] : null);
const isAbort = (err) => err?.name === 'AbortError';

function blankState() {
  return {
    roleId: null,
    meters: { brand: 0, sales: 0, trust: 0, liver: 0 },
    clock: START_CLOCK,
    doneMissionIds: [],
    carUnlocked: false, // A26
    carNoticePending: false,
    books: [],
    currentMissionId: null,
    quizSeen: { correct: [], asked: 0, right: 0 },
    grandma: { unlocked: false, on: false, templeVisits: 0 },
    relief: [],
    bond: 0,
    interludesSeen: [],
    prologueSeen: false,
    morningDone: false,
    side: {},
    sideGain: blankGain(),
    inspiration: [],
  };
}

export class Game {
  constructor({ content, assets, engine, engineKind, store, sound, hint, els, opts }) {
    this.content = content;
    this.assets = assets;
    this.engine = engine;
    this.engineKind = engineKind;
    this.store = store;
    this.sound = sound;
    this.sfx = sound.sfx;
    this.raining = false;
    this.topSpeed = 1;
    this.wasRiding = false;
    this.els = els;
    this.opts = opts;

    this.phase = 'boot';
    this.free = false;
    this.blurred = false;
    this.flow = null;
    this.objective = null;
    this.gotoArrive = null;
    this.offering = false;
    this.screenUi = null;
    this.flying = false;
    this.mapOpen = false;
    this.radio = { index: 0, off: false };
    this.locations = new Map(engine.getLocations().map((loc) => [loc.id, loc]));
    // i18n：地圖上的地點、地標、「玩家」標籤與街景上的介面字（自動駕駛中等）換成譯名（引擎的世界資料與 3D 招牌維持中文）
    if (LANG !== 'zh') engine.setLabels?.({ places: PLACES, landmarks: LANDMARKS, player: `◆ ${T.mapYou}`, ui: T.mapUi });
    // i18n：語音照中文原句找檔
    sound.voice.setTextSource?.((text) => this.voiceText(text));

    // 靈感：沿一天的路線擺在車道上的點（ride.js）；要在讀存檔之前擺好，存檔裡的 id 才對得起來
    const placed = placeInspirations(engine, content);
    this.pickups = placed.pickups;
    this.pickupUpm = placed.upm;
    this.replay = null;
    this.gotoRun = null;

    this.state = this.loadState();
    this.applyRoleScript(); // 職能劇本
    this.engine.setCarUnlocked?.(this.state.carUnlocked); // A26
    this.committed = clone(this.state);

    // 操作狀態：輸入方式（鍵盤或觸控）、動作鍵現在會做的事、自動前往。
    this.canAutoRide = typeof engine.setAutoRide === 'function';
    // 還沒有任何輸入之前，先看裝置的主要指標：手機平板先顯示觸控版，之後跟著實際輸入切換。
    this.inputMode = matchMedia('(pointer: coarse)').matches || engine.inputMode === 'touch' ? 'touch' : 'keyboard';
    this.context = null;
    this.engineHasContext = false;
    this.autoOn = false;
    this.hintState = null;
    this.enteredWorld = false;
    els.stage.dataset.input = this.inputMode;

    this.toast = createToasts(els.toasts);
    this.hint = hint;
    // 語音被瀏覽器擋下（還沒有任何使用者操作）：提示列顯示一次「點一下開啟聲音」，點過就收掉
    sound.onBlocked = () => hint.setNote?.(T.tapForSound);
    sound.onUnblocked = () => hint.setNote?.(null);
    this.hint.setEnabled(store.readPrefs().hint !== false);
    this.hud = createHud({
      root: els.hud,
      assets,
      onMenu: () => this.openMenu(),
      onRadio: () => this.cycleRadio(),
      onAutoRide: () => this.toggleAutoRide(),
    });
    this.inspireChip = createInspireChip(els.hud.querySelector('.hud-corner') || els.hud);
    // 點過 HUD 上的按鈕後把焦點還給街景，方向鍵與動作鍵才不會落在那顆按鈕上。
    els.hud.addEventListener('click', () => setTimeout(() => this.focusCanvas(), 0));

    // 第一次遊玩的互動教學：只在自由騎乘時計時與判斷，其他時候藏起來
    this.coach = createCoach({
      root: els.stage,
      engine,
      canRun: () => this.free && this.worldRunning,
      isDone: () => store.readPrefs().coachDone === true,
      markDone: () => store.writePrefs({ ...store.readPrefs(), coachDone: true }),
    });

    this.bindEngine();
    this.bindWindow();
    setInterval(() => this.updateAmbient(), AMBIENT_MS);
    setInterval(() => this.updateRide(), RIDE_TICK_MS);
    this.debug = this.createDebugApi();
  }

  // ── 狀態與存檔 ─────────────────────────────────────

  loadState() {
    const saved = this.store.read();
    if (!saved) return blankState();
    const { content } = this;
    const doneMissionIds = saved.doneMissionIds.filter((id) => content.missionById.has(id));
    const state = {
      roleId: content.roleById.has(saved.roleId) ? saved.roleId : null,
      meters: saved.meters,
      clock: saved.clock,
      doneMissionIds,
      carUnlocked: saved.carUnlocked || new Set(doneMissionIds).size >= 5, // A26
      carNoticePending: saved.carNoticePending,
      currentMissionId: content.missionById.has(saved.currentMissionId) && !doneMissionIds.includes(saved.currentMissionId) ? saved.currentMissionId : null,
      books: saved.books.filter((year) => content.bookByYear.has(year)),
      quizSeen: saved.quizSeen,
      grandma: content.grandma ? saved.grandma : { unlocked: false, on: false, templeVisits: 0 },
      relief: saved.relief,
      bond: saved.bond,
      interludesSeen: saved.interludesSeen.filter((id) => content.missionById.has(id)),
      prologueSeen: saved.prologueSeen,
      morningDone: saved.morningDone,
      side: Object.fromEntries(Object.entries(saved.side || {}).filter(([id]) => content.side.byId.has(id))),
      sideGain: { ...blankGain(), ...(saved.sideGain || {}) },
      inspiration: this.pickups.length ? (saved.inspiration || []).filter((id) => this.pickups.some((p) => p.id === id)) : saved.inspiration || [],
    };
    if (!state.roleId) return { ...blankState(), grandma: state.grandma, quizSeen: { correct: state.quizSeen.correct, asked: 0, right: 0 } };
    return state;
  }

  get role() {
    return this.content.roleById.get(this.state.roleId) || null;
  }

  /** 把目前狀態定為「存檔點」並寫入。任務進行中不會呼叫，所以重新整理會回到任務開始前。 */
  commit() {
    this.engine.setCarUnlocked?.(this.state.carUnlocked); // A26
    this.committed = clone(this.state);
    this.persist();
  }

  /** 每個步驟結束都會呼叫：寫入存檔點；阿嬤模組的解鎖與開關即時生效，一併寫入。 */
  persist() {
    // 年度重玩：進度只記在偏好的重玩紀錄裡，主線存檔原封不動（阿嬤模組的解鎖與開關照樣即時寫入）
    if (this.replay) {
      this.recordReplay();
      const g = this.state.grandma;
      const main = this.replay.main.committed;
      const was = main.grandma || {};
      if (g.unlocked !== was.unlocked || g.on !== was.on || g.templeVisits !== was.templeVisits) {
        main.grandma = { ...g };
        this.replay.main.state.grandma = { ...g };
        this.store.write({ ...main, grandma: { ...g } });
      }
      return;
    }
    this.store.write({ ...this.committed, grandma: { ...this.state.grandma } });
  }

  applyEffects(effects, { silent = false } = {}) {
    // 支線進行中：數值變化打折並受整局累計上限限制（見 side.js）
    if (this.sideRun) {
      const { applied, capped } = scaleSideEffects(effects, this.state.sideGain);
      if (capped) this.sideRun.capped = true;
      effects = applied;
    }
    const deltas = {};
    for (const id of METER_IDS) {
      const change = Number(effects?.[id]) || 0;
      if (!change) continue;
      const before = this.state.meters[id];
      const after = clamp(before + change);
      this.state.meters[id] = after;
      if (after !== before) deltas[id] = after - before;
    }
    this.hud.setMeters(this.state.meters, silent ? null : deltas);
    return deltas;
  }

  placeName(locationId) {
    return PLACES[locationId] || this.locations.get(locationId)?.name || '';
  }

  nextMission() {
    // 年度重玩：只有那一年的主線，做完就沒有下一個
    if (this.replay) return this.state.doneMissionIds.includes(this.replay.missionId) ? null : this.content.missionById.get(this.replay.missionId) || null;
    return this.content.missions.find((m) => !this.state.doneMissionIds.includes(m.id)) || null;
  }

  // ── 世界的開關 ─────────────────────────────────────

  get anyModalOpen() {
    return this.els.dialogs.some((dialog) => dialog.open);
  }

  get worldRunning() {
    return (this.free || this.flying) && !this.blurred && !this.anyModalOpen;
  }

  setFree(flag) {
    this.free = flag;
    if (!flag && this.autoOn && this.canAutoRide) this.engine.setAutoRide(false);
    this.syncWorld();
    if (flag) this.rideHint();
    else this.syncAutoRide();
  }

  syncWorld() {
    const run = this.worldRunning;
    this.engine.setPaused(!run);
    this.engine.setInputEnabled(run);
    this.els.pause.hidden = !((this.free || this.flying) && this.blurred && !this.anyModalOpen);
    // 分頁切到背景或視窗失焦：聲音全部暫停。選單開著：語音、音效與環境聲暫停，配樂留著（調音量時聽得到）。
    this.sound.setPaused(this.blurred || document.hidden ? 'all' : this.anyModalOpen ? 'menu' : 'none');
  }

  // ── 聲音 ───────────────────────────────────────────

  /** 這個說話者的語音用哪個 key 前綴：NPC 用自己的 id，主角依職能用女聲或男聲。 */
  voiceSpeaker(who) {
    if (who === 'player') return PLAYER_VOICE[this.state.roleId] || 'player_f';
    return who;
  }

  /** 給訊息與真心話用：綁定一個說話者的語音。 */
  /**
   * 算語音 key 用的文字：英日版畫面上是譯文，語音檔用中文原句（content.voiceTexts 記下的對照）。
   * {role} 已經代入，所以依目前職能把「譯文＋譯名」對到「中文＋中文職稱」；中文版原樣回傳。
   */
  voiceText(text) {
    const source = this.content.voiceTexts;
    if (!source) return text;
    const roleId = this.state.roleId || '';
    if (this.voiceMapRole !== roleId) {
      const shown = this.role?.title || '';
      const zh = source.zhRoleTitle.get(roleId) ?? shown;
      const map = new Map();
      if (shown !== zh) for (const line of source.roleTemplates) map.set(line.replaceAll('{role}', shown), line.replaceAll('{role}', zh));
      for (const [tr, line] of source.pairs) {
        const key = tr.replaceAll('{role}', shown);
        if (!map.has(key)) map.set(key, line.replaceAll('{role}', zh));
      }
      this.voiceMap = map;
      this.voiceMapRole = roleId;
    }
    return this.voiceMap.get(String(text)) ?? text;
  }

  voiceFor(who) {
    const speaker = this.voiceSpeaker(who);
    return {
      info: (text) => voiceInfo(this.assets, voiceKey(speaker, this.voiceText(text))),
      play: (text, options) => this.sound.voice.play(speaker, text, options),
      preload: (text) => this.sound.voice.preload(speaker, text),
    };
  }

  /** 標題畫面的配樂：阿嬤模組開著時換成她的那一首。 */
  playTitleMusic() {
    this.sound.music.play(this.state.grandma.on ? 'music_grandma' : 'music_title');
  }

  /** 電台真的有音樂：目前這一台循環播；關掉收音機就停。 */
  playStation() {
    const station = this.content.radio[this.radio.index];
    this.sound.music.play(!station || this.radio.off ? null : `music_${station.id}`);
  }

  setRain(on) {
    this.raining = !!on;
    this.engine.setWeather(on ? 'rain' : 'clear');
  }

  /** 環境聲：依引擎回報的 player.mode 與速度播機車引擎，下雨播雨聲，白天街頭與夜市各有一層底噪。 */
  updateAmbient() {
    const { sound, engine } = this;
    if (!this.worldRunning || this.els.hud.hidden) {
      for (const id of ['scooter', 'rain', 'bed']) sound.loop(id, null);
      this.wasRiding = false;
      return;
    }
    const me = engine.player;
    const speed = Math.abs(me.speed) || 0;
    this.topSpeed = Math.max(this.topSpeed, speed);
    const pace = Math.min(1, speed / this.topSpeed);
    const riding = me.mode === 'scooter' && speed > 3;
    const electric = me.skin === 'grandma';
    if (riding && !this.wasRiding && !electric) this.sfx.play('scooter_start');
    this.wasRiding = riding;
    sound.loop('scooter', riding ? (electric ? 'sfx_ev_hum' : 'sfx_scooter_loop') : null, { volume: 0.25 + 0.55 * pace, rate: 0.85 + 0.5 * pace });
    sound.loop('rain', this.raining ? 'sfx_rain_loop' : null, { volume: 0.6 });
    const hours = clockToHours(this.state.clock);
    const bed = me.locationId === LOC.nightMarket ? 'sfx_night_market_loop' : hours >= 6 && hours < 18 ? 'sfx_city_day_loop' : null;
    sound.loop('bed', bed, { volume: 0.35 });
  }

  /** 焦點回到該在的地方：自由騎乘時是街景（引擎才收得到鍵盤），其餘是目前畫面的主要按鈕。 */
  focusCanvas() {
    if (this.anyModalOpen) return;
    if (this.free || this.flying) this.els.canvas.focus({ preventScroll: true });
    else this.primaryButton()?.focus({ preventScroll: true });
  }

  // ── 下方提示列與動作鍵 ─────────────────────────────

  setHint(kind, data = {}) {
    this.hintState = { kind, ...data };
    this.refreshHint();
  }

  refreshHint() {
    if (this.hintState) this.hint.set(hintFor(this.hintState, this.inputMode));
  }

  /** 自由騎乘時的提示：要去哪裡、能按什麼；動作鍵有事可做或自動前往中會換字。 */
  rideHint({ remindAuto = false } = {}) {
    const target = this.objective;
    const canAuto = this.canAutoRide && !!target;
    if (remindAuto && canAuto) {
      // 提醒「可以自動前往」只維持幾秒，之後回到平常的提示。
      this.remindUntil = performance.now() + REMIND_AUTO_MS;
      clearTimeout(this.remindTimer);
      this.remindTimer = setTimeout(() => this.free && this.rideHint(), REMIND_AUTO_MS + 50);
    }
    const sideGoal = this.sideGoal();
    const goal = sideGoal ? sideGoal.locationId : target?.locationId;
    // 站在有支線（或主線加支線）的地點：就算引擎沒給提示，也告訴玩家動作鍵有事可做
    const here = this.engine.player.locationId;
    if (!this.context && here && (this.phase === 'roam' || this.phase === 'rechao') && sidesAt(this, here).length) this.context = { action: 'enter', targetId: `side@${here}`, targetName: this.placeName(here), own: true };
    else if (this.context?.own && !(here && sidesAt(this, here).length)) this.context = null;
    const sidesHere = here && (this.phase === 'roam' || this.phase === 'rechao') ? sidesAt(this, here) : [];
    const mainHere = !!target && target.locationId === here && target.kind !== 'goto';
    this.setHint('ride', {
      // 這裡有支線：動作鍵做的事寫清楚（只有一件就是接那個支線，不只一件就是看清單）
      work: !sidesHere.length ? '' : mainHere && target.kind === 'final' ? T.sideOrFinal : sidesHere.length === 1 && !mainHere ? T.sideTake : T.sideLook,
      place: goal ? this.placeName(goal) : '',
      arrived: !!goal && this.engine.player.locationId === goal,
      canAuto,
      auto: this.autoOn,
      context: this.context,
      driving: this.engine.player.mode === 'car', carUnlocked: this.state.carUnlocked, // A26
      remindAuto: canAuto && !this.autoOn && performance.now() < (this.remindUntil || 0),
    });
    this.syncAutoRide();
  }

  syncAutoRide() {
    this.hud.setAutoRide({ visible: this.free && this.canAutoRide && !!this.objective, on: this.autoOn });
  }

  toggleAutoRide() {
    if (!this.canAutoRide || !this.free) return;
    this.sfx.play('select');
    this.engine.setAutoRide(!this.autoOn);
    this.focusCanvas();
  }

  setInputMode(mode) {
    if (mode !== 'touch' && mode !== 'keyboard') return;
    if (mode === this.inputMode) return;
    this.inputMode = mode;
    this.els.stage.dataset.input = mode;
    this.refreshHint();
  }

  /** 目前畫面的主要按鈕（接下任務、繼續、跳過…）：動作鍵就是按它。 */
  primaryButton() {
    for (const root of [this.els.screen, this.els.layer]) {
      for (const button of root.querySelectorAll('[data-primary]')) {
        if (!button.disabled && button.offsetParent !== null) return button;
      }
    }
    return null;
  }

  newFlow() {
    this.flow?.abort();
    this.flow = new AbortController();
    return this.flow.signal;
  }

  abortFlow() {
    this.flow?.abort();
    this.flow = null;
    this.gotoArrive = null;
    this.offering = false;
  }

  setScreen(ui, phaseName) {
    this.screenUi?.destroy?.();
    this.screenUi = ui;
    if (phaseName) this.els.stage.dataset.phase = phaseName;
  }

  setScene(key) {
    const { scene, stage } = this.els;
    if (!key) {
      scene.hidden = true;
      scene.replaceChildren();
      delete stage.dataset.scene;
      return;
    }
    if (scene.dataset.key !== key || scene.hidden) {
      scene.dataset.key = key;
      scene.replaceChildren(this.assets.art(key, { kind: 'cover', className: 'scene-art' }), h('div', { class: 'scene-shade', 'aria-hidden': 'true' }));
    }
    scene.hidden = false;
    stage.dataset.scene = 'on';
  }

  bindWindow() {
    const { dialogs } = this.els;
    enableLightDismiss(dialogs);
    for (const dialog of dialogs) {
      dialog.addEventListener('close', () => {
        this.syncWorld();
        setTimeout(() => this.focusCanvas(), 0);
      });
    }
    const setBlur = (flag) => {
      this.blurred = flag;
      this.syncWorld();
    };
    window.addEventListener('blur', () => setBlur(true));
    window.addEventListener('focus', () => setBlur(false));
    document.addEventListener('visibilitychange', () => setBlur(document.hidden));

    // 輸入方式：引擎暫停時（對話、選單）也要跟得上，所以這裡自己再看一次。
    // 另外擋「幽靈點擊」：手指按引擎畫在右下的動作鈕時，任務卡會立刻出現，
    // 「接下任務」剛好長在手指底下，放開時那一下 click 不能算數。
    let pressing = false;
    this.ghostClick = false;
    this.guardGhostClick = () => {
      if (pressing) this.ghostClick = true;
    };
    window.addEventListener(
      'pointerdown',
      (e) => {
        pressing = true;
        this.ghostClick = false;
        this.setInputMode(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : this.inputMode);
      },
      true,
    );
    const release = () => {
      pressing = false;
      setTimeout(() => {
        this.ghostClick = false;
      }, 400);
    };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener(
      'click',
      (e) => {
        if (!this.ghostClick) return;
        this.ghostClick = false;
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );

    // 動作鍵統一：空白鍵、Enter、E 都是「繼續／確認」，按的是目前畫面的主要按鈕；
    // 抉擇與問答用數字鍵；Esc 開選單。自由騎乘時這些鍵交給引擎。
    let swallow = '';
    const inField = (el) => el instanceof HTMLElement && !!el.closest('input, select, textarea, [contenteditable], .debug');
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || inField(e.target)) return;
        this.setInputMode('keyboard');
        if (this.anyModalOpen) return;
        if (e.key === 'Escape') {
          // 大地圖開著時 Esc 交給引擎收地圖，不開選單
          if (this.mapOpen && this.free) return;
          if (this.inGame && !this.els.screen.querySelector('.cutscene')) {
            e.preventDefault();
            this.openMenu();
          }
          return;
        }
        if (this.free || this.flying) return;
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
          // 一次按鍵只前進一步：按住不放的重複觸發一律吃掉，放開之前也不再處理第二次。
          if (e.repeat || swallow) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          const primary = this.primaryButton();
          if (!primary) return;
          // 焦點在別的按鈕上時，空白鍵與 Enter 照瀏覽器原本的行為按那一顆；E 一律按主要按鈕。
          const focused = document.activeElement;
          const onOtherControl = focused instanceof HTMLElement && focused !== primary && focused.matches('button, a[href], summary');
          if (onOtherControl && e.key !== 'e' && e.key !== 'E') return;
          e.preventDefault();
          e.stopPropagation();
          swallow = e.key;
          primary.click();
          return;
        }
        if (/^[1-9]$/.test(e.key)) {
          const option = this.els.layer.querySelector(`[data-key="${e.key}"]:not([disabled])`);
          if (option && option.offsetParent !== null) {
            e.preventDefault();
            option.click();
          }
        }
      },
      true,
    );
    window.addEventListener(
      'keyup',
      (e) => {
        if (swallow && e.key === swallow) {
          swallow = '';
          e.preventDefault();
        }
      },
      true,
    );
  }

  get inGame() {
    return ['roam', 'mission', 'rechao'].includes(this.phase);
  }

  // ── 引擎事件 ───────────────────────────────────────

  bindEngine() {
    const { engine } = this;
    engine.on('marker:reach', ({ markerId }) => this.onArrive({ markerId }));
    engine.on('location:enter', ({ locationId }) => {
      this.onArrive({ locationId });
      this.onEnterLocation(locationId);
      if (this.free) this.rideHint();
    });
    engine.on('interact', (payload) => this.onInteract(payload?.kind, payload?.id, payload));
    engine.on('location:leave', () => {
      if (!this.engineHasContext) this.context = null;
      if (this.free) this.rideHint();
    });
    engine.on('context:change', (context) => {
      this.engineHasContext = true;
      this.context = context?.action ? context : null;
      if (this.free) this.rideHint();
    });
    let curbTimer; // A24 briefly show parking and mounting feedback in the hint bar
    this.carNote = text => { // A26 share the curb timer so a stale timeout cannot erase a newer hint.
      clearTimeout(curbTimer);
      this.hint.setNote(text);
      curbTimer = setTimeout(() => this.hint.setNote(null), 5500);
    };
    engine.on('curb:hint', ({kind}) => {
      clearTimeout(curbTimer);
      this.hint.setNote(curbHint(kind));
      curbTimer=setTimeout(()=>this.hint.setNote(null),3000);
    });
    engine.on('autoride:change', ({ on }) => {
      this.autoOn = !!on;
      // 限時前往途中用過自動前往，就沒有準時獎勵
      if (on && this.gotoRun) this.gotoRun.usedAuto = true;
      // 靈感：這一段取樣期間只要自動前往開過或關過，經過的就不算自己騎
      this.autoTouched = true;
      if (this.free) this.rideHint();
      else this.syncAutoRide();
    });
    engine.on('mode:change', () => { if (this.free && this.state.carUnlocked) this.rideHint(); }); // A26
    engine.on('input:mode', ({ mode }) => this.setInputMode(mode));
    engine.on('map:change', ({ open } = {}) => {
      this.mapOpen = !!open;
    });
  }

  onArrive({ markerId, locationId }) {
    if (!this.free) return;
    if (markerId === EGG_GRANDMA || (locationId === LOC.grandma && this.basketPending)) {
      this.offerBasket();
      return;
    }
    const target = this.objective;
    if (!target) return;
    const hit = markerId ? markerId === target.markerId : locationId === target.locationId;
    if (!hit) return;
    // 晨會：舊引擎抵達標記（marker:reach）就開；新引擎也可能在門口按動作鍵才開（見 onInteract）。只開一次。
    if (target.kind === 'morning') {
      if (markerId) this.startMorning();
      return;
    }
    // 任務要按動作鍵才進入（見 onInteract）；限時前往與收工是到了就算。
    if (target.kind === 'goto') this.gotoArrive?.();
    else if (target.kind === 'final' && this.phase === 'rechao') {
      // 熱炒店還有支線沒做：不直接收工，按動作鍵再選
      if (sidesAt(this, LOC.final).length) this.rideHint();
      else this.runEnding();
    }
    else if (target.kind === 'mission' && !this.engineHasContext && !this.context) {
      // 舊版引擎沒有 context:change：自己補一個「可以進入任務」的提示。
      this.context = { action: 'enter', targetId: target.markerId, targetName: target.mission.title };
      this.rideHint();
    }
  }

  /** 在任務地點按動作鍵（對著標記，或對著站在那裡的任何一位 NPC）就進入任務。 */
  tryStartMission(kind, id, payload = null) {
    const target = this.objective;
    if (target?.kind !== 'mission' || this.phase !== 'roam') return false;
    // 新引擎在建築門口按動作鍵：id 是該地點優先標記（或 null），entrance 為真，位置在這個任務的地點就算
    const atEntrance = !!payload?.entrance && payload.locationId === target.locationId;
    const atMarker = (kind === 'marker' && id === target.markerId) || atEntrance;
    const npc = kind === 'npc' ? this.content.npcById.get(id) : null;
    const atGiver = !!npc && npc.locationId === target.locationId && this.engine.player.locationId === target.locationId;
    if (!atMarker && !atGiver) return false;
    this.startMission(target.mission);
    return true;
  }

  /**
   * 這個地點有開放中的支線：只有一件事就直接開始；同時有主線（或收工）或不只一個支線，先出清單讓玩家選。
   * 主線永遠排第一個，動作鍵再按一下就是它，兩邊不會互相吃掉。
   */
  tryLocationWork(kind, id) {
    if (this.phase !== 'roam' && this.phase !== 'rechao') return false;
    const here = this.engine.player.locationId;
    if (!here) return false;
    const sides = sidesAt(this, here);
    if (!sides.length) return false;
    if (id === EGG_GRANDMA) return false;
    const npc = kind === 'npc' ? this.content.npcById.get(id) : null;
    if (kind === 'npc' && (!npc || npc.locationId !== here)) return false;
    if (npc?.skin === 'npc_grandma' && this.basketPending) return false;
    if (id === EGG_TEMPLE || (npc && npc.locationId === LOC.temple)) this.visitTemple();
    this.takeBreak(here);
    const target = this.objective;
    const main = target && target.locationId === here && (target.kind === 'mission' || target.kind === 'final') ? target : null;
    if (!main && sides.length === 1) this.startSide(sides[0]);
    else this.pickHere(here, main, sides);
    return true;
  }

  async pickHere(here, main, sides) {
    this.guardGhostClick();
    const back = this.phase;
    const signal = this.newFlow();
    this.setFree(false);
    const entries = [];
    if (main?.kind === 'mission') entries.push({ main: true, tag: T.mainTag, title: main.mission.title, sub: main.mission.clock, value: main });
    if (main?.kind === 'final') entries.push({ main: true, tag: T.finalTag, title: T.rechaoHint, sub: '', value: main });
    for (const side of sides) entries.push({ tag: `${T.sideTag}　${side.year}`, title: side.title, sub: this.content.npcById.get(side.giver)?.name || '', value: side });
    this.setHint('pick', { place: this.placeName(here), count: entries.length });
    // 選單疊在街景上：HUD 先收起來，選完再放回來
    this.hud.show(false);
    let picked;
    try {
      picked = await pickWork({ layer: this.els.layer, place: this.placeName(here), entries, signal, sfx: this.sfx });
    } catch (err) {
      if (!isAbort(err)) throw err;
      return;
    }
    this.els.layer.replaceChildren();
    this.hud.show(true);
    this.phase = back;
    if (!picked) {
      this.setFree(true);
      this.rideHint();
      this.focusCanvas();
    } else if (picked.kind === 'mission') this.startMission(picked.mission);
    else if (picked.kind === 'final') this.runEnding();
    else this.startSide(picked);
  }

  /** 從清單設為導航目標的支線（還開放著才算）。 */
  sideGoal() {
    const side = this.sideTarget ? this.content.side.byId.get(this.sideTarget) : null;
    if (!side || this.state.side[side.id] || !yearDone(this, side.year)) {
      this.sideTarget = null;
      return null;
    }
    return side;
  }

  navigateSide(id) {
    this.sideTarget = id || null;
    this.showTask();
    this.refreshMarkers();
    if (this.free) this.rideHint();
  }

  /** HUD 的任務牌：有導航中的支線就顯示它，否則是主線（或收工）。 */
  showTask() {
    const side = this.sideGoal();
    const target = this.objective;
    if (side) this.hud.setTask(`${T.sideTag}　${side.title}`, this.placeName(side.locationId));
    else if (target?.kind === 'morning') this.hud.setTask(T.morningTitle, `${this.morning.clock}　${this.placeName(target.locationId)}`);
    else if (target?.kind === 'mission') this.hud.setTask(target.mission.title, `${target.mission.clock}　${this.placeName(target.locationId)}`);
    else if (target?.kind === 'final') this.hud.setTask(this.placeName(LOC.final), T.rechaoHint);
    else if (this.replay) this.hud.setTask(T.replay.task(this.replay.year), T.replay.taskHint(this.replaySidesLeft()));
  }

  async startSide(side) {
    if (this.phase !== 'roam' && this.phase !== 'rechao') return;
    this.guardGhostClick();
    this.phase = 'mission';
    this.setFree(false);
    const signal = this.newFlow();
    this.sideRun = { id: side.id, capped: false };
    try {
      await this.runSide(side, signal);
    } catch (err) {
      if (!isAbort(err)) throw err;
    } finally {
      if (this.sideRun?.id === side.id) this.sideRun = null;
    }
  }

  /**
   * 支線：任務卡 → 對話 → 抉擇 → 問答 → 章節卡。背景是那個地點的插畫；不推進主線的時鐘。
   * 做完才寫進存檔；做到一半離開或重新整理，數值回到開始前，下次從頭來。
   */
  async runSide(side, signal) {
    const { layer } = this.els;
    const before = { ...this.state.meters };
    const ctx = { perkUsed: true, option: -1, quiz: false };
    const giver = this.content.npcById.get(side.giver);
    const place = this.placeName(side.locationId);
    const chapters = chapterTitles(this, side);
    this.hud.setTask(`${T.sideTag}　${side.title}`, '');
    this.setScene(side.splash);
    this.setHint('card');
    await showMissionCard({ layer, mission: { ...side, clock: '' }, place, giver, kind: T.sideSlip, chapters, signal, sfx: this.sfx });
    for (const step of side.steps) {
      await this.runStep(side, step, ctx, signal);
      if (this.state.meters.liver >= 100) {
        this.sideRun = null;
        this.runEnding({ forced: true });
        return;
      }
    }
    this.applyEffects(side.reward, { silent: true });
    const capped = !!this.sideRun?.capped;
    this.sideRun = null;
    this.state.side[side.id] = { option: ctx.option, quiz: !!ctx.quiz };
    if (this.sideTarget === side.id) this.sideTarget = null;
    this.commit();
    const deltas = {};
    for (const id of METER_IDS) if (this.state.meters[id] !== before[id]) deltas[id] = this.state.meters[id] - before[id];
    this.setScene(side.splash);
    this.setHint('clear');
    await showChapterCard({ layer, side, card: side.card, chapters, deltas, capped, signal, sfx: this.sfx });
    layer.replaceChildren();
    this.setScene(null);
    this.phase = 'roam';
    if (this.nextMission()) this.nextObjective();
    else this.guideToFinal({ auto: false });
  }

  onEnterLocation(locationId) {
    if (this.free && locationId === LOC.temple) this.sfx.play('temple_bell');
    if (!this.free || this.phase !== 'roam') return;
    const npc = sample(this.activeNpcs().filter((n) => n.locationId === locationId));
    if (npc) this.npcSays(npc);
  }

  onInteract(kind, id, payload = null) {
    if (!this.free) return;
    if (this.tryLocationWork(kind, id)) return;
    if (this.tryMorning(kind, id, payload)) return;
    if (this.tryStartMission(kind, id, payload)) return;
    if (this.officeReply(kind, payload)) return;
    if (kind === 'marker') {
      if (id === EGG_TEMPLE) this.visitTemple();
      else {
        this.takeBreak(this.engine.player.locationId);
        this.onArrive({ markerId: id });
      }
      return;
    }
    const npc = this.content.npcById.get(id);
    if (!npc) return;
    if (npc.skin === 'npc_grandma' && this.basketPending) {
      this.offerBasket();
      return;
    }
    if (npc.locationId === LOC.temple) this.visitTemple();
    this.takeBreak(npc.locationId);
    this.npcSays(npc);
  }

  /** 降肝：河濱互動一次、三個吃東西的地點各一次，每個地點一輪只算一次（契約 3.4）。 */
  takeBreak(locationId) {
    const relief = RELIEF[locationId];
    if (!relief || this.state.relief.includes(locationId)) return;
    this.state.relief.push(locationId);
    const deltas = this.applyEffects({ liver: relief });
    this.sfx.play('right');
    // 小卡：那個地點的插畫當背景；清單裡沒有圖就照舊是一行字
    const artKey = `loc_${locationId}`;
    if (this.assets.imageSrc(artKey)) this.toast(`${T.relief}　${this.describe(deltas)}`, { tone: 'good', ms: 3600, title: this.placeName(locationId), art: this.assets.art(artKey, { kind: 'cover' }) });
    else this.toast(`${this.placeName(locationId)}　${T.relief}　${this.describe(deltas)}`.trim(), { tone: 'good' });
    if (this.phase !== 'mission') this.commit();
  }

  npcSays(npc) {
    const line = this.state.grandma.on ? sample(this.content.grandma?.greetings) || sample(npc.lines) : sample(npc.lines);
    if (line) this.engine.say(npc.id, line.replaceAll('{role}', this.role?.title || ''), 3200);
  }

  // ── 標題 ───────────────────────────────────────────

  showTitle() {
    this.coach?.stop('title');
    this.abortFlow();
    this.phase = 'title';
    this.objective = null;
    this.setFree(false);
    this.setScene(null);
    this.hud.show(false);
    this.els.layer.replaceChildren();
    const grandma = this.content.grandma;
    this.setScreen(
      showTitle({
        screen: this.els.screen,
        assets: this.assets,
        canContinue: !!this.committed.roleId,
        continueNote: this.committed.roleId ? `${this.content.roleById.get(this.committed.roleId)?.title || ''}・${this.committed.clock}` : '',
        grandmaOn: this.state.grandma.on,
        secretCode: grandma?.unlock?.titleCode,
        badge: this.content.source === 'fixtures' ? T.fixturesBadge : '',
        onStart: () => this.startNew(),
        onContinue: () => this.continueRun(),
        onProposal: () => this.openProposal(),
        onYears: this.hasFinished() ? () => this.showYears() : null,
        onSecret: grandma ? () => this.unlockGrandma() : null,
      }),
      'title',
    );
    this.setHint('title', { canContinue: !!this.committed.roleId });
    this.applyLook();
    this.playTitleMusic();
  }

  // ── 年度選擇與年度重玩（LAUNCH_READINESS #10）──────────────

  /** 破關過一次（看過任何一個結局）：偏好裡記過，或主線存檔九個任務都做完（這個功能上線前就破關的存檔）。 */
  hasFinished() {
    if (this.store.readPrefs().finished === true) return true;
    const done = new Set(this.committed.doneMissionIds || []);
    return this.content.missions.length > 0 && this.content.missions.every((m) => done.has(m.id));
  }

  /** 偏好裡的重玩紀錄：{ <年份>: { done, sides: [支線 id] } }。 */
  replayRecords() {
    const raw = this.store.readPrefs().replay;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }

  writeReplayRecord(year, { done = false, sides = [] }) {
    const prefs = this.store.readPrefs();
    const records = prefs.replay && typeof prefs.replay === 'object' && !Array.isArray(prefs.replay) ? { ...prefs.replay } : {};
    const old = records[year] || {};
    const merged = { done: !!old.done || !!done, sides: [...new Set([...(Array.isArray(old.sides) ? old.sides : []), ...sides])] };
    if (merged.done === !!old.done && merged.sides.length === (old.sides || []).length) return;
    records[year] = merged;
    this.store.writePrefs({ ...prefs, replay: records });
  }

  /** 重玩進行中：把那一年的主線與支線完成狀態併進偏好的紀錄。 */
  recordReplay() {
    const r = this.replay;
    if (!r) return;
    const sides = this.content.side.missions.filter((side) => side.year === r.year && this.state.side[side.id]).map((side) => side.id);
    this.writeReplayRecord(r.year, { done: this.state.doneMissionIds.includes(r.missionId), sides });
  }

  /** 看到結局：記下「破關過」與職能，主線這一輪完成的年份與支線也併進年度紀錄。 */
  recordFinished() {
    const prefs = this.store.readPrefs();
    this.store.writePrefs({ ...prefs, finished: true, lastRole: this.state.roleId || prefs.lastRole || null });
    for (const mission of this.content.missions) {
      const sides = this.content.side.missions.filter((side) => side.year === mission.year && this.state.side[side.id]).map((side) => side.id);
      const done = this.state.doneMissionIds.includes(mission.id);
      if (done || sides.length) this.writeReplayRecord(mission.year, { done, sides });
    }
  }

  /** 年度選擇的九張卡：完成與否、支線件數都是「主線存檔 ∪ 重玩紀錄」。 */
  yearCards() {
    const records = this.replayRecords();
    const main = this.replay ? this.replay.main.committed : this.committed;
    return this.content.missions.map((mission) => {
      const record = records[mission.year] || {};
      const sides = this.content.side.missions.filter((side) => side.year === mission.year);
      const doneSides = new Set([...(Array.isArray(record.sides) ? record.sides : []), ...Object.keys(main.side || {})]);
      return {
        year: mission.year,
        title: mission.title,
        splash: mission.splash,
        done: !!record.done || (main.doneMissionIds || []).includes(mission.id),
        sidesDone: sides.filter((side) => doneSides.has(side.id)).length,
        sidesTotal: sides.length,
      };
    });
  }

  showYears({ result = null } = {}) {
    if (!this.hasFinished()) {
      this.showTitle();
      return;
    }
    this.coach?.stop('title');
    this.abortFlow();
    this.phase = 'years';
    this.objective = null;
    this.setFree(false);
    this.setScene(null);
    this.hud.show(false);
    this.els.layer.replaceChildren();
    this.setScreen(
      showYearSelect({
        screen: this.els.screen,
        assets: this.assets,
        years: this.yearCards(),
        result,
        onPick: (year) => this.startReplay(year),
        onBack: () => this.showTitle(),
      }),
      'title',
    );
    this.setHint('years');
    this.playTitleMusic();
  }

  /** 重玩那一年還沒做的支線件數。 */
  replaySidesLeft() {
    const r = this.replay;
    if (!r) return 0;
    return this.content.side.missions.filter((side) => side.year === r.year && !this.state.side[side.id]).length;
  }

  /**
   * 單獨重玩某一年：用另一份狀態跑，主線存檔不動。前面幾年當作做完（序幕、晨會、過場都跳過），
   * 從前一個任務的地點出發；數值是職能的起始值往那個時段推一點。
   */
  startReplay(year) {
    const { content } = this;
    const mission = content.missions.find((m) => m.year === Number(year));
    if (!mission || this.replay) return;
    const prefs = this.store.readPrefs();
    const roleId = [this.committed.roleId, prefs.lastRole, content.roles[0]?.id].find((id) => id && content.roleById.has(id));
    if (!roleId) return;
    const main = { state: clone(this.state), committed: clone(this.committed) };
    const index = content.missions.indexOf(mission);
    const earlier = content.missions.slice(0, index);
    const run = this.freshRun(roleId);
    for (const id of METER_IDS) run.meters[id] = clamp(run.meters[id] + REPLAY_DRIFT[id] * index);
    run.doneMissionIds = earlier.map((m) => m.id);
    run.books = earlier.map((m) => m.year).filter((y) => content.bookByYear.has(y));
    run.interludesSeen = earlier.map((m) => m.id).filter((id) => content.interludeByMission.has(id));
    run.prologueSeen = true;
    run.morningDone = true;
    run.carUnlocked = true;
    run.clock = earlier.length ? this.clockAfter(earlier[earlier.length - 1]) : START_CLOCK;
    run.grandma = { ...this.state.grandma };
    this.replay = { year: mission.year, missionId: mission.id, title: mission.title, start: { ...run.meters }, punctual: 0, inspiration: 0, main };
    this.state = run;
    this.committed = clone(run);
    this.engine.setCarUnlocked?.(true);
    this.sideTarget = null;
    this.newFlow();
    this.refreshNpcs();
    this.enterWorld({ at: earlier.length ? earlier[earlier.length - 1].locationId : LOC.home });
    // 開場提醒放在提示列（小卡會疊在手機的任務牌上）
    this.carNote(T.replay.started(mission.year));
  }

  /** 重玩的主線做完：那一年還有支線就讓玩家去補（選單可以結束），全部做完就直接結算。 */
  replayRoam() {
    if (!this.replaySidesLeft()) {
      this.finishReplay();
      return;
    }
    this.phase = 'roam';
    this.objective = null;
    this.refreshMarkers();
    if (!this.sideGoal()) this.engine.setWaypoint(null);
    this.showTask();
    this.setFree(true);
    this.focusCanvas();
    if (!this.replay.roamNoted) {
      this.replay.roamNoted = true;
      this.toast(T.replay.mainDone, { tone: 'good', ms: 5200 });
    }
  }

  /** 結束重玩：算出結果、還原主線存檔的狀態，回到年度選擇並顯示結果卡。 */
  finishReplay({ forced = false } = {}) {
    const r = this.replay;
    if (!r) return;
    this.recordReplay();
    const deltas = {};
    for (const id of METER_IDS) deltas[id] = this.state.meters[id] - r.start[id];
    const sides = this.content.side.missions.filter((side) => side.year === r.year);
    const result = {
      year: r.year,
      title: r.title,
      cleared: this.state.doneMissionIds.includes(r.missionId),
      forced,
      deltas,
      sidesDone: sides.filter((side) => this.state.side[side.id]).length,
      sidesTotal: sides.length,
      punctual: r.punctual,
      inspiration: r.inspiration,
    };
    this.abortFlow();
    this.sideRun = null;
    this.sideTarget = null;
    const grandma = { ...this.state.grandma };
    this.state = { ...r.main.state, grandma };
    this.applyRoleScript();
    this.committed = { ...r.main.committed, grandma };
    this.replay = null;
    this.engine.setCarUnlocked?.(this.state.carUnlocked);
    this.engine.setMarkers([]);
    this.engine.setWaypoint(null);
    this.setRain(false);
    this.hud.setTask('', '');
    this.els.toasts.replaceChildren();
    this.refreshNpcs();
    this.lastReplay = result;
    this.showYears({ result });
  }

  async startNew() {
    if (this.committed.roleId) {
      const ok = await askConfirm({ dialog: this.els.confirm, question: T.restartAsk, yes: T.restartYes, no: T.restartNo });
      if (!ok) return;
    }
    this.showRoles();
  }

  showRoles() {
    this.coach?.stop('title');
    this.abortFlow();
    this.phase = 'select';
    this.setFree(false);
    this.setScene(null);
    this.hud.show(false);
    this.els.layer.replaceChildren();
    this.setScreen(
      showRoleSelect({
        screen: this.els.screen,
        assets: this.assets,
        roles: this.content.roles,
        sfx: this.sfx,
        onPick: (role) => this.beginRun(role),
        onBack: () => this.showTitle(),
      }),
      'select',
    );
    this.setHint('roles');
    this.playTitleMusic();
  }

  /**
   * 職能劇本：把任務清單換成這個職能自己的劇情（content.roleMissions）。原地替換陣列元素與索引，
   * 其他地方拿著 content.missions／missionById 的參照不必改。沒有該職能的劇本就用通用版。
   */
  applyRoleScript(roleId = this.state.roleId) {
    const content = this.content;
    const key = roleId && content.roleMissions?.has(roleId) ? roleId : '';
    if (this.scriptRole === key || !content.baseMissions) return;
    this.scriptRole = key;
    const list = key ? content.roleMissions.get(key) : content.baseMissions;
    content.missions.splice(0, content.missions.length, ...list);
    content.missionById.clear();
    for (const m of list) content.missionById.set(m.id, m);
    // 過場：客戶真心話與阿凱的回應也換成這個職能的版本；阿嬤訊息與年鑑標題照舊
    if (content.baseInterludes) {
      const lines = key ? content.roleInterludes?.get(key) : null;
      content.interludeByMission.clear();
      for (const item of content.baseInterludes) {
        const own = lines?.get(item.after);
        content.interludeByMission.set(item.after, own ? { ...item, sincere: own.sincere, partner: own.partner } : item);
      }
    }
  }

  freshRun(roleId) {
    this.applyRoleScript(roleId);
    const role = this.content.roleById.get(roleId);
    const meters = {};
    for (const id of METER_IDS) meters[id] = clamp(Number(role.start?.[id]) || 0);
    return {
      ...blankState(),
      roleId,
      meters,
      quizSeen: { correct: [...this.state.quizSeen.correct], asked: 0, right: 0 },
      grandma: { ...this.state.grandma },
    };
  }

  async beginRun(role) {
    this.state = this.freshRun(role.id);
    this.commit();
    const signal = this.newFlow();
    await this.openDay(signal);
  }

  /** 一天的開頭：序幕（只播一次）、開場影片，然後進城市。 */
  async openDay(signal) {
    this.phase = 'story';
    this.setFree(false);
    this.hud.show(false);
    this.setScreen(null, 'play');
    this.els.screen.replaceChildren();
    try {
      if (!this.state.prologueSeen) {
        await playPrologue(this, signal);
        this.state.prologueSeen = true;
        this.commit();
      }
      await this.playVideo('intro', signal);
    } catch (err) {
      if (isAbort(err)) return;
      throw err;
    }
    this.enterWorld({ at: LOC.home });
  }

  continueRun() {
    if (!this.committed.roleId) return;
    this.state = { ...clone(this.committed), grandma: { ...this.state.grandma } };
    this.applyRoleScript();
    const { content, state } = this;
    const signal = this.newFlow();
    // 序幕還沒看完就離開的：從序幕重來。
    if (!state.prologueSeen && state.doneMissionIds.length === 0 && content.story.prologue?.length) {
      this.openDay(signal);
      return;
    }
    const done = content.missions.filter((m) => state.doneMissionIds.includes(m.id));
    const lastDone = done[done.length - 1];
    const current = content.missionById.get(state.currentMissionId) || null;
    // 過場播到一半（阿嬤的訊息還沒回）就離開的：回來先把那段過場補完，再往下一個任務。
    const pending = !current && lastDone && content.interludeByMission.has(lastDone.id) && !state.interludesSeen.includes(lastDone.id) ? lastDone : null;
    const at = current ? current.locationId : lastDone?.locationId || LOC.home;
    this.enterWorld({ at, resume: current, pendingInterlude: pending });
  }

  enterWorld({ at, resume = null, pendingInterlude = null }) {
    const { engine, state } = this;
    this.setScreen(null, 'play');
    this.els.screen.replaceChildren();
    this.hud.show(true);
    this.hud.setClock(state.clock);
    this.hud.setMeters(state.meters);
    engine.setTimeOfDay(clockToHours(state.clock));
    engine.teleportTo(at);
    this.applyLook();
    this.phase = 'roam';
    if (pendingInterlude) {
      this.resumeInterlude(pendingInterlude);
      return;
    }
    this.nextObjective({ resume });
    this.flashHintOnce();
  }

  flashHintOnce() {
    if (this.enteredWorld || !this.free) return;
    // 第一次進城市：提示列放大閃一下，之後維持低調。
    this.enteredWorld = true;
    this.hint.flash();
  }

  async resumeInterlude(mission) {
    this.phase = 'mission';
    this.setFree(false);
    this.hud.setTask(mission.title, '');
    let notifyCar; // A26
    try {
      notifyCar = await this.afterMission(mission, this.flow.signal);
    } catch (err) {
      if (isAbort(err)) return;
      throw err;
    }
    this.phase = 'roam';
    this.nextObjective();
    this.flashHintOnce();
    if (notifyCar) this.carNote(T.carAward); // A26
  }

  /** 過關畫面之後：過場（提案入手、真心話被打斷、搭檔與阿嬤的訊息），再播任務結尾的過場影片。 */
  async afterMission(mission, signal) {
    const notifyCar = this.state.carNoticePending; // A26 resume a saved reward even after reloading the results screen.
    if (notifyCar) {
      await playLines(this, [{ who: 'data_kai', via: 'line', text: T.carMessage }], { sceneKey: mission.splash, signal });
      this.state.carNoticePending = false;
      this.commit();
    }
    const interlude = await playInterlude(this, mission, signal);
    // 被午後雷陣雨打斷之後，到下一個任務開始前都在下雨。
    if (interlude?.kind === 'thunder') this.setRain(true);
    this.els.layer.replaceChildren();
    this.setScene(null);
    for (const step of mission.steps.filter((item, i, all) => item.type === 'cutscene' && all.slice(i).every((later) => later.type === 'cutscene'))) {
      await this.playVideo(step.video, signal);
    }
    return notifyCar; // A26
  }

  /**
   * 接下任務之後先來一段該地點的空拍（引擎有 flyover 才播）。
   * 期間世界照常跑、HUD 收起來，只留下方提示列；動作鍵由引擎自己接，用來提前結束。
   */
  async flyover(locationId, signal) {
    const { engine } = this;
    if (typeof engine.flyover !== 'function') return;
    this.flying = true;
    this.els.stage.dataset.flyover = 'on';
    this.hud.show(false);
    this.els.layer.replaceChildren();
    this.setScene(null);
    this.setHint('flyover', { place: this.placeName(locationId) });
    this.syncWorld();
    this.focusCanvas();
    try {
      await interaction(signal, (done) => {
        const onEnd = () => done();
        engine.on('flyover:end', onEnd);
        const guard = setTimeout(done, FLYOVER_GUARD_MS);
        Promise.resolve()
          .then(() => engine.flyover(locationId))
          .then(done, done);
        return () => {
          clearTimeout(guard);
          engine.off('flyover:end', onEnd);
        };
      });
    } finally {
      this.flying = false;
      delete this.els.stage.dataset.flyover;
      this.hud.show(true);
      this.syncWorld();
    }
  }

  /** 播過場影片；清單裡有這支才換提示列（沒有的話馬上就過了）。 */
  async playVideo(key, signal) {
    if (this.assets.video(key)) this.setHint('cutscene');
    return playCutscene({ screen: this.els.screen, assets: this.assets, key, signal });
  }

  // ── 一天的推進 ─────────────────────────────────────

  nextObjective({ resume = null } = {}) {
    this.els.layer.replaceChildren();
    this.setScene(null);
    if (this.state.meters.liver >= 100) {
      this.runEnding({ forced: true });
      return;
    }
    const mission = this.nextMission();
    if (!mission) {
      this.guideToFinal();
      return;
    }
    this.phase = 'roam';
    // 序幕之後、第一個任務之前：先去 A25 開晨會（內容沒有晨會就略過）
    if (this.morningPending) {
      this.objective = { kind: 'morning', markerId: MORNING_MARKER, locationId: LOC.office };
      this.refreshMarkers();
      this.engine.setWaypoint(MORNING_MARKER);
      this.showTask();
      this.tuneRadio(mission.year);
      this.setFree(true);
      this.focusCanvas();
      // 序幕之後第一次能自由移動：前往晨會的路上開始互動教學（偏好裡記過就不再出現）
      this.coach.start();
      return;
    }
    this.objective = { kind: 'mission', mission, markerId: mission.id, locationId: mission.locationId };
    this.refreshMarkers();
    this.engine.setWaypoint(mission.id);
    this.showTask();
    this.tuneRadio(mission.year);
    this.setFree(true);
    this.focusCanvas();
    if (resume === mission) this.startMission(mission, { resume: true });
  }

  guideToFinal({ auto = true } = {}) {
    // 年度重玩沒有收工：主線做完就去補支線或結算
    if (this.replay) {
      this.replayRoam();
      return;
    }
    this.phase = 'rechao';
    this.objective = { kind: 'final', markerId: FINAL_MARKER, locationId: LOC.final };
    this.refreshMarkers();
    this.engine.setWaypoint(FINAL_MARKER);
    this.showTask();
    this.setFree(true);
    this.focusCanvas();
    // 人已經在熱炒店：直接收工；但那裡還有支線、或剛做完一個支線，就等玩家自己按
    if (auto && this.engine.player.locationId === LOC.final && !sidesAt(this, LOC.final).length) this.runEnding();
  }

  refreshMarkers() {
    const markers = [];
    const target = this.objective;
    if (target?.kind === 'morning') markers.push({ id: MORNING_MARKER, locationId: target.locationId, kind: 'mission', label: T.morningTitle });
    else if (target?.kind === 'mission') markers.push({ id: target.markerId, locationId: target.locationId, kind: 'mission', label: target.mission.title });
    else if (target?.kind === 'goto') markers.push({ id: GOTO_MARKER, locationId: target.locationId, kind: 'mission', label: this.placeName(target.locationId) });
    else if (target?.kind === 'final') markers.push({ id: FINAL_MARKER, locationId: LOC.final, kind: 'home', label: this.placeName(LOC.final) });
    const grandma = this.content.grandma;
    if (grandma && !this.state.grandma.unlocked) {
      if (this.basketPending) markers.push({ id: EGG_GRANDMA, locationId: LOC.grandma, kind: 'egg', label: '' });
      else markers.push({ id: EGG_TEMPLE, locationId: LOC.temple, kind: 'egg', label: '' });
    }
    // 支線：開放中、還沒做的，一個地點一顆 side 標記（那裡有幾件就寫幾件）。主線標記所在的地點不另外放，免得搶走互動。
    const byPlace = new Map();
    for (const side of openSides(this)) byPlace.set(side.locationId, [...(byPlace.get(side.locationId) || []), side]);
    for (const [locationId, list] of byPlace) {
      if (target && target.locationId === locationId) continue;
      markers.push({ id: `side@${locationId}`, locationId, kind: 'side', label: list.length === 1 ? list[0].title : T.sideMarker(list.length), count: list.length });
    }
    this.engine.setMarkers(markers);
    const goal = this.sideGoal();
    const goalMarker = goal ? (target && target.locationId === goal.locationId ? target.markerId : `side@${goal.locationId}`) : null;
    if (goalMarker) this.engine.setWaypoint(goalMarker);
    else if (target) this.engine.setWaypoint(target.markerId);
  }

  /** 阿嬤要等廟口拜滿次數才出現在柑仔店；阿嬤模組開著時玩家自己就是阿嬤，所以不重複放。 */
  activeNpcs() {
    const g = this.state.grandma;
    return this.content.npcs.filter((npc) => {
      // 支線帶進來的人物：那一年開放之後才出現在街上
      if (npc.sideYear) return yearDone(this, npc.sideYear);
      if (npc.skin !== 'npc_grandma') return true;
      return this.basketPending || (g.unlocked && !g.on);
    });
  }

  refreshNpcs() {
    this.engine.setNpcs(this.activeNpcs().map((npc) => ({ id: npc.id, locationId: npc.locationId, skin: npc.skin, name: npc.name })));
  }

  // ── 任務 ───────────────────────────────────────────

  // ── 晨會 ───────────────────────────────────────────

  /** 晨會內容（story.json 的 morning）；沒有就是 null，整段略過。 */
  get morning() {
    const morning = this.content.story?.morning;
    return Array.isArray(morning?.lines) && morning.lines.length ? morning : null;
  }

  get morningPending() {
    return !!this.morning && !this.state.morningDone;
  }

  /** 在 A25：對著晨會標記、對著站在那裡的同事、或在門口（新引擎的 entrance）按動作鍵。 */
  tryMorning(kind, id, payload) {
    const target = this.objective;
    if (target?.kind !== 'morning' || this.phase !== 'roam') return false;
    const npc = kind === 'npc' ? this.content.npcById.get(id) : null;
    const atGiver = !!npc && npc.locationId === target.locationId && this.engine.player.locationId === target.locationId;
    const atMarker = kind === 'marker' && id === MORNING_MARKER;
    const atEntrance = !!payload?.entrance && payload.locationId === target.locationId;
    if (!atMarker && !atEntrance && !atGiver) return false;
    this.startMorning();
    return true;
  }

  /** 晨會：會議室劇照＋字幕，不給分、不計時、不動時鐘。播完記進存檔，標記換成第一個任務。 */
  async startMorning() {
    if (this.phase !== 'roam' || this.objective?.kind !== 'morning' || !this.free) return;
    this.guardGhostClick();
    this.phase = 'story';
    this.setFree(false);
    this.hud.show(false);
    this.sfx.play('elevator');
    const signal = this.newFlow();
    try {
      await playMorning(this, signal);
    } catch (err) {
      if (isAbort(err)) return;
      throw err;
    }
    this.state.morningDone = true;
    this.commit();
    this.hud.show(true);
    this.phase = 'roam';
    this.nextObjective();
  }

  /** 晨會之後再到 A25 門口按動作鍵、那裡沒有任務也沒有支線：同事回一句，用小卡顯示，不能毫無反應。 */
  officeReply(kind, payload) {
    if (kind !== 'marker' || !payload?.entrance || payload.locationId !== LOC.office) return false;
    if (this.phase !== 'roam' && this.phase !== 'rechao') return false;
    const pool = this.content.story?.morning?.back;
    if (!pool?.length) return false;
    const now = performance.now();
    if (now - (this.officeReplyAt || 0) < OFFICE_REPLY_MS) return true;
    this.officeReplyAt = now;
    // 同一句不連著出現
    const choices = pool.length > 1 ? pool.filter((line) => line.text !== this.officeLast) : pool;
    const line = sample(choices);
    this.officeLast = line.text;
    this.sfx.play('select');
    const who = this.speakerOf(line.who);
    this.voiceFor(line.who).play(line.text);
    const art = this.assets.imageSrc('loc_office') ? this.assets.art('loc_office', { kind: 'cover' }) : null;
    if (art) this.toast(line.text, { tone: 'plain', ms: 3800, title: who.name, art });
    else this.toast(`${who.name}　${line.text}`);
    return true;
  }

  async startMission(mission, { resume = false } = {}) {
    if (this.phase !== 'roam') return;
    this.guardGhostClick();
    this.phase = 'mission';
    this.setFree(false);
    if (this.raining) this.setRain(false);
    if (mission.locationId === LOC.office) this.sfx.play('elevator');
    this.state.clock = mission.clock;
    this.state.currentMissionId = mission.id;
    this.hud.setClock(mission.clock);
    this.engine.setTimeOfDay(clockToHours(mission.clock));
    this.commit();
    const signal = this.newFlow();
    try {
      await this.runMission(mission, signal, { resume });
    } catch (err) {
      if (!isAbort(err)) throw err;
    }
  }

  async runMission(mission, signal, { resume = false } = {}) {
    const { layer } = this.els;
    const before = { ...this.state.meters };
    const ctx = { perkUsed: false };
    const giver = this.content.npcById.get(mission.giver);
    const place = this.placeName(mission.locationId);

    this.hud.setTask(mission.title, '');
    // 重新整理後回到任務的，直接從任務卡開始；第一次進來才有空拍與「那一年的台灣網路」。
    if (!resume) {
      await this.flyover(mission.locationId, signal);
      this.setScene(mission.splash);
      await playFeedFor(this, mission, signal);
    }
    this.setScene(mission.splash);
    this.setHint('card');
    await showMissionCard({ layer, mission, place, giver, signal, sfx: this.sfx });

    // 結尾的過場影片留到過關畫面與過場之後才播（見 afterMission）。
    const steps = [...mission.steps];
    while (steps.length && steps[steps.length - 1].type === 'cutscene') steps.pop();

    for (const step of steps) {
      await this.runStep(mission, step, ctx, signal);
      this.persist();
      if (this.state.meters.liver >= 100) {
        this.runEnding({ forced: true });
        return;
      }
    }

    this.applyEffects(mission.reward, { silent: true });
    const book = this.content.bookByYear.get(mission.year) || null;
    if (book && !this.state.books.includes(book.year)) this.state.books.push(book.year);
    this.state.doneMissionIds.push(mission.id);
    const awardCar = !this.state.carUnlocked && this.state.doneMissionIds.length >= 5; // A26
    if (awardCar) this.state.carUnlocked = this.state.carNoticePending = true;
    this.state.currentMissionId = null;
    this.refreshNpcs();
    this.state.clock = this.clockAfter(mission);
    this.hud.setClock(this.state.clock);
    this.engine.setTimeOfDay(clockToHours(this.state.clock));
    this.commit();

    this.setScene(mission.splash);
    this.setHint('clear');
    const hasInterlude = this.content.interludeByMission.has(mission.id);
    await showMissionClear({ layer, assets: this.assets, mission, place, before, after: { ...this.state.meters }, book: hasInterlude ? null : book, signal, sfx: this.sfx });
    const notifyCar = await this.afterMission(mission, signal); // A26

    this.phase = 'roam';
    this.nextObjective();
    if (notifyCar) this.carNote(T.carAward); // A26
    const opened = this.content.side.missions.filter((side) => side.year === mission.year).length;
    if (opened && this.free) this.toast(T.sideOpened(mission.year, opened), { tone: 'good', ms: 4200 });
  }

  clockAfter(mission) {
    const start = clockToHours(mission.clock);
    const index = this.content.missions.indexOf(mission);
    const following = this.content.missions[index + 1];
    let end = start + HOURS_AFTER_MISSION;
    if (following) {
      const nextStart = clockToHours(following.clock);
      if (nextStart > start && end >= nextStart) end = (start + nextStart) / 2;
    }
    return hoursToClock(end);
  }

  runStep(mission, step, ctx, signal) {
    switch (step.type) {
      case 'dialogue':
        return this.stepDialogue(mission, step, ctx, signal);
      case 'goto':
        return this.stepGoto(mission, step, signal);
      case 'choice':
        return this.stepChoice(mission, step, signal, ctx);
      case 'quiz':
        return this.stepQuiz(mission, step, signal, ctx);
      case 'cutscene':
        this.els.layer.replaceChildren();
        return this.playVideo(step.video, signal);
      default:
        return Promise.resolve();
    }
  }

  /** 這個人的頭像 key（avatar_<npcId>；主角依職能用 player_f 或 player_m）。清單裡沒有就回傳 null，由呼叫的地方退回原本的做法。 */
  avatarKey(who) {
    let id = who;
    if (who === 'player') id = PLAYER_VOICE[this.state.roleId] || 'player_f';
    else if (who === 'grandma' && !this.content.npcById.has(who)) id = this.content.npcs.find((n) => n.skin === 'npc_grandma')?.id || who;
    const key = `avatar_${id}`;
    return id && this.assets.hasImage(key) ? key : null;
  }

  speakerOf(who) {
    const role = this.role;
    const avatar = this.avatarKey(who);
    if (who === 'player') return { name: role?.title || '', title: '', isPlayer: true, avatar };
    const npc = this.content.npcById.get(who);
    if (npc) {
      // 搭檔跟玩家同一個職能時，只顯示名字，不標職稱（台詞不動）
      const partnerId = this.content.story?.cast?.find((member) => member.id === 'partner')?.npcId;
      const sameJob = who === partnerId && !!npc.title && npc.title === role?.title;
      return { name: npc.name, title: sameJob ? '' : npc.title || '', avatar };
    }
    if (who === 'grandma') {
      const elder = this.content.npcs.find((n) => n.skin === 'npc_grandma');
      return { name: elder?.name || T.grandmaName, title: elder?.title || '', avatar };
    }
    return { name: who || '', title: '', avatar };
  }

  fillLines(lines) {
    const title = this.role?.title || '';
    return (lines || []).map((line) => ({ who: line.who, text: String(line.text || '').replaceAll('{role}', title) }));
  }

  stepDialogue(mission, step, ctx, signal) {
    const role = this.role;
    let extra = null;
    // 業務 AE：每個任務的對話裡多一次「安撫客戶」的機會。
    if (role?.id === 'ae' && role.perk?.name && !ctx.perkUsed) {
      extra = {
        label: role.perk.name,
        onUse: () => {
          ctx.perkUsed = true;
          const deltas = this.applyEffects(AE_CALM_EFFECTS);
          this.sfx.play('right');
          this.toast(`${role.perk.name}　${this.describe(deltas)}`, { tone: 'good' });
        },
      };
    }
    this.setScene(mission.splash);
    // 逐句查語音檔：有就播，沒有就只出字幕
    return this.talk(this.fillLines(step.lines), { extra, signal, fallbackName: this.content.npcById.get(mission.giver)?.name });
  }

  /** 字幕式對話，提示列左段跟著說話的對象換（玩家自己說話時沿用上一位）。 */
  talk(lines, { extra = null, signal, fallbackName = '' } = {}) {
    let partner = fallbackName || '';
    this.setHint('dialogue', { speaker: partner, menu: this.inGame });
    return runDialogue({
      layer: this.els.layer,
      lines,
      speakerOf: (who) => this.speakerOf(who),
      assets: this.assets,
      extra,
      signal,
      sfx: this.sfx,
      voice: {
        play: (who, text) => this.sound.voice.play(this.voiceSpeaker(who), text),
        preload: (who, text) => this.sound.voice.preload(this.voiceSpeaker(who), text),
      },
      onLine: (who) => {
        if (!who.isPlayer && who.name) partner = who.name;
        this.setHint('dialogue', { speaker: partner, menu: this.inGame });
      },
    });
  }

  describe(deltas) {
    return METER_IDS.filter((id) => deltas[id]).map((id) => `${METER_NAMES[id]} ${deltas[id] > 0 ? '+' : '−'}${Math.abs(deltas[id])}`).join('　');
  }

  async stepGoto(mission, step, signal) {
    const { engine, hud } = this;
    this.els.layer.replaceChildren();
    this.setScene(null);
    if (engine.player.locationId === step.locationId) return;

    // 倒數秒數：內容寫的 timeLimitSec 與引擎估的騎乘時間乘 1.4，取較大的（契約第 5 節），城市再大也騎得到。
    let left = Number(step.timeLimitSec) > 0 ? Number(step.timeLimitSec) : null;
    if (left != null && typeof engine.estimateRideSeconds === 'function') {
      const estimate = Number(engine.estimateRideSeconds(step.locationId));
      if (Number.isFinite(estimate) && estimate > 0) left = Math.max(left, Math.ceil(estimate * GOTO_ESTIMATE_FACTOR));
    }
    // 目的地卡：目的地的插畫滿版，上面一塊路名牌；按「出發」才回到街上開始倒數。
    hud.setTask(mission.title, step.hint || this.placeName(step.locationId));
    this.setScene(`loc_${step.locationId}`);
    this.setHint('place', { place: this.placeName(step.locationId) });
    await showPlaceCard({ layer: this.els.layer, name: this.placeName(step.locationId), hint: step.hint || '', limit: left != null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '', signal, sfx: this.sfx });
    this.els.layer.replaceChildren();
    this.setScene(null);

    this.objective = { kind: 'goto', markerId: GOTO_MARKER, locationId: step.locationId };
    this.refreshMarkers();
    hud.setTask(mission.title, step.hint || this.placeName(step.locationId));
    // 準時獎勵：倒數開始時已經在自動前往的也算用過
    const total = left;
    const run = { usedAuto: this.autoOn, arrivedLeft: null };
    this.gotoRun = run;
    this.setFree(true);
    // 限時前往一開始就提醒可以自動前往，提示列閃一下。
    if (this.canAutoRide) {
      this.rideHint({ remindAuto: true });
      this.hint.flash(2000);
    }
    // 自己騎、準時到有獎勵：倒數開始時說一次
    if (total != null) this.toast(T.ride.punctualTip, { ms: 3600 });
    this.focusCanvas();
    try {
      await interaction(signal, (done) => {
        this.gotoArrive = () => {
          run.arrivedLeft = left;
          done();
        };
        let last = performance.now();
        if (left != null) hud.setTimer(left);
        const tick = setInterval(() => {
          const now = performance.now();
          const dt = (now - last) / 1000;
          last = now;
          if (left == null || !this.worldRunning) return;
          left -= dt;
          if (left > 0) {
            hud.setTimer(left);
            return;
          }
          // 超時不失敗：只加肝指數，倒數消失，照樣要騎到。
          left = null;
          hud.setTimer(null);
          this.applyEffects({ liver: GOTO_LATE_LIVER });
          this.sfx.play('wrong');
          this.toast(T.late, { tone: 'bad' });
          if (this.state.meters.liver >= 100) done();
        }, 200);
        return () => {
          clearInterval(tick);
          this.gotoArrive = null;
          hud.setTimer(null);
        };
      });
    } finally {
      this.gotoRun = null;
      this.setFree(false);
      this.objective = null;
      this.refreshMarkers();
      engine.setWaypoint(null);
      hud.setTask(mission.title, '');
    }
    const bonus = punctualBonus({ left: run.arrivedLeft, total, usedAuto: run.usedAuto });
    if (bonus) {
      const deltas = this.applyEffects(bonus);
      if (this.replay) this.replay.punctual += deltas.trust || 0;
      this.sfx.play('right');
      this.toast(`${T.ride.punctual}　${this.describe(deltas)}`, { tone: 'good', ms: 3600 });
    }
  }

  // ── 自己騎車：靈感（ride.js）────────────────────────

  /** 每 100 毫秒：自己騎車經過靈感就撿起來；HUD 的指針指向最近的一個。 */
  updateRide() {
    const chip = this.inspireChip;
    if (!this.pickups.length) {
      chip.update({ visible: false });
      return;
    }
    const riding = this.worldRunning && this.free && !this.flying && !this.els.hud.hidden && this.inGame;
    if (!riding) {
      chip.update({ visible: false });
      this.ridePrev = null;
      return;
    }
    const me = this.engine.player;
    const cur = { x: me.x, y: me.y };
    if (!Number.isFinite(cur.x) || !Number.isFinite(cur.y)) return;
    const taken = new Set(this.state.inspiration);
    const hits = sweepPickups(this.pickups, taken, this.ridePrev, cur, this.pickupUpm);
    this.ridePrev = cur;
    const auto = this.autoOn || this.autoTouched;
    this.autoTouched = false;
    if (hits.length) {
      if (auto) {
        // 自動前往經過不算：每一輪提醒一次
        if (!this.autoMissNoted) {
          this.autoMissNoted = true;
          this.toast(T.inspire.autoMiss, { ms: 3600 });
        }
      } else for (const hit of hits) this.collectInspiration(hit);
    }
    const got = this.state.inspiration.length;
    chip.update({ visible: true, got, total: this.pickups.length, near: nearestPickup(this.pickups, new Set(this.state.inspiration), { ...cur, heading: me.heading }, this.pickupUpm), auto: this.autoOn });
  }

  collectInspiration(pickup) {
    const list = this.state.inspiration;
    if (list.includes(pickup.id)) return;
    list.push(pickup.id);
    // 撿到的靈感不跟著任務回朔：任務進行中撿到的也直接記進存檔點
    if (!this.committed.inspiration) this.committed.inspiration = [];
    if (!this.committed.inspiration.includes(pickup.id)) this.committed.inspiration.push(pickup.id);
    const n = list.length;
    let extra = '';
    if (n % INSPIRE_BRAND_EVERY === 0) {
      const deltas = this.applyEffects(INSPIRE_BRAND);
      if (this.phase !== 'mission') this.committed.meters = { ...this.state.meters };
      extra = this.describe(deltas);
    }
    if (this.replay) this.replay.inspiration += 1;
    this.persist();
    this.sfx.play('right');
    this.inspireChip.pop();
    this.toast([`✦ ${T.inspire.count(n, this.pickups.length)}`, this.inspirationLine(n - 1), extra].filter(Boolean).join('　'), { tone: 'good', ms: 3800 });
  }

  inspirationLine(index) {
    const lines = T.inspire.lines;
    return lines.length ? lines[index % lines.length] : '';
  }

  /** 提案附錄的「沿路撿到的靈感」：照撿到的順序。 */
  inspirationLines() {
    return this.state.inspiration.map((_, i) => this.inspirationLine(i));
  }

  async stepChoice(mission, step, signal, ctx = null) {
    const role = this.role;
    const merged = (option) => {
      const total = {};
      const bonus = option.isGrandma ? null : option.roleBonus?.[role.id];
      for (const id of METER_IDS) {
        const value = (Number(option.effects?.[id]) || 0) + (Number(bonus?.[id]) || 0);
        if (value) total[id] = value;
      }
      return { total, bonus };
    };

    // 選項帶有這個職能的加成時先標出來。媒體、創意、CX 的專屬加成就是這個，用加成的名字；
    // 其餘三個職能的專屬加成是別的機制，這裡只標「職能加成」。
    const ownMechanic = ['ae', 'planner', 'data'].includes(role.id);
    const options = step.options.map((option, orig) => ({
      ...option,
      orig,
      bonusLabel: option.roleBonus?.[role.id] ? (!ownMechanic && role.perk?.name) || T.roleBonus : '',
    }));
    // 支線：選項順序依「支線＋職能」固定打散，免得會扣分的選項老是排在同一格。存檔記原本的索引。
    if (mission.isSide) {
      let seed = 2166136261;
      for (const ch of `${mission.id}|${role.id}`) seed = Math.imul(seed ^ ch.codePointAt(0), 16777619) >>> 0;
      for (let i = options.length - 1; i > 0; i -= 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [options[i], options[j]] = [options[j], options[i]];
      }
    }

    // 策略企劃：抉擇前先看到一句洞察提示（取對長期最有利那個選項的書中依據）。
    if (role.id === 'planner' && role.perk?.name) {
      let best = null;
      for (const option of options) {
        const { total } = merged(option);
        const score = (total.brand || 0) + (total.sales || 0) + (total.trust || 0) - (total.liver || 0);
        if (option.insight && (!best || score > best.score)) best = { option, score };
      }
      if (best) best.option.hint = { label: role.perk.name, text: best.option.insight };
    }

    // 阿嬤模組開著：多一個阿嬤的選項。中途才打開的話，從下一個抉擇開始出現。
    const override = this.state.grandma.on ? this.content.grandma?.choiceOverrides?.[mission.id] : null;
    if (override) options.push({ ...override, isGrandma: true });

    this.setScene(mission.splash);
    await runChoice({
      layer: this.els.layer,
      prompt: String(step.prompt || '').replaceAll('{role}', role.title),
      options,
      signal,
      sfx: this.sfx,
      onState: (kind, count) => this.setHint(kind, { count }),
      onPick: (option) => {
        const { total, bonus } = merged(option);
        const applied = this.applyEffects(total);
        if (ctx) ctx.option = option.orig ?? options.indexOf(option);
        // 支線顯示實際加上去的量（打折、受上限限制之後）
        return { deltas: mission.isSide ? applied : total, bonusLabel: bonus ? role.title : '' };
      },
    });
  }

  /** 已答對過的題目換成同年份還沒答對的；整年都答對過就照原題出。 */
  pickQuestions(step, mission) {
    const { quizById, quiz } = this.content;
    const correct = new Set(this.state.quizSeen.correct);
    const used = new Set();
    const picked = [];
    for (const id of step.ids || []) {
      let question = quizById.get(id);
      if (!question) continue;
      if (correct.has(question.id) || used.has(question.id)) {
        const year = question.year ?? mission.year;
        const fresh = quiz.find((q) => q.year === year && !correct.has(q.id) && !used.has(q.id) && !(step.ids || []).includes(q.id));
        if (fresh) question = fresh;
      }
      used.add(question.id);
      picked.push(question);
    }
    return picked;
  }

  async stepQuiz(mission, step, signal, ctx = null) {
    const role = this.role;
    // 支線的題目直接寫在步驟裡（inline）
    const questions = step.inline ? [{ id: `${mission.id}_q`, year: mission.year, ...step.inline }] : this.pickQuestions(step, mission);
    this.setScene(mission.splash);
    for (let i = 0; i < questions.length; i += 1) {
      const question = questions[i];
      let removed = -1;
      // 數據分析師：先刪去一個錯誤選項。
      if (role.id === 'data' && question.options.length > 2) {
        const wrong = question.options.map((_, index) => index).filter((index) => index !== question.answer);
        removed = sample(wrong);
      }
      await runQuiz({
        layer: this.els.layer,
        question,
        removed,
        removedLabel: role.perk?.name || '',
        position: i + 1,
        total: questions.length,
        signal,
        sfx: this.sfx,
        onState: (kind, count) => this.setHint(kind, { count }),
        onAnswer: (isCorrect) => {
          const seen = this.state.quizSeen;
          seen.asked += 1;
          if (isCorrect) {
            seen.right += 1;
            if (!seen.correct.includes(question.id)) seen.correct.push(question.id);
          }
          const effects = isCorrect ? QUIZ_RIGHT : QUIZ_WRONG;
          const applied = this.applyEffects(effects);
          if (ctx) ctx.quiz = isCorrect;
          return mission.isSide ? applied : effects;
        },
      });
      this.persist();
      if (this.state.meters.liver >= 100) return;
    }
  }

  // ── 結局 ───────────────────────────────────────────

  async runEnding({ forced = false, ignoreGrandma = false } = {}) {
    // 年度重玩：肝指數爆了就結算這一年，不看結局
    if (this.replay) {
      this.finishReplay({ forced });
      return;
    }
    if (this.phase === 'ending') return;
    this.phase = 'ending';
    this.coach.stop('ending');
    this.state.currentMissionId = null;
    const signal = this.newFlow();
    this.setFree(false);
    this.objective = null;
    // 清掉還留在畫面上的東西（例如除錯面板連看兩個結局時的上一張成績單），影片才不會被蓋住。
    this.setScreen(null, 'play');
    this.els.screen.replaceChildren();
    this.els.layer.replaceChildren();
    this.setScene(null);
    this.engine.setMarkers([]);
    this.engine.setWaypoint(null);
    this.engine.teleportTo(LOC.final);
    this.engine.setTimeOfDay(Math.max(clockToHours(this.state.clock), ENDING_HOUR));
    this.hud.setTask('', '');
    this.commit();
    // 結局文字本身已經寫了「肝指數滿了」，不再疊提示框
    this.sound.music.play('music_ending');
    try {
      await this.playVideo('ending', signal);
      // 熱炒店收工：依阿嬤線播兩種結尾的其中一段，再接數值判定的結局。
      this.hud.show(false);
      await playFinale(this, signal);
    } catch (err) {
      if (isAbort(err)) return;
      throw err;
    }
    this.els.layer.replaceChildren();
    const { content, state } = this;
    // 看到結局就算破關過一次：標題從此多一顆「年度選擇」
    this.recordFinished();
    const asGrandma = !ignoreGrandma && state.grandma.on && content.grandma?.ending;
    const ending = asGrandma ? { id: 'grandma', image: 'ending_grandma', ...content.grandma.ending } : pickEnding(content.endings, state.meters);
    this.hud.show(false);
    this.sfx.play('clear');
    this.setScreen(
      showEnding({
        screen: this.els.screen,
        assets: this.assets,
        ending,
        stamp: asGrandma ? T.endingStampGrandma : ending.id || '',
        meters: state.meters,
        missionsDone: state.doneMissionIds.length,
        missionsTotal: content.missions.length,
        quiz: state.quizSeen,
        books: content.books,
        ownedYears: state.books,
        extraPages: proposalPages(this).some((page) => page.grandma) ? 1 : 0,
        side: content.side.missions.length ? chapterProgress(this) : null,
        role: this.role?.title || '',
        note: forced ? T.forcedEnd : '',
        sfx: this.sfx,
        onAgain: () => this.showRoles(),
        onShare: () => this.shareEnding({ ending, stamp: asGrandma ? T.endingStampGrandma : ending.id || '' }),
      }),
      'ending',
    );
    this.setHint('ending');
  }

  /** 結局分享圖：職能、結局等級與標題、四個數值、完成任務與支線數、提案第一頁標題、遊戲網址。 */
  async shareEnding({ ending, stamp }) {
    const { content, state } = this;
    const side = content.side.missions.length ? chapterProgress(this) : null;
    const pages = proposalPages(this);
    const first = pages.find((page) => page.owned) || null;
    const result = await shareResult({
      assets: this.assets,
      image: ending.image,
      role: this.role?.title || '',
      stamp,
      endingTitle: ending.title || '',
      meters: { ...state.meters },
      missionsDone: state.doneMissionIds.length,
      missionsTotal: content.missions.length,
      sidesDone: side ? side.sidesDone : null,
      sidesTotal: side ? side.sidesTotal : null,
      proposal: first?.title || '',
    });
    if (result.kind === 'download') this.toast(result.copied ? T.share.saved : T.share.savedOnly, { tone: 'good' });
    else if (result.kind === 'error') this.toast(T.share.failed);
    return result;
  }

  /** 錯誤卡「複製錯誤資訊」用的目前畫面狀態（不含任何個資）。 */
  errorContext() {
    let player = null;
    try {
      const p = this.engine.player;
      player = p ? { x: Math.round(p.x), y: Math.round(p.y), heading: Number((p.heading || 0).toFixed(2)), speed: Number((p.speed || 0).toFixed(2)), locationId: p.locationId ?? null, mode: p.mode ?? null } : null;
    } catch {
      player = null;
    }
    return {
      phase: this.phase,
      stage: this.els.stage.dataset.phase || '',
      scene: this.els.stage.dataset.scene || '',
      engineKind: this.engineKind,
      free: this.free,
      auto: this.autoOn,
      input: this.inputMode,
      objective: this.objective ? { kind: this.objective.kind, marker: this.objective.markerId, at: this.objective.locationId } : null,
      role: this.state.roleId,
      clock: this.state.clock,
      meters: this.state.meters,
      done: this.state.doneMissionIds.length,
      dialogs: this.els.dialogs.filter((d) => d.open).map((d) => d.id),
      player,
    };
  }

  // ── 阿嬤模組 ───────────────────────────────────────

  get basketPending() {
    const need = this.content.grandma?.unlock?.templeVisits ?? 3;
    return !!this.content.grandma && !this.state.grandma.unlocked && this.state.grandma.templeVisits >= need;
  }

  visitTemple() {
    const grandma = this.content.grandma;
    const g = this.state.grandma;
    if (!grandma || g.unlocked || this.basketPending) return;
    const need = grandma.unlock?.templeVisits ?? 3;
    g.templeVisits += 1;
    this.sfx.play('select');
    this.toast(T.templeCount(g.templeVisits, need));
    if (this.basketPending) {
      this.toast(T.grandmaWaiting(this.placeName(LOC.grandma)), { tone: 'good', ms: 5000 });
      this.refreshNpcs();
      this.refreshMarkers();
    }
    this.persist();
  }

  /** 柑仔店：阿嬤遞菜籃。只在自由騎乘時觸發，收下就解鎖並打開阿嬤模組。 */
  async offerBasket() {
    if (this.offering || !this.basketPending || !['roam', 'rechao'].includes(this.phase)) return;
    this.guardGhostClick();
    this.offering = true;
    const signal = this.flow?.signal;
    const { layer } = this.els;
    this.setFree(false);
    try {
      this.setScene('loc_gamadiam');
      await this.talk(this.fillLines(this.content.grandma.intro), { signal, fallbackName: this.speakerOf('grandma').name });
      const perk = this.content.grandma.perk;
      this.setHint('ask', { title: perk?.name || '' });
      const accepted = await interaction(signal, (done) => {
        const yes = h('button', { type: 'button', class: 'btn btn--primary btn--big', id: 'basket-yes', 'data-primary': true, text: T.takeBasket, onClick: () => done(true) });
        const no = h('button', { type: 'button', class: 'btn btn--big', id: 'basket-no', text: T.refuseBasket, onClick: () => done(false) });
        const panel = h(
          'section',
          { class: 'dlg dlg--ask', 'aria-labelledby': 'basket-title' },
          h('div', { class: 'sub' }, h('header', { class: 'sub-who' }, h('strong', { class: 'sub-name', id: 'basket-title', text: perk?.name || T.grandmaName })), h('p', { class: 'sub-text', text: perk?.desc || '' })),
          h('div', { class: 'cine-actions' }, no, yes),
        );
        arrowFocus(panel, () => [yes, no]);
        layer.replaceChildren(panel);
        yes.focus({ preventScroll: true });
        return () => panel.remove();
      });
      layer.replaceChildren();
      this.setScene(null);
      if (accepted) {
        this.unlockGrandma({ quiet: true });
        await this.playVideo('grandma_reveal', signal);
        this.toast(`${T.grandmaUnlocked}　${perk?.name || ''}`, { tone: 'good', ms: 4000 });
      } else {
        // 先不用：下次再來柑仔店還問得到。
        this.toast(T.grandmaWaiting(this.placeName(LOC.grandma)));
      }
    } catch (err) {
      if (!isAbort(err)) throw err;
      return;
    } finally {
      this.offering = false;
    }
    this.setFree(true);
    this.focusCanvas();
  }

  unlockGrandma({ quiet = false } = {}) {
    const grandma = this.content.grandma;
    if (!grandma) return;
    const g = this.state.grandma;
    if (g.unlocked) {
      this.setGrandma(!g.on);
      return;
    }
    g.unlocked = true;
    g.on = true;
    this.sfx.play('clear');
    if (!quiet) this.toast(`${T.grandmaUnlocked}　${grandma.perk?.name || ''}`, { tone: 'good', ms: 4000 });
    this.applyLook();
    if (this.inGame) this.refreshMarkers();
    this.persist();
  }

  setGrandma(on) {
    const g = this.state.grandma;
    if (!g.unlocked) return;
    g.on = !!on;
    this.toast(g.on ? T.grandmaOn : T.grandmaOff);
    this.applyLook();
    this.persist();
  }

  /** 外觀、濾鏡、字體：阿嬤模組開關時立即套用或還原。 */
  applyLook() {
    const on = this.state.grandma.on;
    document.documentElement.classList.toggle('grandma', on);
    this.engine.setFilter(on ? 'grandma' : 'none');
    const role = this.role;
    if (role) {
      this.engine.setPlayerSkin(on ? 'grandma' : role.id);
      this.hud.setRole(role, { grandmaOn: on });
    }
    this.screenUi?.setGrandma?.(on);
    if (this.phase === 'title') this.playTitleMusic();
    this.refreshNpcs();
  }

  // ── 電台 ───────────────────────────────────────────

  tuneRadio(year) {
    const stations = this.content.radio;
    if (!stations.length) {
      this.hud.setRadio(undefined);
      return;
    }
    const index = stations.findIndex((s) => s.year === year);
    this.radio = { index: index >= 0 ? index : 0, off: false };
    this.hud.setRadio(stations[this.radio.index]);
    this.playStation();
  }

  cycleRadio() {
    const stations = this.content.radio;
    if (!stations.length) return;
    this.sfx.play('select');
    if (this.radio.off) this.radio = { index: 0, off: false };
    else if (this.radio.index + 1 >= stations.length) this.radio = { index: this.radio.index, off: true };
    else this.radio = { index: this.radio.index + 1, off: false };
    this.hud.setRadio(this.radio.off ? null : stations[this.radio.index]);
    this.playStation();
  }

  // ── 選單、年鑑、長輩圖 ─────────────────────────────

  openProposal() {
    openProposal({ dialog: this.els.proposal, pages: proposalPages(this), appendix: appendixCards(this), inspirations: this.inspirationLines() });
    this.syncWorld();
  }

  openSideList() {
    openSideList({
      dialog: this.els.sidelist,
      groups: sideGroups(this),
      progress: chapterProgress(this),
      target: this.sideGoal()?.id || null,
      onNavigate: (id) => this.navigateSide(id),
      onClear: () => this.navigateSide(null),
    });
    this.syncWorld();
  }

  openElder() {
    const grandma = this.content.grandma;
    if (!grandma || !this.state.grandma.unlocked) return;
    const cards = grandma.elderCards?.length ? grandma.elderCards : [{ image: 'elder_card_1', caption: '' }];
    const bases = [];
    for (const card of cards) if (!bases.some((b) => b.image === card.image)) bases.push({ image: card.image });
    const learned = this.state.books.map((year) => this.content.bookByYear.get(year)?.quote).filter(Boolean);
    const lines = [...new Set([...cards.map((c) => c.caption).filter(Boolean), ...learned])];
    openElderCard({ dialog: this.els.elder, assets: this.assets, cards: bases, lines: lines.length ? lines : [''] });
    this.syncWorld();
  }

  openMenu() {
    if (!this.inGame || this.anyModalOpen) return;
    const g = this.state.grandma;
    const items = [{ id: 'resume', label: () => T.menuResume, onSelect: () => {} }, { id: 'proposal', label: () => T.proposal, onSelect: () => this.openProposal() }];
    if (this.content.side.missions.length) items.push({ id: 'side', label: () => T.menuSide, onSelect: () => this.openSideList() });
    if (g.unlocked) {
      items.push({ id: 'elder', label: () => T.menuElder, onSelect: () => this.openElder() });
      items.push({ id: 'grandma', label: () => (this.state.grandma.on ? T.menuGrandmaOn : T.menuGrandmaOff), keepOpen: true, onSelect: () => this.setGrandma(!this.state.grandma.on) });
    }
    items.push({
      id: 'hint',
      label: () => (this.hint.enabled ? T.menuHintOn : T.menuHintOff),
      keepOpen: true,
      onSelect: () => {
        this.hint.setEnabled(!this.hint.enabled);
        this.store.writePrefs({ ...this.store.readPrefs(), hint: this.hint.enabled });
      },
    });
    items.push({ id: 'manual', label: () => T.menuManual, onSelect: () => openManual({ dialog: this.els.manual, onClose: () => this.syncWorld(), onReplay: this.free ? () => this.coach.start({ force: true }) : null }) });
    items.push({ id: 'unstuck', label: () => T.menuUnstuck, onSelect: () => this.unstuck() });
    // 年度重玩中：「重新開始」會動到主線存檔，換成「結束重玩」
    if (this.replay) items.push({ id: 'replay-quit', label: () => T.replay.menuQuit, danger: true, onSelect: () => this.quitReplay() });
    else items.push({ id: 'restart', label: () => T.menuRestart, danger: true, onSelect: () => this.restart() });
    openMenu({ dialog: this.els.menu, items, extra: [soundControls(this.sound), langControls()], note: this.store.available ? '' : T.noSaving, version: T.version(VERSION) });
    this.syncWorld();
  }

  /** 回到路上：引擎有 nearestRoadTeleport 就用它；沒有的話傳送到最近一個地點的門口。 */
  unstuck() {
    if (typeof this.engine.nearestRoadTeleport === 'function') {
      this.engine.nearestRoadTeleport();
      this.toast(T.unstuckRoad);
      return;
    }
    const me = this.engine.player;
    let nearest = null;
    for (const loc of this.locations.values()) {
      const d = Math.hypot(loc.x - me.x, loc.y - me.y);
      if (!nearest || d < nearest.d) nearest = { d, loc };
    }
    if (!nearest) return;
    this.engine.teleportTo(nearest.loc.id);
    this.toast(T.unstuckDone(this.placeName(nearest.loc.id)));
  }

  async quitReplay() {
    if (!this.replay) return;
    // 主線還沒做完就離開：問一下（做完了就直接結算）
    if (!this.state.doneMissionIds.includes(this.replay.missionId)) {
      const ok = await askConfirm({ dialog: this.els.confirm, question: T.replay.quitAsk, yes: T.replay.quitYes, no: T.replay.quitNo });
      this.syncWorld();
      if (!ok) return;
    }
    this.finishReplay();
  }

  async restart() {
    const ok = await askConfirm({ dialog: this.els.confirm, question: T.restartAsk, yes: T.restartYes, no: T.restartNo });
    this.syncWorld();
    if (!ok) return;
    this.abortFlow();
    this.state = { ...blankState(), grandma: { ...this.state.grandma }, quizSeen: { correct: [...this.committed.quizSeen.correct], asked: 0, right: 0 } };
    this.applyRoleScript();
    this.commit();
    this.showTitle();
  }

  // ── 除錯（?debug=1）────────────────────────────────

  createDebugApi() {
    const ensureRun = () => {
      if (!this.state.roleId) {
        this.state = this.freshRun(this.content.roles[0].id);
        this.commit();
      }
    };
    const preview = async (missionId, run) => {
      const mission = this.content.missionById.get(missionId);
      if (!mission) return;
      ensureRun();
      const signal = this.newFlow();
      const back = this.phase;
      this.phase = 'debug';
      this.setFree(false);
      this.setScreen(null, 'play');
      this.els.screen.replaceChildren();
      this.hud.show(false);
      try {
        await run(mission, signal);
      } catch (err) {
        if (!isAbort(err)) throw err;
        return;
      }
      this.els.layer.replaceChildren();
      this.setScene(null);
      this.phase = back;
      if (back === 'title' || back === 'boot' || back === 'select') this.showTitle();
      else this.enterWorld({ at: this.engine.player.locationId || LOC.home });
    };
    return {
      setMeters: (values) => {
        ensureRun();
        for (const id of METER_IDS) if (Number.isFinite(values[id])) this.state.meters[id] = clamp(values[id]);
        this.hud.setMeters(this.state.meters);
        if (this.phase !== 'mission') this.commit();
        if (this.state.meters.liver >= 100 && ['roam', 'rechao'].includes(this.phase)) this.runEnding({ forced: true });
      },
      jumpTo: (missionId) => {
        const target = this.content.missionById.get(missionId);
        if (!target) return;
        ensureRun();
        this.abortFlow();
        const earlier = this.content.missions.slice(0, this.content.missions.indexOf(target));
        this.state.doneMissionIds = earlier.map((m) => m.id);
        this.state.carUnlocked ||= earlier.length >= 5; // A26
        this.state.currentMissionId = null;
        this.state.prologueSeen = true;
        this.state.morningDone = true;
        this.state.interludesSeen = earlier.map((m) => m.id).filter((id) => this.content.interludeByMission.has(id));
        this.state.books = earlier.map((m) => m.year).filter((year) => this.content.bookByYear.has(year));
        this.state.clock = earlier.length ? this.clockAfter(earlier[earlier.length - 1]) : START_CLOCK;
        this.commit();
        this.newFlow();
        this.enterWorld({ at: target.locationId, resume: target });
      },
      showEnding: async (endingId) => {
        const ending = this.content.endings.find((e) => e.id === endingId);
        if (!ending) return;
        ensureRun();
        this.abortFlow();
        this.phase = 'debug';
        this.state.meters = metersForEnding(ending);
        this.hud.setMeters(this.state.meters);
        await this.runEnding({ ignoreGrandma: true });
      },
      showGrandmaEnding: async () => {
        ensureRun();
        this.abortFlow();
        this.phase = 'debug';
        if (!this.state.grandma.unlocked) this.unlockGrandma({ quiet: true });
        else if (!this.state.grandma.on) this.setGrandma(true);
        await this.runEnding();
      },
      unlockCar: () => { // A26 preserve the current mission checkpoint.
        ensureRun();
        this.state.carUnlocked = true;
        this.committed.carUnlocked = true;
        this.engine.setCarUnlocked?.(true);
        this.persist();
        this.carNote(T.carAward);
      },
      toggleGrandma: () => this.unlockGrandma(),
      setBond: (value) => {
        ensureRun();
        if (Number.isFinite(value)) this.state.bond = Math.round(value);
        if (this.phase !== 'mission') this.commit();
      },
      /** 以下三個只播畫面，不動存檔：驗收時用來快速看到每一種貼文外框與每一種打斷。 */
      playFeed: async (missionId) => preview(missionId, (mission, signal) => playFeedFor(this, mission, signal)),
      playInterlude: async (missionId) => preview(missionId, (mission, signal) => playInterlude(this, mission, signal, { preview: true })),
      /** 預覽某個地點的目的地卡（只播畫面） */
      showPlace: async (locationId) =>
        preview(this.content.missions[0].id, async (mission, signal) => {
          this.setScene(`loc_${locationId}`);
          this.setHint('place', { place: this.placeName(locationId) });
          await showPlaceCard({ layer: this.els.layer, name: this.placeName(locationId), hint: '', limit: '', signal, sfx: this.sfx });
        }),
      /** 直接開某個支線（不管有沒有開放） */
      startSide: (sideId) => {
        const side = this.content.side.byId.get(sideId);
        if (!side) return;
        ensureRun();
        this.abortFlow();
        this.sideRun = null;
        this.state = { ...clone(this.committed), grandma: { ...this.state.grandma } };
        this.applyRoleScript();
        this.newFlow();
        this.enterWorld({ at: side.locationId });
        if (this.phase === 'roam' || this.phase === 'rechao') this.startSide(side);
      },
      /** 把某一年的主線標成完成（那一年的支線就開放） */
      completeYear: (year) => {
        ensureRun();
        this.abortFlow();
        for (const mission of this.content.missions.filter((m) => m.year === Number(year))) {
          if (!this.state.doneMissionIds.includes(mission.id)) this.state.doneMissionIds.push(mission.id);
          if (this.content.bookByYear.has(mission.year) && !this.state.books.includes(mission.year)) this.state.books.push(mission.year);
          if (this.content.interludeByMission.has(mission.id) && !this.state.interludesSeen.includes(mission.id)) this.state.interludesSeen.push(mission.id);
        }
        this.state.currentMissionId = null;
        this.state.morningDone = true;
        this.commit();
        this.newFlow();
        this.refreshNpcs();
        this.enterWorld({ at: this.engine.player.locationId || LOC.home });
      },
      /** 直接播晨會（只播畫面，不動存檔） */
      playMorning: async () => preview(this.content.missions[0].id, async (mission, signal) => playMorning(this, signal)),
      playPrologue: async () => preview(this.content.missions[0].id, async (mission, signal) => playPrologue(this, signal)),
    };
  }
}
