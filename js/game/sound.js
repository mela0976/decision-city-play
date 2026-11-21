// 聲音：配樂、語音、音效與環境聲（docs/CONTRACTS.md 第 6 節「聲音」）。
//   · 全部在使用者第一次操作之後才啟動；檔案用到才載；清單裡沒有或載入失敗就靜音，不報錯。
//   · 配樂切換用半秒左右的交叉淡化；語音播放時配樂自動壓低。
//   · 三條音量（音樂、語音、音效）加一個全部靜音，存在偏好設定裡。
//   · 每一次「要播、要停」都記在 log 裡（最多 600 筆），自動化驗收靠它確認行為——無頭瀏覽器聽不到聲音。

import { synth, canSynth } from './audio.js?v=c0252f8';
import { LANG } from './lang.js?v=c0252f8';

const FADE_SEC = 0.5;
const DUCK_LEVEL = 0.28;
const DEFAULT_VOLUMES = { music: 0.6, voice: 1, sfx: 0.8 };

/** 提示音的名字對到音檔 key；沒有音檔時退回合成音（audio.js）。 */
const SFX_FILES = {
  stamp: 'sfx_stamp',
  clear: 'sfx_success',
  wrong: 'sfx_fail',
  message: 'sfx_message',
  garbage_truck: 'sfx_garbage_truck',
  alert: 'sfx_alert',
  thunder: 'sfx_thunder',
  campaign_truck: 'sfx_campaign_truck',
  delivery_call: 'sfx_phone_ring',
  boss_line: 'sfx_message',
  elevator: 'sfx_elevator_ding',
  temple_bell: 'sfx_temple_bell',
  scooter_start: 'sfx_scooter_start',
};

/** FNV-1a 32 位元：對 UTF-8 位元組逐一 h ^= byte、h *= 0x01000193，輸出八位小寫十六進位。 */
export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(String(text))) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 語音的 key：「說話者/雜湊」，雜湊對「說話者|畫面上顯示的文字」算。 */
export const voiceKey = (speaker, text) => `${speaker}/${fnv1a(`${speaker}|${text}`)}`;

/** 找語音檔：英日版先找該語言的配音（manifest key 前面加 `en/`、`ja/`），沒有才退回中文配音。 */
export const voiceInfo = (assets, key) => (LANG !== 'zh' && assets.audio('voice', `${LANG}/${key}`)) || assets.audio('voice', key);

