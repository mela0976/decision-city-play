// 結局分享圖：用 canvas 畫一張 1080×1350 的成果卡（遊戲名、職能、結局等級與標題、四個數值、
// 完成任務與支線數、提案第一頁標題、遊戲網址），沿用遊戲的深色底與霓虹綠。
// 能分享檔案就用系統分享（圖片＋網址），不能就下載 PNG 並把網址複製到剪貼簿。全部在本機產生，不上傳。

import { T, LANG, METER_IDS, METER_NAMES } from './strings.js?v=897423c';
import { copyText } from './errors.js?v=897423c';

export const SHARE_W = 1080;
export const SHARE_H = 1350;
const PAD = 84;
const C = { ink: '#06080c', night: '#0b1018', text: '#f3f0e9', muted: '#b3bac4', neon: '#3dff9a', post: '#0b7a55', red: '#e5402f', line: 'rgba(255,255,255,0.16)' };
const FALLBACK_URL = 'https://mela0976.github.io/decision-city-play/';

/** 最近一次產生的分享圖（測試與除錯用）。 */
export let lastShare = null;

/** 遊戲網址：用頁面宣告的正式網址（本機開發時的 localhost 不能分享），譯版帶上語言。 */
export function shareUrl() {
  const base = document.querySelector('meta[property="og:url"]')?.getAttribute('content') || FALLBACK_URL;
  return LANG === 'zh' ? base : `${base}?lang=${LANG}`;
}

const cssVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const quote = (text) => (LANG === 'en' ? `“${text}”` : `「${text}」`);

