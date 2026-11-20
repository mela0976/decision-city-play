// 介面用的小圖示：行內 SVG，線條畫，不用 emoji、不加圖檔。都是通用圖形，不取自任何平台。

const NS = 'http://www.w3.org/2000/svg';
const PATHS = {
  heart: 'M12 20.5s-7.2-4.4-9.4-8.8C.9 8.200 2.900 4.500 6.500 4.500c2.100 0 3.700 1.100 5.500 3.200 1.800-2.100 3.400-3.200 5.500-3.200 3.600 0 5.600 3.700 3.900 7.200-2.200 4.400-9.400 8.800-9.400 8.800z',
  comment: 'M4 5h16v11H9l-5 4z',
  share: 'M5 12l14-7-5 14-2.500-5.500z',
  micOff: 'M9 5a3 3 0 016 0v6a3 3 0 01-6 0zM6 11a6 6 0 0012 0M12 17v3M4 4l16 16',
  phone: 'M6 3h3l2 5-2.500 1.500a11 11 0 006 6L16 13l5 2v3a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z',
  arrow: 'M4 12h14M13 6l6 6-6 6',
  // 喇叭：語音訊息（自動播放，不是要按的播放鍵）
  speaker: 'M4 9.5h3.5L12 5.500v13l-4.500-4H4z',
  play: 'M8 5l11 7-11 7z',
  stop: 'M7 7h10v10H7z',
  // 收音機：喇叭加兩道聲波（窄螢幕的電台鈕）；選單：三條線（窄螢幕的選單鈕）
  radio: 'M4 9.5h3.5L12 5.500v13l-4.500-4H4zM15.500 9a4 4 0 010 6M18 6.500a7.500 7.500 0 010 11',
  menu: 'M4 7h16M4 12h16M4 17h16',
};

export function icon(name, { filled = false, className = '' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon ${className}`.trim());
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATHS[name] || '');
  path.setAttribute('fill', filled ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}