export function createSound({ assets, prefs = {}, onPrefs = () => {} }) {
  const volumes = { ...DEFAULT_VOLUMES };
  for (const bus of Object.keys(volumes)) if (Number.isFinite(prefs?.volumes?.[bus])) volumes[bus] = Math.max(0, Math.min(1, prefs.volumes[bus]));
  let muted = !!prefs.muted;
  let ctx = null;
  let nodes = null;
  let unlocked = false;
  let pauseMode = 'none';
  const log = [];
  const record = (bus, op, key, extra) => {
    log.push({ t: Math.round(performance.now()), bus, op, key, ...extra });
    if (log.length > 600) log.shift();
  };

  // 想要的狀態先記著；還沒解鎖（使用者還沒操作過）就等解鎖後再套用。
  const want = { music: null, loops: new Map() };
  const music = { key: null, track: null };
  let voice = null;
  // i18n：英日版字幕是譯文，語音檔仍用中文原句算 key；遊戲層傳入「畫面文字 → 中文原句」的對照
  let voiceText = (text) => text;
  const loops = new Map();
  const oneShots = new Set();
  const preloaded = new Map();

  const ramp = (param, value, sec = FADE_SEC) => {
    if (!ctx) return;
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + sec);
  };

  const build = () => {
    if (ctx) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    try {
      ctx = new Ctor();
    } catch {
      ctx = null;
      return false;
    }
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    const bus = {};
    for (const name of Object.keys(volumes)) {
      bus[name] = ctx.createGain();
      bus[name].gain.value = volumes[name];
      bus[name].connect(master);
    }
    const duck = ctx.createGain();
    duck.connect(bus.music);
    nodes = { master, bus, duck };
    return true;
  };

  /** 一個音檔一個 <audio>，接進 Web Audio 的音量節點（iOS 上 <audio> 自己的 volume 不能調）。 */
  const makeTrack = (info, out, { loop = false, gain = 1 } = {}) => {
    const el = new Audio();
    el.preload = 'auto';
    el.loop = loop;
    el.src = info.src;
    const node = ctx.createGain();
    node.gain.value = gain;
    try {
      ctx.createMediaElementSource(el).connect(node);
    } catch {
      /* 接不上就算了，這一軌不出聲 */
    }
    node.connect(out);
    const track = { el, node, dead: false, wasPlaying: false };
    track.play = () => {
      if (track.dead || pauseMode === 'all') {
        track.wasPlaying = true;
        return;
      }
      const attempt = el.play();
      // 瀏覽器不讓播（還沒有使用者操作）：記下來，下一次操作時再試，並請介面提示一次
      if (attempt?.catch) attempt.catch((err) => { if (err?.name === 'NotAllowedError' && !track.dead) { track.blocked = true; reportBlocked(); } });
    };
    track.stop = () => {
      if (track.dead) return;
      track.dead = true;
      el.pause();
      el.removeAttribute('src');
      el.load();
      node.disconnect();
    };
    return track;
  };

  // ── 配樂 ──
  const applyMusic = () => {
    if (!unlocked || !nodes) return;
    const key = want.music;
    if (key === music.key) return;
    const old = music.track;
    if (old) {
      ramp(old.node.gain, 0);
      setTimeout(() => old.stop(), FADE_SEC * 1000 + 80);
    }
    music.key = key;
    music.track = null;
    const info = key ? assets.audio('music', key) : null;
    if (!info) return;
    const track = makeTrack(info, nodes.duck, { loop: info.loop !== false, gain: 0 });
    track.el.addEventListener('error', () => assets.markMissing('audio', `music:${key}`));
    music.track = track;
    track.play();
    ramp(track.node.gain, 1);
  };

  const setDuck = (on) => {
    if (nodes) ramp(nodes.duck.gain, on ? DUCK_LEVEL : 1, 0.25);
  };

  // 配樂只在「有語音正在出聲」時壓低：選單暫停、語音音量 0 或靜音時都放開。
  const syncDuck = () => setDuck(!!voice && pauseMode === 'none' && volumes.voice > 0 && !muted);

  // ── 語音 ──
  const stopVoice = (reason = 'stop') => {
    if (!voice) return;
    const current = voice;
    voice = null;
    record('voice', reason, current.key);
    current.track?.stop();
    setDuck(false);
    current.onEnd?.();
  };

  // ── 環境聲與循環音效 ──
  const applyLoop = (id) => {
    if (!unlocked || !nodes) return;
    const target = want.loops.get(id) || null;
    const current = loops.get(id);
    if (current && current.key !== target?.key) {
      const old = current.track;
      ramp(old.node.gain, 0, 0.3);
      setTimeout(() => old.stop(), 400);
      loops.delete(id);
    }
    if (!target) return;
    let entry = loops.get(id);
    if (!entry) {
      const info = assets.audio('sfx', target.key);
      if (!info) return;
      entry = { key: target.key, track: makeTrack(info, nodes.bus.sfx, { loop: true, gain: 0 }) };
      entry.track.el.preservesPitch = false;
      loops.set(id, entry);
      if (pauseMode === 'none') entry.track.play();
      else entry.track.wasPlaying = true;
    }
    ramp(entry.track.node.gain, target.volume ?? 1, 0.3);
    if (target.rate) entry.track.el.playbackRate = target.rate;
  };

  const everyTrack = () => [music.track, voice?.track, ...[...loops.values()].map((l) => l.track), ...oneShots].filter(Boolean);

  // 被瀏覽器擋下的播放：語音在解鎖前就被要求播、或 play() 被拒絕。提示只請介面顯示一次。
  let waitingVoice = null;
  let blockedNoted = false;
  const reportBlocked = () => {
    record('system', 'blocked', '');
    if (blockedNoted) return;
    blockedNoted = true;
    api.onBlocked?.();
  };
  const retryBlocked = () => {
    for (const track of everyTrack()) {
      if (track.blocked && !track.dead) {
        track.blocked = false;
        track.play();
      }
    }
    if (waitingVoice) {
      const again = waitingVoice;
      waitingVoice = null;
      api.voice.play(again.speaker, again.text, { onEnd: again.onEnd });
    }
    if (blockedNoted) {
      blockedNoted = false;
      api.onUnblocked?.();
    }
  };

  const unlock = () => {
    if (!build()) return;
    if (ctx.state === 'suspended' && pauseMode !== 'all') ctx.resume().catch(() => {});
    if (unlocked) {
      retryBlocked();
      return;
    }
    unlocked = true;
    record('system', 'unlock', '');
    // 在這一下操作裡先播一段無聲，之後的語音與配樂不必再等一次點擊
    try {
      const silent = ctx.createBufferSource();
      silent.buffer = ctx.createBuffer(1, 1, 22050);
      silent.connect(ctx.destination);
      silent.start(0);
    } catch {
      /* 播不了也不影響 */
    }
    applyMusic();
    for (const id of want.loops.keys()) applyLoop(id);
    retryBlocked();
  };
  for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, unlock, { capture: true });

  const savePrefs = () => onPrefs({ volumes: { ...volumes }, muted });

  const api = {
    log,
    /** 介面掛上來的回呼：播放被瀏覽器擋下時叫一次 onBlocked，之後第一次操作成功重試時叫 onUnblocked。 */
    onBlocked: null,
    onUnblocked: null,
    get unlocked() {
      return unlocked;
    },
    get volumes() {
      return { ...volumes };
    },
    get muted() {
      return muted;
    },
    /** 現在各音量節點實際的值（自動化驗收用）。 */
    get levels() {
      return nodes ? { master: nodes.master.gain.value, music: nodes.bus.music.gain.value, voice: nodes.bus.voice.gain.value, sfx: nodes.bus.sfx.gain.value, duck: Number(nodes.duck.gain.value.toFixed(2)) } : null;
    },
    setVolume(bus, value) {
      if (!(bus in volumes)) return;
      volumes[bus] = Math.max(0, Math.min(1, Number(value) || 0));
      if (nodes) nodes.bus[bus].gain.value = volumes[bus];
      if (bus === 'voice') syncDuck();
      record(bus, 'volume', '', { value: volumes[bus] });
      savePrefs();
    },
    setMuted(flag) {
      muted = !!flag;
      if (nodes) nodes.master.gain.value = muted ? 0 : 1;
      syncDuck();
      record('system', muted ? 'mute' : 'unmute', '');
      savePrefs();
    },

    music: {
      get key() {
        return want.music;
      },
      play(key) {
        if (want.music === key) return;
        want.music = key || null;
        record('music', key ? (assets.audio('music', key) ? 'play' : 'missing') : 'stop', key || '');
        applyMusic();
      },
      stop() {
        api.music.play(null);
      },
    },

    voice: {
      get key() {
        return voice?.key || null;
      },
      /** 先把下一句載起來。 */
      preload(speaker, text) {
        if (!unlocked || !nodes) return;
        const key = voiceKey(speaker, voiceText(text));
        const info = voiceInfo(assets, key);
        if (!info || preloaded.has(key)) return;
        for (const [oldKey, track] of preloaded) {
          if (preloaded.size < 3) break;
          track.stop();
          preloaded.delete(oldKey);
        }
        preloaded.set(key, makeTrack(info, nodes.bus.voice));
      },
      /** 播一句語音。回傳的 handle 可以 stop()；找不到檔案就什麼都不播（只顯示字幕）。 */
      play(speaker, text, { onEnd } = {}) {
        stopVoice('cut');
        const key = voiceKey(speaker, voiceText(text));
        const info = voiceInfo(assets, key);
        record('voice', info ? 'play' : 'missing', key);
        const handle = { key, found: !!info, stop: () => {} };
        waitingVoice = null;
        if (info && (!unlocked || !nodes)) {
          // 還沒有任何使用者操作：先記著，解鎖的那一下再播
          waitingVoice = { key, speaker, text, onEnd };
          handle.stop = () => {
            if (waitingVoice?.key === key) waitingVoice = null;
            if (voice?.key === key) stopVoice('stop');
          };
          reportBlocked();
          return handle;
        }
        if (!info || !unlocked || !nodes) return handle;
        const track = preloaded.get(key) || makeTrack(info, nodes.bus.voice);
        preloaded.delete(key);
        // 預載時就已經載入失敗的檔案：靜默退回字幕，不要當成播放中
        if (track.el.error) {
          assets.markMissing('audio', `voice:${key}`);
          track.stop();
          return handle;
        }
        const mine = { key, track, onEnd };
        voice = mine;
        track.el.addEventListener('ended', () => {
          if (voice !== mine) return;
          voice = null;
          record('voice', 'ended', key);
          track.stop();
          setDuck(false);
          onEnd?.();
        });
        track.el.addEventListener('error', () => {
          assets.markMissing('audio', `voice:${key}`);
          if (voice === mine) stopVoice('error');
        });
        syncDuck();
        if (pauseMode === 'none') track.play();
        else track.wasPlaying = true;
        handle.stop = () => {
          if (voice === mine) stopVoice('stop');
        };
        return handle;
      },
      stop() {
        stopVoice('stop');
      },
      /** i18n：設定「畫面文字 → 算語音 key 用的中文原句」。 */
      setTextSource(fn) {
        voiceText = typeof fn === 'function' ? fn : (text) => text;
      },
    },

    sfx: {
      has: (name) => !!SFX_FILES[name] || canSynth(name),
      /** 播一個提示音：有音檔播音檔，沒有就退回合成音。回傳的 handle 可以 stop()（長的音效在離開畫面時要停）。 */
      play(name) {
        const key = SFX_FILES[name];
        const info = key ? assets.audio('sfx', key) : null;
        const handle = { stop: () => {} };
        if (!unlocked || !nodes) {
          record('sfx', 'locked', key || name);
          return handle;
        }
        if (info) {
          if (pauseMode !== 'none') {
            record('sfx', 'paused', key);
            return handle;
          }
          record('sfx', 'play', key);
          const track = makeTrack(info, nodes.bus.sfx);
          oneShots.add(track);
          const finish = () => {
            oneShots.delete(track);
            track.stop();
          };
          track.el.addEventListener('ended', finish);
          track.el.addEventListener('error', () => {
            assets.markMissing('audio', `sfx:${key}`);
            finish();
            synth(ctx, nodes.bus.sfx, name);
          });
          if (pauseMode === 'none') track.play();
          handle.stop = () => {
            if (track.dead) return;
            record('sfx', 'stop', key);
            finish();
          };
          return handle;
        }
        record('sfx', 'synth', name);
        synth(ctx, nodes.bus.sfx, name);
        return handle;
      },
    },

    /** 循環的環境聲：id 是用途（scooter、rain、bed），key 給 null 就停。 */
    loop(id, key, { volume = 1, rate = 1 } = {}) {
      const before = want.loops.get(id)?.key || null;
      if (key) want.loops.set(id, { key, volume, rate });
      else want.loops.delete(id);
      if (before !== (key || null)) record('loop', key ? (assets.audio('sfx', key) ? 'play' : 'missing') : 'stop', key || before || id, { id });
      applyLoop(id);
    },

    /**
     * 'none'：照常。'menu'：選單開著——語音、音效與環境聲暫停，配樂留著（調音量時聽得到）。
     * 'all'：分頁切到背景或視窗失焦——全部暫停。
     */
    setPaused(mode) {
      if (mode === pauseMode) return;
      pauseMode = mode;
      record('system', `pause:${mode}`, '');
      if (!ctx) return;
      const resumeTrack = (track) => {
        if (track.wasPlaying && !track.dead) {
          track.wasPlaying = false;
          const attempt = track.el.play();
          if (attempt?.catch) attempt.catch(() => {});
        }
      };
      const pauseTrack = (track) => {
        if (!track.el.paused) {
          track.wasPlaying = true;
          track.el.pause();
        }
      };
      for (const track of everyTrack()) {
        const isMusic = track === music.track;
        if (mode === 'all' || (mode === 'menu' && !isMusic)) pauseTrack(track);
        else resumeTrack(track);
      }
      syncDuck();
      if (mode === 'all') ctx.suspend().catch(() => {});
      else if (unlocked) ctx.resume().catch(() => {});
    },
  };
  return api;
}
