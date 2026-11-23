// 進入點：讀素材清單、載入引擎（真的載不到或 ?mock=1 就用假引擎）、
// 載入內容（?fixtures=1 用假資料；真的內容讀不到時在標題畫面顯示可重試的錯誤）。

import { installErrorGuard } from './game/errors.js?v=51145f5b';
import { installCrashNotice } from './game/crash-notice.js?v=51145f5b';
import { VERSION } from './game/version.js?v=51145f5b';
import { loadAssets } from './game/assets.js?v=51145f5b';
import { loadContent } from './game/content.js?v=51145f5b';
import { createStore } from './game/save.js?v=51145f5b';
import { createSound, voiceKey } from './game/sound.js?v=51145f5b';
import { Game } from './game/game.js?v=51145f5b';
import { showTitle } from './game/ui/title.js?v=51145f5b';
import { createHint } from './game/ui/hint.js?v=51145f5b';
import { hintFor } from './game/hints.js?v=51145f5b';
import { T, LANG } from './game/strings.js?v=51145f5b';
import { createBootProgress } from './game/boot-progress.js?v=51145f5b';

const params = new URLSearchParams(window.location.search);
const opts = {
  mock: params.get('mock') === '1',
  fixtures: params.get('fixtures') === '1',
  debug: params.get('debug') === '1',
};

const $ = (id) => document.getElementById(id);
// 先裝錯誤攔截：之後任何一步出錯都會記進本機紀錄，並顯示可以回到路上、重新整理或複製資訊的錯誤卡。
const guard = installErrorGuard({ root: document.body });
// 上次在前景被瀏覽器強制關閉（手機記憶體不足）時，說明原因
installCrashNotice({ root: document.body });
document.documentElement.dataset.version = VERSION;
if (opts.debug) window.__DC_ERRORS__ = guard;

// i18n：index.html 寫的是中文；譯版在這裡換掉頁面標題、說明與無障礙標籤（<html lang> 由 lang.js 設定）
if (LANG !== 'zh') {
  document.title = T.metaTitle;
  for (const sel of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) document.querySelector(sel)?.setAttribute('content', T.metaDesc);
  for (const sel of ['meta[property="og:title"]', 'meta[property="og:site_name"]', 'meta[name="twitter:title"]']) document.querySelector(sel)?.setAttribute('content', T.metaTitle);
  document.querySelector('meta[property="og:locale"]')?.setAttribute('content', LANG === 'ja' ? 'ja_JP' : 'en_US');
  $('city')?.setAttribute('aria-label', T.a11yCity);
  $('hud-clock')?.setAttribute('aria-label', T.a11yClock);
  $('boot-plate').textContent = T.loading;
}
const els = {
  stage: $('stage'),
  world: $('world'),
  canvas: $('city'),
  minimap: $('minimap'),
  scene: $('scene'),
  hud: $('hud'),
  layer: $('layer'),
  screen: $('screen'),
  toasts: $('toasts'),
  hint: $('hint'),
  pause: $('pause-plate'),
  menu: $('menu'),
  proposal: $('proposal'),
  sidelist: $('sidelist'),
  elder: $('elder'),
  manual: $('manual'),
  confirm: $('confirm'),
};
els.dialogs = [els.menu, els.proposal, els.sidelist, els.elder, els.manual, els.confirm];

