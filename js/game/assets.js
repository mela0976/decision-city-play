// 素材清單：讀 assets/manifest.json；清單讀不到、key 不在清單、或檔案載入失敗，都記進 missing，
// 用到時由 .art 的色塊替代畫面頂著，流程不會停。

import { h } from './dom.js?v=2104ee78';
import { ENGINE_MODULES, ENGINE_DATA } from './engine-preload.js?v=2104ee78';

function toneOf(key) {
  let sum = 0;
  for (const ch of String(key)) sum = (sum * 31 + ch.charCodeAt(0)) % 9973;
  return sum % 5;
}

export async function loadAssets() {
  let manifest = { images: {}, videos: {}, audio: {}, models: {} };
  let manifestOk = false;
  try {
    const response = await fetch('assets/manifest.json', { cache: 'no-cache' });
    if (response.ok) {
      const data = await response.json();
      if (data && typeof data === 'object') {
        manifest = { images: data.images || {}, videos: data.videos || {}, audio: data.audio || {}, models: data.models || {} };
        manifestOk = true;
      }
    }
  } catch {
    manifestOk = false;
  }

  const missing = new Set();

  const imageSrc = (key) => {
    if (!key || missing.has(`image:${key}`)) return null;
    const src = manifest.images[key]?.src;
    if (!src) {
      missing.add(`image:${key}`);
      return null;
    }
    return src;
  };

  const video = (key) => {
    if (!key || missing.has(`video:${key}`)) return null;
    const info = manifest.videos[key];
    if (!info?.src) {
      missing.add(`video:${key}`);
      return null;
    }
    return { key, src: info.src, sec: Number(info.sec) || 5, poster: info.poster || null };
  };

  /** 一塊插畫：永遠先有色塊，圖載入成功才蓋上去。kind：wide（16:9）、portrait（3:4）、square。 */
  const art = (key, { kind = 'wide', alt = '', className = '' } = {}) => {
    const focus = manifest.images?.[key]?.focus; // 裁切時保留的重點（例如人物的臉），手機直向畫面特別需要
    const box = h('div', { class: `art art--${kind} ${className}`.trim(), dataset: { tone: String(toneOf(key)), key: key || '' }, vars: focus ? { '--focus': focus } : undefined });
    const src = imageSrc(key);
    if (src) {
      const img = h('img', { alt, decoding: 'async', draggable: 'false' });
      img.addEventListener('load', () => box.classList.add('has-img'));
      img.addEventListener('error', () => {
        missing.add(`image:${key}`);
        img.remove();
      });
      img.src = src;
      // 手機直向：有 9:16 直式版就換用（瀏覽器依方向自動挑，轉橫向時換回 16:9）
      const tall = manifest.images?.[key]?.portrait;
      if (tall) {
        box.dataset.portrait = '';
        box.append(h('picture', {}, h('source', { media: '(orientation: portrait) and (max-width: 900px)', srcset: tall }), img));
      } else box.append(img);
    } else if (alt) {
      box.setAttribute('role', 'img');
      box.setAttribute('aria-label', alt);
    }
    return box;
  };

  /** 給 canvas 合成用：載不到回傳 null。 */
  const loadImage = (key) =>
    new Promise((resolve) => {
      const src = imageSrc(key);
      if (!src) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        missing.add(`image:${key}`);
        resolve(null);
      };
      img.src = src;
    });

  const markMissing = (type, key) => missing.add(`${type}:${key}`);

  /** 聲音檔：kind 是 music、voice 或 sfx。清單裡沒有、或先前載入失敗過，就回傳 null（靜音，不報錯）。 */
  const audio = (kind, key) => {
    if (!key || missing.has(`audio:${kind}:${key}`)) return null;
    const info = manifest.audio?.[kind]?.[key];
    return info?.src ? info : null;
  };

  /** 假資料模式用：換上一份自帶的聲音清單（極短的測試音）。 */
  const setAudio = (table) => {
    manifest.audio = table || {};
  };

  /** 清單裡有沒有這張圖（只問，不記成缺檔）。 */
  const hasImage = (key) => !!key && !missing.has(`image:${key}`) && !!manifest.images[key]?.src;

  // ── P1 perf：預先下載 ─────────────────────────────────
  // 只把檔案抓進瀏覽器的 HTTP 快取（GitHub Pages 給 max-age=600），不解碼、不執行；
  // 之後真正的載入器（<img>、import、three.js 的 loader）直接命中快取。省流量模式不預載。
  const saveData = () => !!navigator.connection?.saveData;
  const warm = (url, priority = 'low') => fetch(url, { priority }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);

  /** 標題主視覺：高優先，比其他檔案先到。 */
  const warmTitle = () => {
    const src = imageSrc('title_key');
    if (src) warm(src, 'high');
  };

  /**
   * 城市：引擎程式用 modulepreload 下載（只下載與解析、不執行），地圖資料與 Draco 解碼器交給 worker 下載。
   * 回傳的 afterTitle() 在標題畫好之後呼叫：再依序下載街景貼圖、模型、職能立繪與開場（序幕插畫、開場影片）——
   * 城市建好之前網路是空著的，先抓好，選完職能就不用等。worker 讀回應，建城市的長任務不會讓下載停住。
   */
  let warming = null;
  const warmEngine = () => {
    if (warming) return warming;
    const abs = (src) => new URL(src, document.baseURI).href;
    if (saveData()) return (warming = { afterTitle: () => Promise.resolve() });
    for (const src of ENGINE_MODULES) {
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = src;
      document.head.append(link);
    }
    let worker = null;
    const waiting = new Map();
    try {
      worker = new Worker(new URL('./prefetch-worker.js?v=2104ee78', import.meta.url));
      worker.onmessage = ({ data }) => { waiting.get(data)?.(); waiting.delete(data); };
      worker.onerror = () => { for (const done of waiting.values()) done(); waiting.clear(); };
    } catch {
      worker = null;
    }
    // 沒有 worker：主執行緒照順序下載
    let chain = Promise.resolve();
    const group = (priority, urls) => {
      if (!worker) return (chain = chain.then(() => Promise.all(urls.map((u) => warm(u, priority)))));
      const id = waiting.size + Math.random();
      return new Promise((resolve) => { waiting.set(id, resolve); worker.postMessage({ id, priority, urls }); });
    };
    group('high', ENGINE_DATA.map(abs));
    const images = Object.entries(manifest.images);
    let rest = null;
    warming = {
      afterTitle: () => (rest ??= group('low', [
        ...images.map(([, i]) => i?.src).filter((src) => src?.startsWith('assets/tex/')),
        ...Object.values(manifest.models).map((m) => m?.src),
        ...images.filter(([key]) => key.startsWith('role_')).map(([, i]) => i?.src),
        manifest.images.loc_home?.src,
        manifest.videos.intro?.poster,
        manifest.videos.intro?.src,
      ].filter(Boolean).map(abs)).then(() => worker?.terminate())),
    };
    return warming;
  };

  /**
   * 預先解碼劇照：設定下一個目的地時就把那張圖下載並解碼（img.decode() 在背景執行緒），
   * 抵達後 art() 顯示同一個網址時直接用解碼好的圖，不在主執行緒同步解碼大圖。只留最近幾張，避免手機記憶體堆積。
   */
  const decodedStills = new Map();
  const predecode = (key) => {
    const src = imageSrc(key);
    if (!src || saveData()) return;
    const tall = manifest.images?.[key]?.portrait;
    const url = tall && matchMedia('(orientation: portrait) and (max-width: 900px)').matches ? tall : src;
    if (decodedStills.has(url)) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    img.decode().catch(() => {});
    decodedStills.set(url, img);
    while (decodedStills.size > 3) decodedStills.delete(decodedStills.keys().next().value);
  };

  return { manifestOk, missing, hasImage, imageSrc, video, art, loadImage, markMissing, toneOf, audio, setAudio, warmTitle, warmEngine, predecode };
}
