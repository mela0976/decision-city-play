// 上次遊戲被瀏覽器強制關閉時的說明。
// 手機瀏覽器每個分頁的記憶體有上限（iPhone 上的 Chrome 與 Safari 都用 WebKit；Android Chrome 會顯示「糟糕！」或自動重新載入），
// 超過時瀏覽器直接關掉分頁，頁面來不及做任何事。
// 做法：畫面在前景時記一個「進行中」標記並定時更新；正常離開（切到背景、關閉）就清掉。
// 下次開啟時標記還在且時間很近，就代表上次是在前景被關掉，顯示說明。

import { LANG } from './strings.js?v=dbaa7c29';

const KEY = 'decision-city-alive-v1';
const RECENT_MS = 15 * 60 * 1000;

const TEXT = {
  zh: {
    title: '上次遊戲被瀏覽器關閉了',
    body: '手機瀏覽器能用的記憶體有限，iPhone 和 Android 都一樣。長時間自動前往會一路載入新的街景，超過上限時，瀏覽器會直接關掉分頁，顯示「無法開啟這個網頁」或「糟糕！」，或是自動重新載入頁面。這不是你的操作造成的。',
    tips: ['進度會保留到最近一次存檔的地方', '先關掉瀏覽器的其他分頁', '連續自動前往一段時間後，重新整理一次頁面'],
    ok: '知道了',
  },
  en: {
    title: 'The browser closed the game last time',
    body: 'Mobile browsers have limited memory, on both iPhone and Android. Long auto rides keep loading new streets, and when the limit is reached the browser closes the tab, shows "This page couldn\'t load" or "Aw, Snap!", or reloads the page. It was not caused by anything you did.',
    tips: ['Your progress is kept up to the last save', 'Close other browser tabs first', 'After a long stretch of auto riding, reload the page once'],
    ok: 'Got it',
  },
  ja: {
    title: '前回、ブラウザがゲームを閉じました',
    body: 'スマホのブラウザは使えるメモリが限られています（iPhone も Android も同じです）。自動移動を長く続けると街並みを次々に読み込み、上限を超えるとブラウザがタブを閉じて「このページを開けません」「エラー」と表示するか、ページを自動で再読み込みします。操作ミスではありません。',
    tips: ['進行状況は最後に保存したところまで残ります', 'ほかのタブを閉じておく', '自動移動をしばらく続けたら、一度ページを再読み込みする'],
    ok: 'わかった',
  },
};

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function write(value) {
  try { value ? localStorage.setItem(KEY, JSON.stringify(value)) : localStorage.removeItem(KEY); } catch { /* 私密模式等存不了就算了 */ }
}

function show(root) {
  const t = TEXT[LANG] || TEXT.zh;
  const dialog = document.createElement('dialog');
  dialog.className = 'crash-notice';
  dialog.setAttribute('aria-labelledby', 'crash-notice-title');
  const h2 = document.createElement('h2');
  h2.id = 'crash-notice-title';
  h2.textContent = t.title;
  const p = document.createElement('p');
  p.textContent = t.body;
  const ul = document.createElement('ul');
  for (const tip of t.tips) { const li = document.createElement('li'); li.textContent = tip; ul.append(li); }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn--primary';
  btn.textContent = t.ok;
  btn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  dialog.append(h2, p, ul, btn);
  root.append(dialog);
  try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
}

export function installCrashNotice({ root = document.body } = {}) {
  const last = read();
  if (last?.alive && Date.now() - last.t < RECENT_MS) show(root);

  const beat = () => { if (document.visibilityState === 'visible') write({ alive: true, t: Date.now() }); };
  const leave = () => write(null);
  beat();
  setInterval(beat, 10000);
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? beat() : leave()));
  window.addEventListener('pagehide', leave);
}
