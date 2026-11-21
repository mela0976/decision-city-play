// 假引擎：照 docs/CONTRACTS.md 第 4 節做的最小實作，只給遊戲層在真引擎還沒好時用。
// 整張地圖縮放到畫面內（不捲動），色塊代表地點，圓點代表玩家。
// 操作照契約：方向鍵或 WASD 移動；空白鍵、Enter、E 是動作鍵；G 自動前往導航點；M 放大小地圖。
// 額外的開發便利：點畫面任一處會自動走過去；window.__DC_MOCK_ENGINE__ 指向這個實例。

const WORLD_W = 1600;
const WORLD_H = 900;
const RADIUS = 46;

const LOCATIONS = [
  ['home', '吳興街租屋處', 160, 760],
  ['breakfast', '巷口早餐店', 360, 760],
  ['mrt', '捷運市政府站', 560, 560],
  ['office', '富幫 A25', 800, 360],
  ['convenience', '巷口超商', 800, 600],
  ['client_hq', '台北一洞么', 1080, 200],
  ['studio', '鬆山文創攝影棚', 1320, 360],
  ['department', '新光三月', 1080, 560],
  ['datalab', '藍山廣場數據實驗室', 560, 200],
  ['tvstation', '大巨旦轉播中心', 1400, 160],
  ['night_market', '拎薑街夜市', 1320, 720],
  ['temple', '福德街土地公廟', 300, 360],
  ['gamadiam', '思思南村柑仔店', 160, 520],
  ['riverside', '彩虹河濱公園', 1040, 800],
  ['rechao', '吳興街熱炒', 560, 780],
].map(([id, name, x, y]) => ({ id, name, x, y }));

let placeLabels = null;
const labelOf = (loc) => placeLabels?.[loc.id] || loc.name;

const TONES = ['#d92a1c', '#2f7f9e', '#ff8a1f', '#ffd60a', '#22e07a'];
const SPEED = { foot: 150, scooter: 340, grandma: 136 };

