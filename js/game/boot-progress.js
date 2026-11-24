// 開機進度：把「載入中」換成百分比、進度條與目前步驟。
// 每個工作有權重；進行中的工作依瀏覽器實際載完的檔案數往前推（漸近，不會在完成前到頂），
// 工作完成就補滿。百分比只增不減。
import { T } from './strings.js?v=fced202e';

const TASKS = [
  ['assets', 5],   // 素材清單
  ['code', 35],    // 引擎程式與地圖資料
  ['city', 40],    // 建立城市（模型、貼圖）
  ['content', 15], // 遊戲內容
  ['title', 5],    // 標題畫面
];

export function createBootProgress(root) {
  const weight = Object.fromEntries(TASKS);
  const fraction = Object.fromEntries(TASKS.map(([id]) => [id, 0]));
  const active = new Map(); // id -> 開始後載完的檔案數
  let shown = 0;
  let observer = null;

  root.textContent = '';
  root.setAttribute('role', 'progressbar');
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '100');
  root.setAttribute('aria-label', T.loading);
  const pct = document.createElement('div');
  pct.className = 'boot-pct';
  const bar = document.createElement('div');
  bar.className = 'boot-bar';
  const fill = document.createElement('i');
  bar.append(fill);
  const step = document.createElement('div');
  step.className = 'boot-step';
  root.append(pct, bar, step);

  const render = () => {
    let total = 0;
    for (const [id, w] of TASKS) total += w * fraction[id];
    const value = Math.max(shown, Math.min(100, Math.floor(total)));
    shown = value;
    pct.textContent = `${value}%`;
    fill.style.inlineSize = `${value}%`;
    root.setAttribute('aria-valuenow', String(value));
    // 顯示目前最重、還沒完成的工作
    let label = '';
    let best = -1;
    for (const [id] of TASKS) if (active.has(id) && fraction[id] < 1 && weight[id] > best) { best = weight[id]; label = T.bootStep[id]; }
    step.textContent = label || T.bootStep.title;
  };

  const advance = (id) => {
    // 每多載完一個檔案就往前一點：f = 0.92 × (1 − e^(−n/18))
    const n = active.get(id) + 1;
    active.set(id, n);
    fraction[id] = Math.max(fraction[id], 0.92 * (1 - Math.exp(-n / 18)));
  };

  if (typeof PerformanceObserver === 'function') {
    try {
      observer = new PerformanceObserver((list) => {
        const count = list.getEntries().length;
        if (!count) return;
        for (const id of active.keys()) if (fraction[id] < 1) for (let i = 0; i < count; i += 1) advance(id);
        render();
      });
      observer.observe({ type: 'resource', buffered: false });
    } catch {
      observer = null;
    }
  }

  // 檔案很大、一個要載很久時也不要看起來卡住：每秒小推一點，同樣不會在完成前到頂。
  const timer = setInterval(() => {
    for (const id of active.keys()) if (fraction[id] < 1) fraction[id] = Math.max(fraction[id], Math.min(0.92, fraction[id] + 0.01));
    render();
  }, 1000);

  render();
  return {
    start(id) {
      if (!active.has(id)) active.set(id, 0);
      render();
    },
    done(id) {
      if (!active.has(id)) active.set(id, 0);
      fraction[id] = 1;
      render();
    },
    finish() {
      for (const [id] of TASKS) fraction[id] = 1;
      render();
      clearInterval(timer);
      observer?.disconnect();
    },
    fail() {
      clearInterval(timer);
      observer?.disconnect();
    },
  };
}
