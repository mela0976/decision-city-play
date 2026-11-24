// 過場影片：靜音、playsinline、可跳過。
// 清單裡沒有這支、載入失敗、或 3 秒內播不起來，就直接結束讓流程往下走。

import { h, interaction } from '../dom.js?v=53ac0414';
import { T } from '../strings.js?v=53ac0414';

const START_TIMEOUT_MS = 3000;

export function playCutscene({ screen, assets, key, signal }) {
  const info = assets.video(key);
  if (!info) return signal?.aborted ? Promise.reject(new DOMException('flow aborted', 'AbortError')) : Promise.resolve('missing');

  return interaction(signal, (done) => {
    const video = h('video', { playsinline: true, 'webkit-playsinline': true, preload: 'auto', disablepictureinpicture: true, disableremoteplayback: true, tabindex: '-1' });
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.autoplay = true;
    const posterSrc = info.poster || assets.imageSrc(`${key}_poster`);
    if (posterSrc) video.poster = posterSrc;

    const skip = h('button', { type: 'button', class: 'btn btn--small cutscene-skip', 'data-primary': true, text: T.skip });
    const root = h('div', { class: 'cutscene' }, video, skip);

    let started = false;
    const startTimer = setTimeout(() => {
      if (!started) {
        assets.markMissing('video', key);
        done('timeout');
      }
    }, START_TIMEOUT_MS);
    let capTimer = 0;

    video.addEventListener('playing', () => {
      if (started) return;
      started = true;
      clearTimeout(startTimer);
      capTimer = setTimeout(() => done('cap'), (info.sec + 4) * 1000);
    });
    video.addEventListener('ended', () => done('ended'));
    video.addEventListener('error', () => {
      assets.markMissing('video', key);
      done('error');
    });

    // 空白鍵、Enter、E 由遊戲層的動作鍵統一處理（按下這顆「跳過」）；這裡只多接 Esc。
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done('skipped');
      }
    };
    root.addEventListener('click', () => done('skipped'));
    window.addEventListener('keydown', onKey, true);

    screen.append(root);
    skip.focus({ preventScroll: true });
    video.src = info.src;
    const attempt = video.play();
    if (attempt?.catch) attempt.catch(() => done('blocked'));

    return () => {
      clearTimeout(startTimer);
      clearTimeout(capTimer);
      window.removeEventListener('keydown', onKey, true);
      video.pause();
      video.removeAttribute('src');
      video.load();
      root.remove();
    };
  });
}
