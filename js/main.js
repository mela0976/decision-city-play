// 進入點：讀素材清單、載入引擎（真的載不到或 ?mock=1 就用假引擎）、
// 載入內容（?fixtures=1 用假資料；真的內容讀不到時在標題畫面顯示可重試的錯誤）。

import { loadAssets } from './game/assets.js';
import { loadContent } from './game/content.js';
import { createStore } from './game/save.js';
import { createSound, voiceKey } from './game/sound.js';
import { Game } from './game/game.js';
import { showTitle } from './game/ui/title.js';
import { createHint } from './game/ui/hint.js';
import { hintFor } from './game/hints.js';
import { T, LANG } from './game/strings.js';
import { createBootProgress } from './game/boot-progress.js';

const params = new URLSearchParams(window.location.search);
const opts = {
  mock: params.get('mock') === '1',
  fixtures: params.get('fixtures') === '1',
  debug: params.get('debug') === '1',
};

const $ = (id) => document.getElementById(id);

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
  confirm: $('confirm'),
};
els.dialogs = [els.menu, els.proposal, els.sidelist, els.elder, els.confirm];

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
      const mod = await import('./engine/index.js');
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
  const mock = await import('./game/dev/mock-engine.js');
  const engine = await mock.createEngine({ canvas: els.canvas, minimapCanvas: els.minimap });
  progress.done('code');
  progress.done('city');
  return { engine, kind: 'mock' };
}

async function boot() {
  const store = createStore();
  progress.start('assets');
  const [assets, engineInfo] = await Promise.all([loadAssets().then((a) => { progress.done('assets'); return a; }), loadEngine()]);
  const prefs = store.readPrefs();
  // 聲音：第一次使用者操作之後才啟動，檔案用到才載，所以不會拖慢標題畫面。
  const sound = createSound({
    assets,
    prefs: { volumes: prefs.volumes, muted: prefs.muted ?? prefs.sound === false },
    onPrefs: (next) => store.writePrefs({ ...store.readPrefs(), ...next }),
  });
  const { engine, kind } = engineInfo;
  engine.setPaused(true);
  engine.setInputEnabled(false);
  engine.start();

  let game = null;
  // 內容還沒載入成功時，動作鍵與提示列由這裡先頂著。
  const hint = createHint({ root: els.hint, stage: els.stage });
  window.addEventListener('keydown', (e) => {
    if (game || !['Enter', ' ', 'e', 'E'].includes(e.key) || e.repeat) return;
    const primary = els.screen.querySelector('[data-primary]');
    if (primary && document.activeElement !== primary) primary.click();
  });

  const startWith = async (useFixtures) => {
    let content;
    try {
      progress.start('content');
      content = await loadContent({ useFixtures });
      progress.done('content');
    } catch (err) {
      // PRD 第 10 節：內容載入失敗時留在標題畫面，顯示可重試的錯誤，不進入遊戲。
      els.stage.dataset.phase = 'title';
      hint.set(hintFor({ kind: 'error' }, matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard'));
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
      const { buildFixtureAudio } = await import('./game/dev/fixtures/audio.js');
      assets.setAudio(buildFixtureAudio(content, voiceKey));
    }
    game = new Game({ content, assets, engine, engineKind: kind, store, sound, hint, els, opts });
    if (opts.debug) {
      const { mountDebug } = await import('./game/ui/debug.js');
      mountDebug({ game, content });
      window.__DC_GAME__ = game;
    }
    progress.finish();
    game.showTitle();
  };

  await startWith(opts.fixtures);
}

boot().catch((err) => {
  console.error('[決策之城] 啟動失敗', err);
  progress.fail();
  $('boot-plate').textContent = `${T.contentFailed} ${err?.message || ''}`;
});
