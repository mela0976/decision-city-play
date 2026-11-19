// 聲音：配樂、語音、音效與環境聲（docs/CONTRACTS.md 第 6 節「聲音」）。
//   · 全部在使用者第一次操作之後才啟動；檔案用到才載；清單裡沒有或載入失敗就靜音，不報錯。
//   · 配樂切換用半秒左右的交叉淡化；語音播放時配樂自動壓低。
//   · 三條音量（音樂、語音、音效）加一個全部靜音，存在偏好設定裡。
//   · 每一次「要播、要停」都記在 log 裡（最多 600 筆），自動化驗收靠它確認行為——無頭瀏覽器聽不到聲音。

import { synth, canSynth } from './audio.js';

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
      if (attempt?.catch) attempt.catch(() => {});
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

  const unlock = () => {
    if (!build()) return;
    if (ctx.state === 'suspended' && pauseMode !== 'all') ctx.resume().catch(() => {});
    if (unlocked) return;
    unlocked = true;
    record('system', 'unlock', '');
    applyMusic();
    for (const id of want.loops.keys()) applyLoop(id);
  };
  for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, unlock, { capture: true });

  const savePrefs = () => onPrefs({ volumes: { ...volumes }, muted });

  const api = {
    log,
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
      record(bus, 'volume', '', { value: volumes[bus] });
      savePrefs();
    },
    setMuted(flag) {
      muted = !!flag;
      if (nodes) nodes.master.gain.value = muted ? 0 : 1;
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
        const key = voiceKey(speaker, text);
        const info = assets.audio('voice', key);
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
        const key = voiceKey(speaker, text);
        const info = assets.audio('voice', key);
        record('voice', info ? 'play' : 'missing', key);
        const handle = { key, found: !!info, stop: () => {} };
        if (!info || !unlocked || !nodes) return handle;
        const track = preloaded.get(key) || makeTrack(info, nodes.bus.voice);
        preloaded.delete(key);
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
        setDuck(true);
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
      if (mode === 'all') ctx.suspend().catch(() => {});
      else if (unlocked) ctx.resume().catch(() => {});
    },
  };
  return api;
}