/** 斷行：中日文逐字、英文逐詞；超過 maxLines 行的最後一行加省略號。 */
function wrap(ctx, text, width, maxLines) {
  const tokens = String(text).match(/[⺀-鿿豈-﫿＀-￯　-〿]|[^\s⺀-鿿豈-﫿＀-￯　-〿]+|\s+/g) || [];
  const lines = [];
  let line = '';
  for (const token of tokens) {
    const next = line + token;
    if (ctx.measureText(next.trimEnd()).width <= width || !line.trim()) {
      line = next;
      continue;
    }
    lines.push(line.trim());
    line = token.trim() ? token : '';
  }
  if (line.trim()) lines.push(line.trim());
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

function loadImage(src, ms = 4000) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    const timer = setTimeout(() => resolve(null), ms);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function cover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

/** 畫分享圖，回傳 canvas。data 見 shareResult。 */
export async function drawShareCard(data) {
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext('2d');
  const font = cssVar('--font', 'sans-serif');
  const mono = cssVar('--mono', 'monospace');
  await document.fonts?.ready;
  const f = (size, weight = 600, family = font) => `${weight} ${size}px ${family}`;

  // 底：深色＋極淡的小口磚格線
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let y = 0; y < SHARE_H; y += 26) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(SHARE_W, y + 0.5);
    ctx.stroke();
  }

  // 上半：結局圖，往下淡進底色；沒有圖就是一團霓虹綠的光
  const ART_H = 540;
  const art = await loadImage(data.imageSrc);
  if (art) cover(ctx, art, 0, 0, SHARE_W, ART_H);
  else {
    const glow = ctx.createRadialGradient(SHARE_W * 0.7, 160, 20, SHARE_W * 0.7, 160, 640);
    glow.addColorStop(0, 'rgba(61,255,154,0.28)');
    glow.addColorStop(1, 'rgba(61,255,154,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SHARE_W, ART_H);
  }
  const fade = ctx.createLinearGradient(0, 0, 0, ART_H);
  fade.addColorStop(0, 'rgba(6,8,12,0.72)');
  fade.addColorStop(0.32, 'rgba(6,8,12,0.12)');
  fade.addColorStop(0.7, 'rgba(6,8,12,0.55)');
  fade.addColorStop(1, C.ink);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, SHARE_W, ART_H);

  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 18;
  // 遊戲名（霓虹招牌的綠）
  ctx.fillStyle = C.neon;
  ctx.font = f(76, 800);
  ctx.fillText(T.name, PAD, 140);
  if (T.name !== T.nameEn) {
    ctx.fillStyle = C.text;
    ctx.font = f(30, 600);
    ctx.fillText(T.nameEn.toUpperCase().split('').join(' '), PAD + 4, 190);
  }
  ctx.shadowBlur = 0;

  // 職能：一塊郵局綠的路名牌
  let y = 500;
  if (data.role) {
    ctx.font = f(36, 700);
    const w = Math.min(ctx.measureText(data.role).width + 44, SHARE_W - PAD * 2 - 200);
    ctx.fillStyle = C.post;
    ctx.fillRect(PAD, y - 46, w, 62);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(PAD + 5, y - 41, w - 10, 52);
    ctx.fillStyle = '#fff';
    ctx.fillText(wrap(ctx, data.role, w - 44, 1)[0] || '', PAD + 22, y - 3);
  }

  // 結局等級：朱紅印章（右側，微微斜放）
  if (data.stamp) {
    ctx.save();
    ctx.translate(SHARE_W - PAD - 92, 500);
    ctx.rotate((-7 * Math.PI) / 180);
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 6;
    ctx.fillStyle = 'rgba(229,64,47,0.12)';
    ctx.fillRect(-88, -88, 176, 176);
    ctx.strokeRect(-88, -88, 176, 176);
    ctx.lineWidth = 2;
    ctx.strokeRect(-100, -100, 200, 200);
    ctx.fillStyle = C.red;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const s = String(data.stamp);
    ctx.font = f([...s].length > 2 ? 64 : 112, 800);
    ctx.shadowColor = 'rgba(229,64,47,0.6)';
    ctx.shadowBlur = 20;
    ctx.fillText(s, 0, 6);
    ctx.restore();
  }

  // 結局標題
  y = 612;
  ctx.fillStyle = C.text;
  ctx.font = f(62, 700);
  const titleLines = wrap(ctx, data.endingTitle || '', SHARE_W - PAD * 2 - 220, 2);
  for (const line of titleLines) {
    ctx.fillText(line, PAD, y);
    y += 74;
  }

  // 四個數值：兩欄兩列，名稱＋等寬數字＋一條燈管
  y = Math.max(y - 20, 660);
  const colW = (SHARE_W - PAD * 2 - 60) / 2;
  const ROW = 98;
  METER_IDS.forEach((id, i) => {
    const x = PAD + (i % 2) * (colW + 60);
    const top = y + Math.floor(i / 2) * ROW;
    const value = Math.max(0, Math.min(100, Math.round(data.meters?.[id] ?? 0)));
    ctx.fillStyle = C.muted;
    ctx.font = f(30, 600);
    ctx.textAlign = 'left';
    ctx.fillText(METER_NAMES[id], x, top + 40);
    ctx.fillStyle = C.text;
    ctx.font = f(44, 700, mono);
    ctx.textAlign = 'right';
    ctx.fillText(String(value), x + colW, top + 44);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x, top + 60, colW, 12);
    const color = id === 'liver' ? C.red : C.neon;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillRect(x, top + 60, (colW * value) / 100, 12);
    ctx.shadowBlur = 0;
  });
  y += ROW * 2 + 10;

  // 騎縫線
  const dashed = (at) => {
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(PAD, at);
    ctx.lineTo(SHARE_W - PAD, at);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  dashed(y);

  // 完成任務、支線：名稱與數字排在同一行
  y += 70;
  const facts = [[T.reportMissions, `${data.missionsDone}/${data.missionsTotal}`]];
  if (data.sidesTotal) facts.push([T.reportSide, `${data.sidesDone}/${data.sidesTotal}`]);
  facts.forEach(([label, value], i) => {
    const x = PAD + i * (colW + 60);
    ctx.fillStyle = C.muted;
    ctx.font = f(30, 600);
    ctx.fillText(label, x, y);
    const w = ctx.measureText(label).width;
    ctx.fillStyle = C.text;
    ctx.font = f(46, 700, mono);
    ctx.fillText(value, x + w + 18, y + 2);
  });
  y += 76;

  // 提案第一頁的標題（底部網址之上放得下幾行就畫幾行，最多兩行）
  const FOOT = SHARE_H - 118;
  if (data.proposal) {
    ctx.fillStyle = C.muted;
    ctx.font = f(30, 600);
    ctx.fillText(T.share.proposal, PAD, y);
    ctx.fillStyle = C.text;
    ctx.font = f(40, 700);
    let py = y + 56;
    const room = Math.max(1, Math.min(2, Math.floor((FOOT - py + 20) / 54)));
    for (const line of wrap(ctx, quote(data.proposal), SHARE_W - PAD * 2, room)) {
      ctx.fillText(line, PAD, py);
      py += 54;
    }
  }

  // 底部：遊戲網址
  dashed(FOOT);
  ctx.fillStyle = C.neon;
  ctx.font = f(32, 600, mono);
  ctx.textAlign = 'left';
  ctx.fillText(shareUrl().replace(/^https?:\/\//, ''), PAD, SHARE_H - 56);
  return canvas;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * 產生分享圖並分享。data：{ assets, image, role, stamp, endingTitle, meters, missionsDone, missionsTotal, sidesDone, sidesTotal, proposal }
 * 回傳 { kind: 'share' | 'cancel' | 'download' | 'error', copied? }。
 */
export async function shareResult(data) {
  let blob;
  try {
    const canvas = await drawShareCard({ ...data, imageSrc: data.assets?.imageSrc?.(data.image) || null });
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('toBlob returned null');
    lastShare = { width: canvas.width, height: canvas.height, size: blob.size, dataUrl: canvas.toDataURL('image/png'), data: { ...data, assets: undefined } };
  } catch (err) {
    console.warn('[決策之城] 分享圖做不出來', err);
    return { kind: 'error', error: err?.message || String(err) };
  }
  const url = shareUrl();
  const text = T.share.text(data.endingTitle || '');
  let file = null;
  try {
    file = new File([blob], T.share.file, { type: 'image/png' });
  } catch {
    file = null;
  }
  if (file && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: T.metaTitle, text, url });
      return { kind: 'share' };
    } catch (err) {
      if (err?.name === 'AbortError') return { kind: 'cancel' };
      // 分享失敗（例如權限）：退回下載
    }
  }
  download(blob, T.share.file);
  const copied = await copyText(url);
  return { kind: 'download', copied };
}
