// 飛天車自動前往的航線：不管道路，只避開建築，在格子上找最短路線（A*，八方向），
// 再把看得到的點直接連起來（拉直），轉角只留在需要繞過建築的地方。
// blocked(x,y) 由呼叫端提供：該點（含機身與餘裕）碰到建築就回傳 true。座標單位與世界座標相同。

const SQRT2 = Math.SQRT2;

function visible(a, b, blocked, step) {
  const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / step);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (blocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

function search(start, end, blocked, cell, margin) {
  const minX = Math.min(start.x, end.x) - margin, minY = Math.min(start.y, end.y) - margin;
  const W = Math.ceil((Math.max(start.x, end.x) + margin - minX) / cell) + 1;
  const H = Math.ceil((Math.max(start.y, end.y) + margin - minY) / cell) + 1;
  const N = W * H;
  const state = new Uint8Array(N); // 0 未查，1 可飛，2 建築
  const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const idx = (x, y) => y * W + x;
  const cx = (p) => Math.min(W - 1, Math.max(0, Math.round((p.x - minX) / cell)));
  const cy = (p) => Math.min(H - 1, Math.max(0, Math.round((p.y - minY) / cell)));
  const sx = cx(start), sy = cy(start), ex = cx(end), ey = cy(end), s = idx(sx, sy), e = idx(ex, ey);
  const free = (i) => {
    if (i === s || i === e) return true; // 起點在空中、終點在車道上，都算可到
    if (!state[i]) state[i] = blocked(minX + (i % W) * cell, minY + Math.floor(i / W) * cell) ? 2 : 1;
    return state[i] === 1;
  };
  const h = (i) => { const dx = Math.abs(i % W - ex), dy = Math.abs(Math.floor(i / W) - ey); return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy); };
  // 二元堆積
  const heap = [], f = new Float32Array(N);
  const push = (i) => { heap.push(i); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[i]) break; heap[k] = heap[p]; k = p; } heap[k] = i; };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { let k = 0; for (;;) { let c = 2 * k + 1; if (c >= heap.length) break; if (c + 1 < heap.length && f[heap[c + 1]] < f[heap[c]]) c++; if (f[heap[c]] >= f[last]) break; heap[k] = heap[c]; k = c; } heap[k] = last; } return top; };
  g[s] = 0; f[s] = h(s); push(s);
  let budget = 400000;
  while (heap.length && budget-- > 0) {
    const i = pop();
    if (closed[i]) continue;
    if (i === e) break;
    closed[i] = 1;
    const x = i % W, y = Math.floor(i / W);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = idx(nx, ny);
      if (closed[j] || !free(j)) continue;
      if (dx && dy && (!free(idx(x + dx, y)) || !free(idx(x, y + dy)))) continue; // 不從兩棟建築的對角縫隙鑽過去
      const cost = g[i] + (dx && dy ? SQRT2 : 1);
      if (cost < g[j]) { g[j] = cost; from[j] = i; f[j] = cost + h(j); push(j); }
    }
  }
  if (from[e] < 0 && e !== s) return null;
  const cells = [];
  for (let i = e; i !== s && i >= 0; i = from[i]) cells.unshift({ x: minX + (i % W) * cell, y: minY + Math.floor(i / W) * cell });
  return cells;
}

export function planFlight(start, end, blocked, { cell, margin }) {
  let cells = search(start, end, blocked, cell, margin) ?? search(start, end, blocked, cell * 1.5, margin * 3);
  if (!cells) return [{ x: end.x, y: end.y }]; // 實在找不到：直線飛（交給高度與後續處理）
  cells[cells.length - 1] = { x: end.x, y: end.y };
  // 拉直：從目前的點往後找最遠、中間不碰建築的點
  const out = [];
  let from = start, k = 0;
  const step = cell * 0.4;
  while (k < cells.length) {
    let far = k;
    for (let j = cells.length - 1; j > k; j--) if (visible(from, cells[j], blocked, step)) { far = j; break; }
    out.push(cells[far]);
    from = cells[far];
    k = far + 1;
  }
  return out;
}