export async function createEngine({ canvas, minimapCanvas }) {
  const ctx = canvas.getContext('2d');
  const mctx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
  const handlers = new Map();
  const keys = new Set();

  const state = {
    running: false,
    paused: false,
    input: true,
    x: LOCATIONS[0].x,
    y: LOCATIONS[0].y + RADIUS + 14,
    heading: 0,
    speed: 0,
    mode: 'scooter',
    skin: 'ae',
    hours: 8,
    weather: 'clear',
    traffic: 0.5,
    markers: [],
    waypoint: null,
    npcs: [],
    bubbles: new Map(),
    filter: 'none',
    shake: 0,
    target: null,
    inside: null,
    bigMap: false,
    autoRide: false,
    inputMode: matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard',
    context: null,
    raf: 0,
    last: 0,
  };

  const emit = (event, payload) => {
    for (const fn of [...(handlers.get(event) || [])]) {
      try {
        fn(payload);
      } catch (err) {
        console.warn('[mock-engine] 事件處理發生例外', event, err);
      }
    }
  };

  const locationAt = (x, y) => {
    for (const loc of LOCATIONS) {
      if (Math.hypot(loc.x - x, loc.y - y) <= RADIUS + 22) return loc;
    }
    return null;
  };

  const npcPosition = (npc) => {
    const loc = LOCATIONS.find((l) => l.id === npc.locationId);
    if (!loc) return null;
    const sameSpot = state.npcs.filter((n) => n.locationId === npc.locationId);
    const slot = sameSpot.indexOf(npc);
    return { x: loc.x + RADIUS + 16 + slot * 26, y: loc.y + 26 };
  };

  const interact = () => {
    if (!state.input || state.paused) return;
    let best = null;
    for (const npc of state.npcs) {
      const pos = npcPosition(npc);
      if (!pos) continue;
      const d = Math.hypot(pos.x - state.x, pos.y - state.y);
      if (d < 90 && (!best || d < best.d)) best = { d, npc };
    }
    if (best) {
      emit('interact', { kind: 'npc', id: best.npc.id });
      return;
    }
    const here = locationAt(state.x, state.y);
    if (!here) return;
    const marker = state.markers.find((m) => m.locationId === here.id);
    if (marker) emit('interact', { kind: 'marker', id: marker.id });
  };

  const setInputMode = (mode) => {
    if (state.inputMode === mode) return;
    state.inputMode = mode;
    emit('input:mode', { mode });
  };

  const waypointLocation = () => {
    const marker = state.markers.find((m) => m.id === state.waypoint);
    return marker ? LOCATIONS.find((l) => l.id === marker.locationId) || null : null;
  };

  const setAutoRide = (on, reason) => {
    const target = waypointLocation();
    const next = !!on && !!target;
    if (next === state.autoRide) return;
    state.autoRide = next;
    if (next) state.target = { x: target.x, y: target.y + RADIUS + 14, auto: true };
    else if (state.target?.auto) state.target = null;
    emit('autoride:change', { on: next, reason: next ? 'started' : reason || 'cancelled' });
  };

  /** 動作鍵現在會做的事：旁邊有 NPC 就是說話，站在有標記的地點就是進入。改變時才發事件。 */
  const updateContext = () => {
    let next = null;
    let best = null;
    for (const npc of state.npcs) {
      const pos = npcPosition(npc);
      if (!pos) continue;
      const d = Math.hypot(pos.x - state.x, pos.y - state.y);
      if (d < 90 && (!best || d < best.d)) best = { d, npc };
    }
    if (best) next = { action: 'talk', targetId: best.npc.id, targetName: best.npc.name || '' };
    else {
      const here = locationAt(state.x, state.y);
      const marker = here && state.markers.find((m) => m.locationId === here.id);
      if (marker) next = { action: 'enter', targetId: marker.id, targetName: marker.label || labelOf(here) };
    }
    const key = next ? `${next.action}:${next.targetId}` : '';
    if (key === (state.context || '')) return;
    state.context = key;
    emit('context:change', next || { action: null, targetId: null, targetName: null });
  };

  const toggleMode = () => {
    if (!state.input || state.paused) return;
    state.mode = state.mode === 'foot' ? 'scooter' : 'foot';
    emit('mode:change', { mode: state.mode });
  };

  const MOVE_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);

  const onKeyDown = (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, button, dialog')) return;
    if (!state.input || state.paused) return;
    const key = e.key.toLowerCase();
    setInputMode('keyboard');
    if (MOVE_KEYS.has(key)) {
      keys.add(key);
      if (state.autoRide) setAutoRide(false, 'cancelled');
      state.target = null;
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (key === ' ' || key === 'enter' || key === 'e') {
      e.preventDefault();
      interact();
    } else if (key === 'g') setAutoRide(!state.autoRide);
    else if (key === 'f') toggleMode();
    else if (key === 'm') toggleMap();
    else if (key === 'escape' && state.bigMap) {
      e.preventDefault();
      toggleMap();
    }
  };
  // 跟真引擎一樣：大地圖開關都發 map:change
  const toggleMap = () => {
    state.bigMap = !state.bigMap;
    emit('map:change', { open: state.bigMap });
  };
  const onMapClick = () => toggleMap();
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  const onBlur = () => keys.clear();

  const view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    view.dpr = dpr;
    view.w = w;
    view.h = h;
    view.scale = Math.min(w / WORLD_W, h / WORLD_H);
    view.ox = (w - WORLD_W * view.scale) / 2;
    view.oy = (h - WORLD_H * view.scale) / 2;
  };

  // 右下角留給地圖標誌與資料來源標註（契約第 4 節），動作鈕往上讓。
  const interactButton = () => ({ x: view.w - 64, y: view.h - 118, r: 34 });

  const onPointerDown = (e) => {
    if (!state.input || state.paused) return;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') setInputMode('touch');
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const btn = interactButton();
    if (e.pointerType !== 'mouse' && Math.hypot(px - btn.x, py - btn.y) <= btn.r) {
      interact();
      return;
    }
    if (state.autoRide) setAutoRide(false, 'cancelled');
    state.target = {
      x: Math.max(0, Math.min(WORLD_W, (px - view.ox) / view.scale)),
      y: Math.max(0, Math.min(WORLD_H, (py - view.oy) / view.scale)),
    };
  };

  const update = (dt) => {
    let dx = 0;
    let dy = 0;
    if (state.input) {
      if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
      if (keys.has('arrowright') || keys.has('d')) dx += 1;
      if (keys.has('arrowup') || keys.has('w')) dy -= 1;
      if (keys.has('arrowdown') || keys.has('s')) dy += 1;
      if (!dx && !dy && state.target) {
        const tx = state.target.x - state.x;
        const ty = state.target.y - state.y;
        const dist = Math.hypot(tx, ty);
        if (dist < 6) {
          const wasAuto = state.target.auto;
          state.target = null;
          if (wasAuto) {
            state.autoRide = false;
            emit('autoride:change', { on: false, reason: 'arrived' });
          }
        } else {
          dx = tx / dist;
          dy = ty / dist;
        }
      }
    }
    const max = state.skin === 'grandma' ? SPEED.grandma : SPEED[state.mode];
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      state.heading = Math.atan2(dy, dx);
      state.speed = max;
      state.x = Math.max(12, Math.min(WORLD_W - 12, state.x + (dx / len) * max * dt));
      state.y = Math.max(12, Math.min(WORLD_H - 12, state.y + (dy / len) * max * dt));
    } else {
      state.speed = 0;
    }

    const here = locationAt(state.x, state.y);
    const hereId = here ? here.id : null;
    if (hereId !== state.inside) {
      if (state.inside) emit('location:leave', { locationId: state.inside });
      state.inside = hereId;
      if (hereId) {
        emit('location:enter', { locationId: hereId });
        const marker = state.markers.find((m) => m.locationId === hereId);
        if (marker) emit('marker:reach', { markerId: marker.id, locationId: hereId });
      }
    }
    updateContext();
    for (const [id, bubble] of state.bubbles) {
      bubble.ms -= dt * 1000;
      if (bubble.ms <= 0) state.bubbles.delete(id);
    }
    state.shake = Math.max(0, state.shake - dt * 2);
  };

  const darkness = () => {
    const h = state.hours;
    if (h >= 7 && h <= 16) return 0;
    if (h > 16 && h < 20) return ((h - 16) / 4) * 0.55;
    if (h >= 20 || h < 5) return 0.55;
    return (1 - (h - 5) / 2) * 0.55;
  };

  const drawWorld = (c, scale, ox, oy, mini) => {
    c.save();
    c.translate(ox, oy);
    c.scale(scale, scale);
    c.fillStyle = '#c9c2ae';
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    c.fillStyle = '#3a3a40';
    for (const y of [200, 360, 560, 760]) c.fillRect(0, y - 16, WORLD_W, 32);
    for (const x of [160, 360, 560, 800, 1080, 1320]) c.fillRect(x - 16, 0, 32, WORLD_H);
    c.fillStyle = '#6fb7d6';
    c.fillRect(880, 846, 720, 54);

    LOCATIONS.forEach((loc, i) => {
      c.fillStyle = TONES[i % TONES.length];
      c.strokeStyle = '#0a0a0a';
      c.lineWidth = mini ? 8 : 5;
      c.fillRect(loc.x - RADIUS, loc.y - RADIUS, RADIUS * 2, RADIUS * 2);
      c.strokeRect(loc.x - RADIUS, loc.y - RADIUS, RADIUS * 2, RADIUS * 2);
      if (!mini) {
        c.fillStyle = '#0a0a0a';
        c.font = '700 22px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
        c.textAlign = 'center';
        c.fillText(labelOf(loc), loc.x, loc.y - RADIUS - 10);
      }
    });

    for (const marker of state.markers) {
      const loc = LOCATIONS.find((l) => l.id === marker.locationId);
      if (!loc) continue;
      const isWaypoint = state.waypoint === marker.id;
      c.beginPath();
      c.arc(loc.x, loc.y, mini ? 40 : 24, 0, Math.PI * 2);
      c.fillStyle = marker.kind === 'egg' ? '#ffffff' : marker.kind === 'side' ? '#7fd4ff' : marker.kind === 'home' ? '#ff8a1f' : '#ffd60a';
      c.fill();
      c.lineWidth = isWaypoint ? (mini ? 16 : 9) : 4;
      c.strokeStyle = '#0a0a0a';
      c.stroke();
      if (!mini && marker.label) {
        c.fillStyle = '#0a0a0a';
        c.font = '900 20px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
        c.textAlign = 'center';
        c.fillText(marker.label, loc.x, loc.y + RADIUS + 26);
      }
    }

    if (!mini) {
      for (const npc of state.npcs) {
        const pos = npcPosition(npc);
        if (!pos) continue;
        c.beginPath();
        c.arc(pos.x, pos.y, 11, 0, Math.PI * 2);
        c.fillStyle = npc.skin === 'npc_grandma' ? '#ff6fa8' : '#ffffff';
        c.fill();
        c.lineWidth = 3;
        c.strokeStyle = '#0a0a0a';
        c.stroke();
        c.fillStyle = '#0a0a0a';
        c.font = '600 15px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
        c.textAlign = 'center';
        c.fillText(npc.name || '', pos.x, pos.y + 28);
        const bubble = state.bubbles.get(npc.id);
        if (bubble) {
          c.font = '600 17px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
          const w = Math.min(420, c.measureText(bubble.text).width + 24);
          c.fillStyle = '#fbf4e2';
          c.fillRect(pos.x - w / 2, pos.y - 56, w, 32);
          c.strokeRect(pos.x - w / 2, pos.y - 56, w, 32);
          c.fillStyle = '#0a0a0a';
          c.fillText(bubble.text, pos.x, pos.y - 34, 400);
        }
      }
    }

    if (state.waypoint) {
      const marker = state.markers.find((m) => m.id === state.waypoint);
      const loc = marker && LOCATIONS.find((l) => l.id === marker.locationId);
      if (loc) {
        c.setLineDash([14, 12]);
        c.lineWidth = mini ? 10 : 4;
        c.strokeStyle = '#0a0a0a';
        c.beginPath();
        c.moveTo(state.x, state.y);
        c.lineTo(loc.x, loc.y);
        c.stroke();
        c.setLineDash([]);
      }
    }

    c.save();
    c.translate(state.x, state.y);
    c.rotate(state.heading);
    c.beginPath();
    const size = mini ? 34 : state.mode === 'scooter' ? 18 : 13;
    c.moveTo(size, 0);
    c.lineTo(-size * 0.8, size * 0.75);
    c.lineTo(-size * 0.8, -size * 0.75);
    c.closePath();
    c.fillStyle = state.skin === 'grandma' ? '#ff6fa8' : '#22e07a';
    c.fill();
    c.lineWidth = mini ? 8 : 4;
    c.strokeStyle = '#0a0a0a';
    c.stroke();
    c.restore();
    c.restore();
  };

  const draw = () => {
    resize();
    const { dpr, w, h } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#23263a';
    ctx.fillRect(0, 0, w, h);
    const jitter = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 14 : 0;
    drawWorld(ctx, view.scale, view.ox + jitter, view.oy + jitter, false);

    const dark = darkness();
    if (dark > 0) {
      ctx.fillStyle = `rgba(18, 22, 60, ${dark})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (state.weather === 'rain') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 90; i += 1) {
        const rx = Math.random() * w;
        const ry = Math.random() * h;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 4, ry + 12);
      }
      ctx.stroke();
    }
    if (state.filter === 'grandma') {
      ctx.fillStyle = 'rgba(255, 170, 60, 0.2)';
      ctx.fillRect(0, 0, w, h);
    } else if (state.filter === 'flashback') {
      ctx.fillStyle = 'rgba(120, 90, 50, 0.3)';
      ctx.fillRect(0, 0, w, h);
    }
    if (state.inputMode === 'touch' && state.input && !state.paused) {
      const btn = interactButton();
      ctx.beginPath();
      ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 214, 10, 0.9)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0a0a0a';
      ctx.stroke();
      ctx.fillStyle = '#0a0a0a';
      ctx.font = '900 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('動作', btn.x, btn.y + 7);
    }

    if (mctx) {
      const mw = Math.max(1, minimapCanvas.clientWidth);
      const mh = Math.max(1, minimapCanvas.clientHeight);
      if (minimapCanvas.width !== Math.round(mw * dpr) || minimapCanvas.height !== Math.round(mh * dpr)) {
        minimapCanvas.width = Math.round(mw * dpr);
        minimapCanvas.height = Math.round(mh * dpr);
      }
      mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mctx.fillStyle = '#23263a';
      mctx.fillRect(0, 0, mw, mh);
      const zoom = state.bigMap ? 2 : 1;
      const ms = Math.min(mw / WORLD_W, mh / WORLD_H) * zoom;
      const mox = state.bigMap ? mw / 2 - state.x * ms : (mw - WORLD_W * ms) / 2;
      const moy = state.bigMap ? mh / 2 - state.y * ms : (mh - WORLD_H * ms) / 2;
      drawWorld(mctx, ms, mox, moy, true);
    }
  };

  const frame = (now) => {
    if (!state.running) return;
    const dt = Math.min(0.05, (now - state.last) / 1000 || 0);
    state.last = now;
    if (!state.paused) update(dt);
    draw();
    state.raf = requestAnimationFrame(frame);
  };

  const engine = {
    start() {
      if (state.running) return;
      state.running = true;
      state.last = performance.now();
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      canvas.addEventListener('pointerdown', onPointerDown);
      minimapCanvas?.addEventListener('click', onMapClick);
      state.raf = requestAnimationFrame(frame);
    },
    stop() {
      state.running = false;
      cancelAnimationFrame(state.raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      minimapCanvas?.removeEventListener('click', onMapClick);
    },
    setPaused(flag) {
      state.paused = !!flag;
      if (state.paused) keys.clear();
    },
    setInputEnabled(flag) {
      state.input = !!flag;
      if (!state.input) {
        keys.clear();
        if (state.autoRide) setAutoRide(false, 'cancelled');
        state.target = null;
      }
    },
    get player() {
      const here = locationAt(state.x, state.y);
      return {
        x: state.x,
        y: state.y,
        heading: state.heading,
        speed: state.speed,
        mode: state.mode,
        skin: state.skin,
        locationId: here ? here.id : null,
      };
    },
    setPlayerSkin(skinId) {
      state.skin = skinId;
    },
    teleportTo(locationId) {
      const loc = LOCATIONS.find((l) => l.id === locationId);
      if (!loc) return;
      state.x = loc.x;
      state.y = loc.y + RADIUS + 14;
      state.target = null;
      state.speed = 0;
    },
    setTimeOfDay(hours) {
      state.hours = ((Number(hours) % 24) + 24) % 24;
    },
    setWeather(kind) {
      state.weather = kind === 'rain' ? 'rain' : 'clear';
    },
    setTrafficDensity(n) {
      state.traffic = Math.max(0, Math.min(1, Number(n) || 0));
    },
    setMarkers(list) {
      state.markers = Array.isArray(list) ? list.map((m) => ({ ...m })) : [];
      if (state.waypoint && !state.markers.some((m) => m.id === state.waypoint)) state.waypoint = null;
    },
    setWaypoint(markerId) {
      state.waypoint = markerId || null;
      if (state.autoRide && !waypointLocation()) setAutoRide(false, 'cancelled');
    },
    setAutoRide(on) {
      setAutoRide(on);
    },
    get autoRide() {
      return state.autoRide;
    },
    get inputMode() {
      return state.inputMode;
    },
    // 空拍鏡頭：假引擎沒有鏡頭可飛，立即完成。
    flyover(locationId) {
      emit('flyover:end', { locationId, skipped: false });
      return Promise.resolve();
    },
    get aerial() {
      return false;
    },
    estimateRideSeconds(locationId) {
      const loc = LOCATIONS.find((l) => l.id === locationId);
      if (!loc) return null;
      const speed = state.skin === 'grandma' ? SPEED.grandma : SPEED.scooter;
      return Math.hypot(loc.x - state.x, loc.y + RADIUS + 14 - state.y) / speed;
    },
    nearestRoadTeleport() {
      // 路是幾條水平與垂直的線：貼到最近的那一條上。
      const rows = [200, 360, 560, 760];
      const cols = [160, 360, 560, 800, 1080, 1320];
      const nearest = (list, value) => list.reduce((best, item) => (Math.abs(item - value) < Math.abs(best - value) ? item : best), list[0]);
      const row = nearest(rows, state.y);
      const col = nearest(cols, state.x);
      if (Math.abs(row - state.y) <= Math.abs(col - state.x)) state.y = row;
      else state.x = col;
      state.target = null;
      state.speed = 0;
    },
    setNpcs(list) {
      state.npcs = Array.isArray(list) ? list.map((n) => ({ ...n })) : [];
    },
    say(npcId, text, ms = 3000) {
      state.bubbles.set(npcId, { text: String(text), ms });
    },
    setFilter(name) {
      state.filter = name;
    },
    shake(strength) {
      state.shake = Math.max(0, Math.min(1, Number(strength) || 0));
    },
    /** i18n：地點標籤的譯名（真引擎同名方法的最小版） */
    setLabels(next) {
      placeLabels = next?.places && typeof next.places === 'object' ? { ...next.places } : null;
    },
    getLocations() {
      return LOCATIONS.map((l) => ({ ...l }));
    },
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(handler);
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler);
    },
    // 以下不在契約內，只給開發與自動化測試換算點擊位置用。
    __mock: true,
    __toScreen(x, y) {
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + view.ox + x * view.scale, y: rect.top + view.oy + y * view.scale };
    },
  };

  window.__DC_MOCK_ENGINE__ = engine;
  resize();
  return engine;
}
