// 小工具：建 DOM、可中止的等待。內容文字一律走 textContent，不用 innerHTML。

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'vars') for (const [k, v] of Object.entries(value)) el.style.setProperty(k, v);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, value);
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    if (Array.isArray(kid)) append(el, kid);
    else el.append(kid);
  }
}

/** 換掉 el 的內容；null 與 false 會略過（原生 replaceChildren 會把 null 變成文字）。 */
export function fill(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
  return el;
}

/**
 * 方向鍵在一組按鈕之間移動焦點（抉擇、問答用）：右／下到下一個，左／上到上一個。
 * 焦點到了哪一顆，空白鍵或 Enter 就按哪一顆（瀏覽器原生行為）。
 */
export function arrowFocus(panel, getButtons) {
  panel.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step || e.ctrlKey || e.metaKey || e.altKey) return;
    const buttons = getButtons().filter((b) => !b.disabled && b.offsetParent !== null);
    if (!buttons.length) return;
    e.preventDefault();
    const at = buttons.indexOf(document.activeElement);
    const next = at < 0 ? (step > 0 ? 0 : buttons.length - 1) : (at + step + buttons.length) % buttons.length;
    buttons[next].focus({ preventScroll: false });
  });
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function abortError() {
  return new DOMException('flow aborted', 'AbortError');
}

/**
 * 包一個可中止的互動：signal 中止時先跑 cleanup，再以 AbortError 結束。
 * run(resolve) 可回傳 cleanup 函式。
 */
export function interaction(signal, run) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    let cleanup = null;
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup?.();
      reject(abortError());
    };
    const done = (value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      cleanup?.();
      resolve(value);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    cleanup = run(done) || null;
  });
}

export function wait(ms, signal) {
  return interaction(signal, (done) => {
    const id = setTimeout(done, ms);
    return () => clearTimeout(id);
  });
}

export function formatDelta(n) {
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

export function clockToHours(clock) {
  const [hh, mm] = String(clock || '').split(':').map(Number);
  if (!Number.isFinite(hh)) return 8;
  return hh + (Number.isFinite(mm) ? mm / 60 : 0);
}

export function hoursToClock(hours) {
  const total = Math.round((((hours % 24) + 24) % 24) * 60);
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