// 手機上任務牌可能折成兩行、還有靈感計數：量 HUD 實際的底邊，提示一律排在它下面（CSS 的 --hud-bottom）
try {
  const syncHudBottom = () => {
    let bottom = 0;
    for (const el of els.hud.querySelectorAll('.hud-task, .hud-meters, .hud-id, #hud-inspire, .hud-corner')) {
      if (el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.height) bottom = Math.max(bottom, r.bottom - els.stage.getBoundingClientRect().top);
    }
    els.stage.style.setProperty('--hud-bottom', `${Math.round(bottom)}px`);
  };
  new ResizeObserver(syncHudBottom).observe(els.hud);
  new MutationObserver(syncHudBottom).observe(els.hud, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'], childList: true, characterData: true });
  window.addEventListener('resize', syncHudBottom);
} catch {
  /* 舊瀏覽器沒有 ResizeObserver：維持 CSS 的固定位置 */
}
const progress = createBootProgress($('boot-plate'));
els.pause.textContent = T.paused;

/** 換一張全新的 canvas：真引擎初始化到一半失敗時，舊 canvas 可能已經被綁了別種 context。 */
function freshCanvas(key) {
  const old = els[key];
  const next = old.cloneNode(false);
  old.replaceWith(next);
  els[key] = next;
  return next;
}

async function loadEngine() {
  if (!opts.mock) {
    try {
      progress.start('code');
      const mod = await import('./engine/index.js?v=51145f5b');
      progress.done('code');
      progress.start('city');
      const engine = await mod.createEngine({ canvas: els.canvas, minimapCanvas: els.minimap });
      progress.done('city');
      return { engine, kind: 'real' };
    } catch (err) {
      console.warn('[決策之城] 真引擎載入失敗，改用假引擎。', err);
      for (const node of els.world.querySelectorAll('[class^="dc-engine-"], [class*=" dc-engine-"]')) node.remove();
      freshCanvas('canvas');
      freshCanvas('minimap');
    }
  }
  const mock = await import('./game/dev/mock-engine.js?v=51145f5b');
  const engine = await mock.createEngine({ canvas: els.canvas, minimapCanvas: els.minimap });
  progress.done('code');
  progress.done('city');
  return { engine, kind: 'mock' };
}

async function boot() {
  const store = createStore();
  progress.start('assets');
  progress.start('content');
  const assets = await loadAssets();
  progress.done('assets');
  // P1 perf：標題主視覺最先抓；引擎檔案在標題期間背景下載（不執行），標題畫好才建城市。
  assets.warmTitle?.();
  if (!opts.mock) {
    progress.start('code');
    assets.warmEngine?.();
  }
  const prefs = store.readPrefs();
  // 聲音：第一次使用者操作之後才啟動，檔案用到才載，所以不會拖慢標題畫面。
  const sound = createSound({
    assets,
    prefs: { volumes: prefs.volumes, muted: prefs.muted ?? prefs.sound === false },
    onPrefs: (next) => store.writePrefs({ ...store.readPrefs(), ...next }),
  });

  let game = null;
  // 內容還沒載入成功時，動作鍵與提示列由這裡先頂著。
  const hint = createHint({ root: els.hint, stage: els.stage });
  window.addEventListener('keydown', (e) => {
    if (game || !['Enter', ' ', 'e', 'E'].includes(e.key) || e.repeat) return;
    const primary = els.screen.querySelector('[data-primary]');
    if (primary && document.activeElement !== primary) primary.click();
  });
  const inputMode = () => (matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard');

  // P1 perf：引擎只建一次；標題畫好（或最多等 2.5 秒）才開始執行引擎程式。
  let engineInfo = null;
  const engineReady = () => (engineInfo ??= loadEngine().then((info) => {
    info.engine.setPaused(true);
    info.engine.setInputEnabled(false);
    info.engine.start();
    guard.setContext(() => ({ phase: els.stage.dataset.phase, engineKind: info.kind }));
    return info;
  }));

  const startWith = async (useFixtures) => {
    let content;
    try {
      progress.start('content');
      content = await loadContent({ useFixtures });
      progress.done('content');
    } catch (err) {
      // PRD 第 10 節：內容載入失敗時留在標題畫面，顯示可重試的錯誤，不進入遊戲。
      els.stage.dataset.phase = 'title';
      hint.set(hintFor({ kind: 'error' }, inputMode()));
      const ui = showTitle({
        screen: els.screen,
        assets,
        error: err?.message || String(err),
        onRetry: () => {
          ui.destroy();
          startWith(useFixtures);
        },
        onFixtures: () => {
          ui.destroy();
          startWith(true);
        },
      });
      progress.finish();
      return;
    }
    if (content.source === 'fixtures') {
      // 假資料自帶一份極短的測試音，讓聲音的行為（該播、該停）在沒有正式音檔時也驗得到。
      const { buildFixtureAudio } = await import('./game/dev/fixtures/audio.js?v=51145f5b');
      assets.setAudio(buildFixtureAudio(content, voiceKey));
    }

    // P1 perf：先畫一張「開機標題」（和遊戲的標題同一個元件），城市在背景建；按了任何按鈕就等城市好了再接手。
    // 假引擎（?mock=1）一下就好，不用開機標題，流程與以前相同。
    const early = opts.mock ? null : earlyTitle({ content, store, assets, sound, hint, inputMode });
    if (early) {
      await early.painted;
      assets.warmEngine?.().afterTitle();
    }
    const { engine, kind } = await engineReady();
    game = new Game({ content, assets, engine, engineKind: kind, store, sound, hint, els, opts });
    guard.setActions({
      unstuck: () => {
        if (game.inGame && game.free) game.unstuck();
        game.syncWorld();
        game.focusCanvas();
      },
      recovered: () => game.toast(T.oops.recovered),
    });
    guard.setContext(() => game.errorContext());
    if (opts.debug) {
      const { mountDebug } = await import('./game/ui/debug.js?v=51145f5b');
      mountDebug({ game, content });
      window.__DC_GAME__ = game;
    }
    progress.finish();
    if (early) early.handOff(game);
    else game.showTitle();
  };

  await startWith(opts.fixtures);
}

/**
 * P1 perf：開機標題。引擎還沒好時先給玩家看標題；玩家按下的動作記著，引擎好了由遊戲照常處理。
 * 引擎好了而玩家還沒按：遊戲重畫同一張標題（is-instant：不再淡入、霓虹不再閃一次）。
 */
function earlyTitle({ content, store, assets, sound, hint, inputMode }) {
  const saved = store.read();
  const roleId = saved?.roleId && content.roleById?.get(saved.roleId) ? saved.roleId : null;
  const grandmaOn = !!content.grandma && !!saved?.grandma?.on;
  let pending = null;
  const want = (action) => () => {
    if (pending) return;
    pending = action;
    // 城市還沒建好：回到載入畫面（百分比繼續走），好了直接進下一步
    els.stage.dataset.phase = 'boot';
  };
  els.stage.dataset.phase = 'title';
  els.stage.dataset.boot = 'early';
  const ui = showTitle({
    screen: els.screen,
    assets,
    canContinue: !!roleId,
    continueNote: roleId ? `${content.roleById.get(roleId)?.title || ''}・${saved.clock || ''}` : '',
    grandmaOn,
    secretCode: content.grandma?.unlock?.titleCode,
    badge: content.source === 'fixtures' ? T.fixturesBadge : '',
    onStart: want('start'),
    onContinue: want('continue'),
    onProposal: want('proposal'),
    onSecret: content.grandma ? want('secret') : null,
  });
  hint.set(hintFor({ kind: 'title', canContinue: !!roleId }, inputMode()));
  sound.music.play(grandmaOn ? 'music_grandma' : 'music_title');
  // 標題主視覺載完（或 2.5 秒）且畫上去之後才開始建城市
  const art = els.screen.querySelector('.title-art');
  const painted = new Promise((resolve) => {
    const img = art?.querySelector('img');
    const done = () => requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    if (!img || img.complete) { done(); return; }
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
    setTimeout(done, 2500);
  });
  return {
    painted,
    handOff(game) {
      const focused = document.activeElement?.id;
      ui.destroy?.();
      delete els.stage.dataset.boot;
      game.showTitle();
      const title = els.screen.querySelector('.title');
      if (title && !pending) {
        title.classList.add('is-instant');
        const fresh = title.querySelector('.title-art');
        if (fresh?.querySelector('img')?.complete) fresh.classList.add('has-img');
        if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
      }
      if (pending === 'start') game.startNew();
      else if (pending === 'continue') game.continueRun();
      else if (pending === 'proposal') game.openProposal();
      else if (pending === 'secret') game.unlockGrandma();
    },
  };
}

boot().catch((err) => {
  console.error('[決策之城] 啟動失敗', err);
  guard.report(err, 'boot');
  progress.fail();
  $('boot-plate').textContent = `${T.contentFailed} ${err?.message || ''}`;
});
