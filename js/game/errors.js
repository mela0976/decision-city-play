// 出錯時的友善處理：全域攔截 window error、unhandledrejection 與 WebGL context lost。
// 每筆錯誤寫進本機紀錄（localStorage，最多 50 筆），再顯示一張不擋遊戲的錯誤卡：
//   回到路上（遊戲既有的 unstuck）／重新整理（存檔不動）／複製錯誤資訊（給玩家回報用）。
// 同一個錯誤短時間內重複只顯示一次。不送任何資料到外部服務。

import { h } from './dom.js?v=96676fd2';
import { T, LANG } from './strings.js?v=96676fd2';
import { VERSION, BUILT } from './version.js?v=96676fd2';

export const ERROR_LOG_KEY = 'decision-city-errors-v1';
const LOG_MAX = 50;
const REPEAT_MS = 30000;
const WEBGL_WAIT_MS = 4000;
// 不算遊戲壞掉的雜訊：流程中止、瀏覽器擋自動播放、ResizeObserver 的已知警告、跨來源腳本（擴充功能）的無內容錯誤
const QUIET_NAMES = new Set(['AbortError', 'NotAllowedError']);
const QUIET_TEXT = [/ResizeObserver loop/i, /^Script error\.?$/i];

function readLog() {
  try {
    const list = JSON.parse(window.localStorage.getItem(ERROR_LOG_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLog(list) {
  try {
    window.localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(list.slice(-LOG_MAX)));
  } catch {
    /* 存不了就只留在這次的記憶體裡 */
  }
}

const trimStack = (stack) => String(stack || '').split('\n').slice(0, 6).map((line) => line.trim()).join('\n').slice(0, 900);
const sameOrigin = (file) => !file || file.startsWith(window.location.origin) || file.startsWith('blob:') || file === window.location.href;

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 沒有剪貼簿權限（例如非 https）：退回選取文字的舊做法
    const area = h('textarea', { readonly: true, 'aria-hidden': 'true', style: 'position:fixed;opacity:0;inset:0 auto auto 0' });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

/**
 * 裝上全域攔截。回傳：
 *   setContext(fn)  fn() 回傳目前畫面狀態（給「複製錯誤資訊」）
 *   setActions({ unstuck, recovered })  遊戲建好之後接上「回到路上」與 WebGL 恢復後的提示
 *   report(err, kind)  手動回報一筆（例如啟動失敗）
 */
export function installErrorGuard({ root = document.body } = {}) {
  let memory = readLog();
  let context = () => ({});
  let actions = {};
  const shownAt = new Map();
  let lastKey = '';

  const title = h('h2', { id: 'oops-title', text: T.oops.title });
  const text = h('p', { id: 'oops-text', text: T.oops.text });
  const back = h('button', { type: 'button', class: 'btn btn--primary', id: 'oops-back', text: T.oops.back });
  const reload = h('button', { type: 'button', class: 'btn', id: 'oops-reload', text: T.oops.reload });
  const copy = h('button', { type: 'button', class: 'btn', id: 'oops-copy', text: T.oops.copy });
  const card = h('section', { id: 'oops', class: 'oops', role: 'alertdialog', 'aria-labelledby': 'oops-title', 'aria-describedby': 'oops-text', popover: 'manual' }, title, text, h('div', { class: 'oops-actions' }, back, reload, copy));
  root.append(card);

  const isOpen = () => card.matches(':popover-open');
  const hide = () => {
    if (isOpen()) card.hidePopover();
  };
  const show = (key) => {
    const now = Date.now();
    if (now - (shownAt.get(key) || 0) < REPEAT_MS) return;
    shownAt.set(key, now);
    lastKey = key;
    // 對話框（選單等）開著時，卡片會被它的背景擋住，先把它收掉
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    copy.textContent = T.oops.copy;
    if (!isOpen()) card.showPopover();
    document.documentElement.dataset.oops = key.split(':')[0];
  };
  card.addEventListener('toggle', (e) => {
    if (e.newState === 'closed') delete document.documentElement.dataset.oops;
  });

  back.addEventListener('click', () => {
    hide();
    try {
      actions.unstuck?.();
    } catch (err) {
      record({ kind: 'error', message: `unstuck: ${err?.message || err}`, stack: err?.stack });
    }
  });
  reload.addEventListener('click', () => window.location.reload());
  copy.addEventListener('click', async () => {
    const ok = await copyText(buildReport());
    copy.textContent = ok ? T.oops.copied : T.oops.copyFailed;
  });
  // Esc 收卡（焦點在哪都一樣），這一下不再打開遊戲選單
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !isOpen()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      hide();
    },
    true,
  );

  function record({ kind, message, where = '', stack = '' }) {
    const now = Date.now();
    const last = memory[memory.length - 1];
    if (last && last.kind === kind && last.message === message && now - last.ts < REPEAT_MS) {
      last.count = (last.count || 1) + 1;
      last.ts = now;
    } else {
      let phase = '';
      try {
        phase = context()?.phase || '';
      } catch {
        phase = '';
      }
      memory.push({ ts: now, at: new Date(now).toISOString(), kind, message: String(message).slice(0, 400), where, stack: trimStack(stack), phase, version: VERSION, count: 1 });
    }
    memory = memory.slice(-LOG_MAX);
    writeLog(memory);
    return `${kind}:${message}`;
  }

  function capture(kind, err, where = '') {
    const message = err?.message || (typeof err === 'string' ? err : '') || String(err);
    const name = err?.name || '';
    if (QUIET_NAMES.has(name) || QUIET_TEXT.some((re) => re.test(message))) return;
    show(record({ kind, message: name && name !== 'Error' && !message.startsWith(name) ? `${name}: ${message}` : message, where, stack: err?.stack }));
  }

  window.addEventListener('error', (e) => {
    // 只管這個網站自己的程式；資源載入失敗（img、audio）不會走到這裡（不是 window 上的事件）
    if (!sameOrigin(e.filename || '')) return;
    capture('error', e.error || e.message, e.filename ? `${e.filename.replace(window.location.origin, '')}:${e.lineno}:${e.colno}` : '');
  });
  window.addEventListener('unhandledrejection', (e) => capture('promise', e.reason));

  // WebGL：先請瀏覽器還回 context（preventDefault），等一下看有沒有恢復——
  // 瀏覽器還回來（webglcontextrestored）或引擎自己換成 2D 都算恢復；第二次失去或等不到才出錯誤卡。
  let webglTries = 0;
  document.addEventListener(
    'webglcontextlost',
    (e) => {
      const canvas = e.target;
      if (!(canvas instanceof HTMLCanvasElement)) return;
      e.preventDefault();
      webglTries += 1;
      const key = record({ kind: 'webgl', message: 'WebGL context lost', where: canvas.id ? `#${canvas.id}` : 'canvas' });
      if (webglTries > 1) {
        show(key);
        return;
      }
      const before = canvas.dataset.engine || '';
      let restored = false;
      const onRestore = () => {
        restored = true;
      };
      canvas.addEventListener('webglcontextrestored', onRestore, { once: true });
      setTimeout(() => {
        canvas.removeEventListener('webglcontextrestored', onRestore);
        const fellBack = before !== '2d' && canvas.dataset.engine === '2d';
        if (restored || fellBack) {
          record({ kind: 'webgl', message: restored ? 'WebGL context restored' : 'WebGL fallback to 2D', where: canvas.id ? `#${canvas.id}` : 'canvas' });
          actions.recovered?.();
          return;
        }
        show(record({ kind: 'webgl', message: 'WebGL context not restored', where: canvas.id ? `#${canvas.id}` : 'canvas' }));
      }, WEBGL_WAIT_MS);
    },
    true,
  );

  function buildReport() {
    let state = {};
    try {
      state = context() || {};
    } catch (err) {
      state = { contextError: err?.message || String(err) };
    }
    const canvas = document.getElementById('city');
    const lines = [
      `Decision City ${VERSION}${BUILT ? ` (${BUILT})` : ''}`,
      `time: ${new Date().toISOString()}`,
      `url: ${window.location.href}`,
      `lang: ${LANG}`,
      `browser: ${navigator.userAgent}`,
      `screen: ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x, ${matchMedia('(pointer: coarse)').matches ? 'touch' : 'pointer'}`,
      `engine: ${state.engineKind || '?'} / ${canvas?.dataset.engine || '?'} / ${canvas?.dataset.engineReason || ''}`,
      `state: ${JSON.stringify({ ...state, engineKind: undefined })}`,
      'recent errors:',
      ...memory.slice(-8).reverse().flatMap((e) => [`- ${e.at} [${e.kind}] ${e.message}${e.count > 1 ? ` (x${e.count})` : ''}${e.where ? ` @ ${e.where}` : ''}${e.phase ? ` <${e.phase}>` : ''}`, ...(e.stack ? e.stack.split('\n').slice(0, 3).map((s) => `    ${s}`) : [])]),
    ];
    return lines.join('\n');
  }

  return {
    setContext(fn) {
      context = typeof fn === 'function' ? fn : () => ({});
    },
    setActions(next) {
      actions = { ...actions, ...next };
    },
    report(err, kind = 'error') {
      capture(kind, err);
    },
    get log() {
      return memory.map((e) => ({ ...e }));
    },
    get lastKey() {
      return lastKey;
    },
    buildReport,
    hide,
  };
}
