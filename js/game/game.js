// 遊戲控制器：一天的推進、任務執行、數值、存檔、阿嬤模組、結局。
// 任務、角色、題目的文字全部來自 content；這裡只有流程與規則。

import { h, interaction, clockToHours, hoursToClock } from './dom.js';
import { T, METER_IDS, METER_NAMES } from './strings.js';
import { pickEnding, metersForEnding } from './endings.js';
import { hintFor } from './hints.js';
import { voiceKey } from './sound.js';
import { createHud } from './ui/hud.js';
import { createToasts } from './ui/toast.js';
import { showTitle } from './ui/title.js';
import { showRoleSelect } from './ui/role-select.js';
import { runDialogue } from './ui/dialogue.js';
import { runChoice } from './ui/choice.js';
import { runQuiz } from './ui/quiz.js';
import { showMissionCard, showMissionClear } from './ui/mission-card.js';
import { playCutscene } from './ui/cutscene.js';
import { showEnding } from './ui/ending.js';
import { openProposal } from './ui/proposal.js';
import { playPrologue, playFeedFor, playInterlude, playFinale, proposalPages, grandmaWithUs } from './story.js';
import { openMenu, askConfirm, enableLightDismiss, soundControls } from './ui/menu.js';
import { openElderCard } from './ui/elder-card.js';

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
const AE_CALM_EFFECTS = { trust: 5, liver: 2 };
const LOC = { home: 'home', final: 'rechao', temple: 'temple', grandma: 'gamadiam', office: 'office', nightMarket: 'night_market' };
// 主角的語音：依職能用女聲或男聲（契約第 6 節）。
const PLAYER_VOICE = { ae: 'player_f', media: 'player_f', creative: 'player_f', cx: 'player_f', planner: 'player_m', data: 'player_m' };
const AMBIENT_MS = 300;
const EGG_TEMPLE = 'egg:temple';
const EGG_GRANDMA = 'egg:gamadiam';
const GOTO_MARKER = 'goto';
const FINAL_MARKER = 'rechao';

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
    books: [],
    currentMissionId: null,
    quizSeen: { correct: [], asked: 0, right: 0 },
    grandma: { unlocked: false, on: false, templeVisits: 0 },
    relief: [],
    bond: 0,
    interludesSeen: [],
    prologueSeen: false,
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
    this.radio = { index: 0, off: false };
    this.locations = new Map(engine.getLocations().map((loc) => [loc.id, loc]));

    this.state = this.loadState();
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
    this.hint.setEnabled(store.readPrefs().hint !== false);
    this.hud = createHud({
      root: els.hud,
      assets,
      onMenu: () => this.openMenu(),
      onRadio: () => this.cycleRadio(),
      onAutoRide: () => this.toggleAutoRide(),
    });
    // 點過 HUD 上的按鈕後把焦點還給街景，方向鍵與動作鍵才不會落在那顆按鈕上。
    els.hud.addEventListener('click', () => setTimeout(() => this.focusCanvas(), 0));

    this.bindEngine();
    this.bindWindow();
    setInterval(() => this.updateAmbient(), AMBIENT_MS);
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
      currentMissionId: content.missionById.has(saved.currentMissionId) && !doneMissionIds.includes(saved.currentMissionId) ? saved.currentMissionId : null,
      books: saved.books.filter((year) => content.bookByYear.has(year)),
      quizSeen: saved.quizSeen,
      grandma: content.grandma ? saved.grandma : { unlocked: false, on: false, templeVisits: 0 },
      relief: saved.relief,
      bond: saved.bond,
      interludesSeen: saved.interludesSeen.filter((id) => content.missionById.has(id)),
      prologueSeen: saved.prologueSeen,
    };
    if (!state.roleId) return { ...blankState(), grandma: state.grandma, quizSeen: { correct: state.quizSeen.correct, asked: 0, right: 0 } };
    return state;
  }

  get role() {
    return this.content.roleById.get(this.state.roleId) || null;
  }

  /** 把目前狀態定為「存檔點」並寫入。任務進行中不會呼叫，所以重新整理會回到任務開始前。 */
  commit() {
    this.committed = clone(this.state);
    this.persist();
  }

  /** 每個步驟結束都會呼叫：寫入存檔點；阿嬤模組的解鎖與開關即時生效，一併寫入。 */
  persist() {
    this.store.write({ ...this.committed, grandma: { ...this.state.grandma } });
  }

  applyEffects(effects, { silent = false } = {}) {
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
    return this.locations.get(locationId)?.name || '';
  }

  nextMission() {
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
  voiceFor(who) {
    const speaker = this.voiceSpeaker(who);
    return {
      info: (text) => this.assets.audio('voice', voiceKey(speaker, text)),
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
    this.setHint('ride', {
      place: target ? this.placeName(target.locationId) : '',
      arrived: !!target && this.engine.player.locationId === target.locationId,
      canAuto,
      auto: this.autoOn,
      context: this.context,
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
    engine.on('interact', ({ kind, id }) => this.onInteract(kind, id));
    engine.on('location:leave', () => {
      if (!this.engineHasContext) this.context = null;
      if (this.free) this.rideHint();
    });
    engine.on('context:change', (context) => {
      this.engineHasContext = true;
      this.context = context?.action ? context : null;
      if (this.free) this.rideHint();
    });
    engine.on('autoride:change', ({ on }) => {
      this.autoOn = !!on;
      if (this.free) this.rideHint();
      else this.syncAutoRide();
    });
    engine.on('input:mode', ({ mode }) => this.setInputMode(mode));
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
    // 任務要按動作鍵才進入（見 onInteract）；限時前往與收工是到了就算。
    if (target.kind === 'goto') this.gotoArrive?.();
    else if (target.kind === 'final' && this.phase === 'rechao') this.runEnding();
    else if (target.kind === 'mission' && !this.engineHasContext && !this.context) {
      // 舊版引擎沒有 context:change：自己補一個「可以進入任務」的提示。
      this.context = { action: 'enter', targetId: target.markerId, targetName: target.mission.title };
      this.rideHint();
    }
  }

  /** 在任務地點按動作鍵（對著標記，或對著站在那裡的任何一位 NPC）就進入任務。 */
  tryStartMission(kind, id) {
    const target = this.objective;
    if (target?.kind !== 'mission' || this.phase !== 'roam') return false;
    const atMarker = kind === 'marker' && id === target.markerId;
    const npc = kind === 'npc' ? this.content.npcById.get(id) : null;
    const atGiver = !!npc && npc.locationId === target.locationId && this.engine.player.locationId === target.locationId;
    if (!atMarker && !atGiver) return false;
    this.startMission(target.mission);
    return true;
  }

  onEnterLocation(locationId) {
    if (this.free && locationId === LOC.temple) this.sfx.play('temple_bell');
    if (!this.free || this.phase !== 'roam') return;
    const npc = sample(this.activeNpcs().filter((n) => n.locationId === locationId));
    if (npc) this.npcSays(npc);
  }

  onInteract(kind, id) {
    if (!this.free) return;
    if (this.tryStartMission(kind, id)) return;
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
    this.toast(`${this.placeName(locationId)}　${T.relief}　${this.describe(deltas)}`.trim(), { tone: 'good' });
    if (this.phase !== 'mission') this.commit();
  }

  npcSays(npc) {
    const line = this.state.grandma.on ? sample(this.content.grandma?.greetings) || sample(npc.lines) : sample(npc.lines);
    if (line) this.engine.say(npc.id, line.replaceAll('{role}', this.role?.title || ''), 3200);
  }

  // ── 標題 ───────────────────────────────────────────

  showTitle() {
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
        onSecret: grandma ? () => this.unlockGrandma() : null,
      }),
      'title',
    );
    this.setHint('title', { canContinue: !!this.committed.roleId });
    this.applyLook();
    this.playTitleMusic();
  }

  async startNew() {
    if (this.committed.roleId) {
      const ok = await askConfirm({ dialog: this.els.confirm, question: T.restartAsk, yes: T.restartYes, no: T.restartNo });
      if (!ok) return;
    }
    this.showRoles();
  }

  showRoles() {
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

  freshRun(roleId) {
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
    try {
      await this.afterMission(mission, this.flow.signal);
    } catch (err) {
      if (isAbort(err)) return;
      throw err;
    }
    this.phase = 'roam';
    this.nextObjective();
    this.flashHintOnce();
  }

  /** 過關畫面之後：過場（提案入手、真心話被打斷、搭檔與阿嬤的訊息），再播任務結尾的過場影片。 */
  async afterMission(mission, signal) {
    const interlude = await playInterlude(this, mission, signal);
    // 被午後雷陣雨打斷之後，到下一個任務開始前都在下雨。
    if (interlude?.kind === 'thunder') this.setRain(true);
    this.els.layer.replaceChildren();
    this.setScene(null);
    for (const step of mission.steps.filter((item, i, all) => item.type === 'cutscene' && all.slice(i).every((later) => later.type === 'cutscene'))) {
      await this.playVideo(step.video, signal);
    }
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
    this.objective = { kind: 'mission', mission, markerId: mission.id, locationId: mission.locationId };
    this.refreshMarkers();
    this.engine.setWaypoint(mission.id);
    this.hud.setTask(mission.title, `${mission.clock}　${this.placeName(mission.locationId)}`);
    this.tuneRadio(mission.year);
    this.setFree(true);
    this.focusCanvas();
    if (resume === mission) this.startMission(mission, { resume: true });
  }

  guideToFinal() {
    this.phase = 'rechao';
    this.objective = { kind: 'final', markerId: FINAL_MARKER, locationId: LOC.final };
    this.refreshMarkers();
    this.engine.setWaypoint(FINAL_MARKER);
    this.hud.setTask(this.placeName(LOC.final), T.rechaoHint);
    this.setFree(true);
    this.focusCanvas();
    if (this.engine.player.locationId === LOC.final) this.runEnding();
  }

  refreshMarkers() {
    const markers = [];
    const target = this.objective;
    if (target?.kind === 'mission') markers.push({ id: target.markerId, locationId: target.locationId, kind: 'mission', label: target.mission.title });
    else if (target?.kind === 'goto') markers.push({ id: GOTO_MARKER, locationId: target.locationId, kind: 'mission', label: this.placeName(target.locationId) });
    else if (target?.kind === 'final') markers.push({ id: FINAL_MARKER, locationId: LOC.final, kind: 'home', label: this.placeName(LOC.final) });
    const grandma = this.content.grandma;
    if (grandma && !this.state.grandma.unlocked) {
      if (this.basketPending) markers.push({ id: EGG_GRANDMA, locationId: LOC.grandma, kind: 'egg', label: '' });
      else markers.push({ id: EGG_TEMPLE, locationId: LOC.temple, kind: 'egg', label: '' });
    }
    this.engine.setMarkers(markers);
    if (target) this.engine.setWaypoint(target.markerId);
  }

  /** 阿嬤要等廟口拜滿次數才出現在柑仔店；阿嬤模組開著時玩家自己就是阿嬤，所以不重複放。 */
  activeNpcs() {
    const g = this.state.grandma;
    return this.content.npcs.filter((npc) => {
      if (npc.skin !== 'npc_grandma') return true;
      return this.basketPending || (g.unlocked && !g.on);
    });
  }

  refreshNpcs() {
    this.engine.setNpcs(this.activeNpcs().map((npc) => ({ id: npc.id, locationId: npc.locationId, skin: npc.skin, name: npc.name })));
  }

  // ── 任務 ───────────────────────────────────────────

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
    this.state.currentMissionId = null;
    this.state.clock = this.clockAfter(mission);
    this.hud.setClock(this.state.clock);
    this.engine.setTimeOfDay(clockToHours(this.state.clock));
    this.commit();

    this.setScene(mission.splash);
    this.setHint('clear');
    const hasInterlude = this.content.interludeByMission.has(mission.id);
    await showMissionClear({ layer, assets: this.assets, mission, place, before, after: { ...this.state.meters }, book: hasInterlude ? null : book, signal, sfx: this.sfx });
    await this.afterMission(mission, signal);

    this.phase = 'roam';
    this.nextObjective();
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
        return this.stepChoice(mission, step, signal);
      case 'quiz':
        return this.stepQuiz(mission, step, signal);
      case 'cutscene':
        this.els.layer.replaceChildren();
        return this.playVideo(step.video, signal);
      default:
        return Promise.resolve();
    }
  }

  speakerOf(who) {
    const role = this.role;
    if (who === 'player') return { name: role?.title || '', title: '', isPlayer: true };
    const npc = this.content.npcById.get(who);
    if (npc) return { name: npc.name, title: npc.title || '' };
    if (who === 'grandma') {
      const elder = this.content.npcs.find((n) => n.skin === 'npc_grandma');
      return { name: elder?.name || T.grandmaName, title: elder?.title || '' };
    }
    return { name: who || '', title: '' };
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

    this.objective = { kind: 'goto', markerId: GOTO_MARKER, locationId: step.locationId };
    this.refreshMarkers();
    hud.setTask(mission.title, step.hint || this.placeName(step.locationId));
    // 倒數秒數：內容寫的 timeLimitSec 與引擎估的騎乘時間乘 1.4，取較大的（契約第 5 節），城市再大也騎得到。
    let left = Number(step.timeLimitSec) > 0 ? Number(step.timeLimitSec) : null;
    if (left != null && typeof engine.estimateRideSeconds === 'function') {
      const estimate = Number(engine.estimateRideSeconds(step.locationId));
      if (Number.isFinite(estimate) && estimate > 0) left = Math.max(left, Math.ceil(estimate * GOTO_ESTIMATE_FACTOR));
    }
    this.setFree(true);
    // 限時前往一開始就提醒可以自動前往，提示列閃一下。
    if (this.canAutoRide) {
      this.rideHint({ remindAuto: true });
      this.hint.flash(2000);
    }
    this.focusCanvas();
    try {
      await interaction(signal, (done) => {
        this.gotoArrive = done;
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
      this.setFree(false);
      this.objective = null;
      this.refreshMarkers();
      engine.setWaypoint(null);
      hud.setTask(mission.title, '');
    }
  }

  async stepChoice(mission, step, signal) {
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
    const options = step.options.map((option) => ({
      ...option,
      bonusLabel: option.roleBonus?.[role.id] ? (!ownMechanic && role.perk?.name) || T.roleBonus : '',
    }));

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
        this.applyEffects(total);
        return { deltas: total, bonusLabel: bonus ? role.title : '' };
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

  async stepQuiz(mission, step, signal) {
    const role = this.role;
    const questions = this.pickQuestions(step, mission);
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
          this.applyEffects(effects);
          return effects;
        },
      });
      this.persist();
      if (this.state.meters.liver >= 100) return;
    }
  }

  // ── 結局 ───────────────────────────────────────────

  async runEnding({ forced = false, ignoreGrandma = false } = {}) {
    if (this.phase === 'ending') return;
    this.phase = 'ending';
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
    if (forced) this.toast(T.liverFull, { tone: 'bad', ms: 4000 });
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
        role: this.role?.title || '',
        note: forced ? T.forcedEnd : '',
        sfx: this.sfx,
        onAgain: () => this.showRoles(),
      }),
      'ending',
    );
    this.setHint('ending');
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
    openProposal({ dialog: this.els.proposal, pages: proposalPages(this) });
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
    items.push({ id: 'unstuck', label: () => T.menuUnstuck, onSelect: () => this.unstuck() });
    items.push({ id: 'restart', label: () => T.menuRestart, danger: true, onSelect: () => this.restart() });
    openMenu({ dialog: this.els.menu, items, extra: soundControls(this.sound), note: this.store.available ? '' : T.noSaving });
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
    this.toast(T.unstuckDone(nearest.loc.name));
  }

  async restart() {
    const ok = await askConfirm({ dialog: this.els.confirm, question: T.restartAsk, yes: T.restartYes, no: T.restartNo });
    this.syncWorld();
    if (!ok) return;
    this.abortFlow();
    this.state = { ...blankState(), grandma: { ...this.state.grandma }, quizSeen: { correct: [...this.committed.quizSeen.correct], asked: 0, right: 0 } };
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
        this.state.currentMissionId = null;
        this.state.prologueSeen = true;
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
      toggleGrandma: () => this.unlockGrandma(),
      setBond: (value) => {
        ensureRun();
        if (Number.isFinite(value)) this.state.bond = Math.round(value);
        if (this.phase !== 'mission') this.commit();
      },
      /** 以下三個只播畫面，不動存檔：驗收時用來快速看到每一種貼文外框與每一種打斷。 */
      playFeed: async (missionId) => preview(missionId, (mission, signal) => playFeedFor(this, mission, signal)),
      playInterlude: async (missionId) => preview(missionId, (mission, signal) => playInterlude(this, mission, signal, { preview: true })),
      playPrologue: async () => preview(this.content.missions[0].id, async (mission, signal) => playPrologue(this, signal)),
    };
  }
}
