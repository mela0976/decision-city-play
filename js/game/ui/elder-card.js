// 長輩圖產生器：選底圖、選一句話，用 canvas 合成 1080×1080 的 PNG。
// 底圖缺檔時用程式畫的花色替代，所以沒有素材也下載得到圖。
// 預覽是一張 <img>（手機可長按存圖），另有一顆下載鈕。

import { h } from '../dom.js?v=7c27097e';
import { T, LANG } from '../strings.js?v=7c27097e';

const SIZE = 1080;
// i18n：日文把日文字型排前面；英文用粗的無襯線系統字
const FONT = LANG === 'ja' ? '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP","PingFang TC",sans-serif' : LANG === 'en' ? '"Arial Black","Helvetica Neue",Arial,"PingFang TC",sans-serif' : '"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
const FALLBACKS = [
  { sky: ['#ff8a1f', '#ffd60a'], petal: '#ff6fa8', heart: '#d92a1c' },
  { sky: ['#2f7f9e', '#9fe3ff'], petal: '#ffd60a', heart: '#ff8a1f' },
  { sky: ['#d92a1c', '#ff9fb8'], petal: '#ffffff', heart: '#ffd60a' },
];

function drawFallback(ctx, variant) {
  const look = FALLBACKS[variant % FALLBACKS.length];
  const sky = ctx.createLinearGradient(0, 0, 0, SIZE);
  sky.addColorStop(0, look.sky[0]);
  sky.addColorStop(1, look.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (let y = 20; y < SIZE; y += 36) {
    for (let x = (y / 36) % 2 ? 20 : 38; x < SIZE; x += 36) {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const flowers = [
    [170, 880, 150],
    [900, 900, 190],
    [930, 190, 120],
    [520, 990, 110],
  ];
  for (const [cx, cy, r] of flowers) {
    ctx.fillStyle = look.petal;
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 8;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.42, r * 0.24, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = look.heart;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

const NO_LINE_START = LANG === 'ja' ? '，。！？、；：」』）ー〜ぁぃぅぇぉっゃゅょァィゥェォッャュョ' : '，。！？、；：」』）';

function greedyWrap(ctx, text, maxWidth) {
  if (LANG === 'en') return wordWrap(ctx, text, maxWidth);
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (line && !NO_LINE_START.includes(ch) && ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** 英文版：以單字為單位斷行，不把字切開。 */
function wordWrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** 先算出需要幾行，再把寬度收窄到各行差不多長，避免最後一行只掛一個字。 */
function wrap(ctx, text, maxWidth) {
  const loose = greedyWrap(ctx, text, maxWidth);
  if (loose.length < 2) return loose;
  let best = loose;
  for (let width = maxWidth * 0.95; width > maxWidth * 0.4; width -= maxWidth * 0.05) {
    const tight = greedyWrap(ctx, text, width);
    if (tight.length > loose.length) break;
    best = tight;
  }
  return best;
}

function outlined(ctx, text, x, y, { fill, stroke, width, shadow }) {
  ctx.lineJoin = 'round';
  if (shadow) {
    ctx.strokeStyle = shadow;
    ctx.lineWidth = width;
    ctx.strokeText(text, x + 10, y + 10);
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function composeElderCard(canvas, { image, variant, caption }) {
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (image) {
    const scale = Math.max(SIZE / image.naturalWidth, SIZE / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const hgt = image.naturalHeight * scale;
    ctx.drawImage(image, (SIZE - w) / 2, (SIZE - hgt) / 2, w, hgt);
  } else {
    drawFallback(ctx, variant);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 大字放得下就用 250px；英文的 Good Morning! 比較長，縮到寬度內
  let helloSize = 250;
  do ctx.font = `900 ${helloSize}px ${FONT}`;
  while (ctx.measureText(T.elderHello).width > SIZE - 110 && (helloSize -= 10) > 80);
  const hello = ctx.createLinearGradient(0, 110, 0, 390);
  hello.addColorStop(0, '#fff36b');
  hello.addColorStop(0.55, '#ffd60a');
  hello.addColorStop(1, '#ff8a1f');
  outlined(ctx, T.elderHello, SIZE / 2, 250, { fill: hello, stroke: '#b3140a', width: 34, shadow: '#0a0a0a' });

  let size = 108;
  let lines = [];
  do {
    ctx.font = `900 ${size}px ${FONT}`;
    lines = wrap(ctx, caption, SIZE - 150);
    if (lines.length * size * 1.25 <= 470) break;
    size -= 8;
  } while (size > 44);
  const lineHeight = size * 1.25;
  const top = 640 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    outlined(ctx, line, SIZE / 2, top + i * lineHeight, { fill: '#ffffff', stroke: '#1c2b5a', width: Math.max(14, size * 0.2), shadow: '#ff3d7f' });
  });

  ctx.font = `700 34px ${FONT}`;
  outlined(ctx, T.name, SIZE / 2, SIZE - 52, { fill: '#ffffff', stroke: '#0a0a0a', width: 8 });
  return canvas;
}

export function openElderCard({ dialog, assets, cards, lines }) {
  const canvas = document.createElement('canvas');
  const preview = h('img', { class: 'elder-preview', alt: '', width: '540', height: '540' });
  const download = h('a', { class: 'btn btn--primary btn--big', id: 'elder-download', download: T.elderFile, text: T.elderDownload });
  const close = h('button', { type: 'button', class: 'btn btn--small', text: T.close, onClick: () => dialog.close() });
  let baseIndex = 0;
  let lineIndex = 0;
  let url = '';
  let ticket = 0;

  const render = async () => {
    const mine = (ticket += 1);
    const card = cards[baseIndex] || {};
    const image = await assets.loadImage(card.image);
    if (mine !== ticket) return;
    const caption = lines[lineIndex] || '';
    composeElderCard(canvas, { image, variant: baseIndex, caption });
    preview.alt = `${T.elderHello}，${caption}`;
    canvas.toBlob((blob) => {
      if (mine !== ticket || !blob) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      preview.src = url;
      download.href = url;
      dialog.dataset.ready = String(mine);
    }, 'image/png');
  };

  const basePicker = h(
    'fieldset',
    { class: 'elder-bases' },
    h('legend', { text: T.elderPickBase }),
    cards.map((card, i) => {
      const input = h('input', { type: 'radio', name: 'elder-base', value: String(i), checked: i === 0, class: 'sr-only' });
      input.addEventListener('change', () => {
        baseIndex = i;
        render();
      });
      return h('label', { class: 'elder-base' }, input, assets.art(card.image, { kind: 'square', className: `elder-thumb elder-thumb--${i % FALLBACKS.length}` }));
    }),
  );

  const linePicker = h(
    'fieldset',
    { class: 'elder-lines' },
    h('legend', { text: T.elderPickLine }),
    lines.map((text, i) => {
      const input = h('input', { type: 'radio', name: 'elder-line', value: String(i), checked: i === 0, class: 'sr-only' });
      input.addEventListener('change', () => {
        lineIndex = i;
        render();
      });
      return h('label', { class: 'elder-line' }, input, h('span', { text }));
    }),
  );

  dialog.replaceChildren(
    h('header', { class: 'sheet-head' }, h('h2', { id: 'elder-title', text: T.elderTitle }), close),
    h('div', { class: 'elder-body' }, h('div', { class: 'elder-stage' }, preview), h('div', { class: 'elder-controls' }, basePicker, linePicker, download)),
  );
  dialog.addEventListener(
    'close',
    () => {
      ticket += 1;
      if (url) URL.revokeObjectURL(url);
    },
    { once: true },
  );
  if (!dialog.open) dialog.showModal();
  render();
}
