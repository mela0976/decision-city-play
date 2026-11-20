// 素材清單：讀 assets/manifest.json；清單讀不到、key 不在清單、或檔案載入失敗，都記進 missing，
// 用到時由 .art 的色塊替代畫面頂著，流程不會停。

import { h } from './dom.js';

function toneOf(key) {
  let sum = 0;
  for (const ch of String(key)) sum = (sum * 31 + ch.charCodeAt(0)) % 9973;
  return sum % 5;
}

export async function loadAssets() {
  let manifest = { images: {}, videos: {}, audio: {} };
  let manifestOk = false;
  try {
    const response = await fetch('assets/manifest.json', { cache: 'no-cache' });
    if (response.ok) {
      const data = await response.json();
      if (data && typeof data === 'object') {
        manifest = { images: data.images || {}, videos: data.videos || {}, audio: data.audio || {} };
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
    const box = h('div', { class: `art art--${kind} ${className}`.trim(), dataset: { tone: String(toneOf(key)), key: key || '' } });
    const src = imageSrc(key);
    if (src) {
      const img = h('img', { alt, decoding: 'async', draggable: 'false' });
      img.addEventListener('load', () => box.classList.add('has-img'));
      img.addEventListener('error', () => {
        missing.add(`image:${key}`);
        img.remove();
      });
      img.src = src;
      box.append(img);
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

  return { manifestOk, missing, hasImage, imageSrc, video, art, loadImage, markMissing, toneOf, audio, setAudio };
}
