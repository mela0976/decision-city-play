// 自己騎車的理由（LAUNCH_READINESS #8）：限時前往的準時獎勵，與沿路可撿的「靈感」。
// 這裡只放規則與幾何；流程在 game.js，畫面在 ui/inspire.js。
//
// 準時獎勵：限時前往在倒數結束前、全程沒用自動前往就到達，客戶信任 +2；剩一半以上的時間 +3。
// 靈感：沿著一天的路線（家 → 晨會 → 九個任務與限時前往的目的地 → 熱炒店）擺 30 個。
//   位置取自引擎的路口（engine.junctions()，都在車道上）；假引擎沒有路口，就放在路線的線段上。
//   自己騎過去才撿得到（自動前往經過不算）；每撿一個收進提案附錄一行，每 5 個品牌力 +1。

export const PUNCTUAL_FULL = { trust: 3 };
export const PUNCTUAL_PART = { trust: 2 };
export const INSPIRE_COUNT = 30;
export const INSPIRE_BRAND_EVERY = 5;
export const INSPIRE_BRAND = { brand: 1 };

// 真引擎一單位 0.105 公尺（js/engine/world.mjs 的 metersPerUnit）；假引擎的地圖是縮小的示意圖，另給一個比例。
const UNITS_PER_METER = { real: 1 / 0.105, mock: 2.4 };
const PICK_RADIUS_M = 10; // 經過這個距離內就算撿到
const CORRIDOR_M = 120; // 離路線多遠以內的路口才放
const SPACING_M = 110; // 兩個靈感至少相隔
const DOOR_CLEAR_M = 30; // 地點門口附近不放（那裡常停車、下車）
const JUMP_M = 60; // 一次取樣移動超過這個距離＝傳送，不算經過
const SHOW_M = 260; // 最近的一個在這個距離內才顯示方向
const MOCK_SPACING = 110;

/** 一天的路線：依序經過的地點 id。 */
export function routeChain(content) {
  const chain = ['home', 'office'];
  for (const mission of content.missions) {
    chain.push(mission.locationId);
    for (const step of mission.steps || []) if (step.type === 'goto' && step.locationId) chain.push(step.locationId);
  }
  chain.push('rechao');
  return chain.filter((id, i) => id && id !== chain[i - 1]);
}

const segDistance = (p, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/**
 * 擺靈感：回傳 { pickups: [{ id, x, y }], upm }。upm 是每公尺幾個引擎單位。
 * 決定性：同一份路網、同一份任務，每次擺的位置都一樣（存檔記 id）。
 */
export function placeInspirations(engine, content) {
  const mock = !!engine.__mock;
  const upm = mock ? UNITS_PER_METER.mock : UNITS_PER_METER.real;
  let locations;
  try {
    locations = new Map(engine.getLocations().map((loc) => [loc.id, loc]));
  } catch {
    return { pickups: [], upm };
  }
  const stops = routeChain(content).map((id) => locations.get(id)).filter(Boolean);
  const segments = [];
  for (let i = 1; i < stops.length; i += 1) if (Math.hypot(stops[i].x - stops[i - 1].x, stops[i].y - stops[i - 1].y) > 1) segments.push([stops[i - 1], stops[i]]);
  if (!segments.length) return { pickups: [], upm };

  let candidates = [];
  let junctions = null;
  try {
    junctions = typeof engine.junctions === 'function' ? engine.junctions() : null;
  } catch {
    junctions = null;
  }
  if (Array.isArray(junctions) && junctions.length) {
    candidates = junctions
      .filter((j) => Number.isFinite(j.x) && Number.isFinite(j.y))
      .map((j) => ({ id: `j:${j.id}`, x: j.x, y: j.y, d: Math.min(...segments.map(([a, b]) => segDistance(j, a, b))) }))
      .filter((c) => c.d <= CORRIDOR_M * upm);
  } else {
    // 假引擎：點畫面就直線走過去，所以放在線段上的三分點。假引擎的門口在地點中心往下 60、點地點時走到往下 30，取中間的 45
    segments.forEach(([a, b], i) => {
      for (const t of [0.34, 0.67]) candidates.push({ id: `p:${i}:${t}`, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + 45, d: 0 });
    });
  }
  const doors = [...locations.values()];
  candidates = candidates.filter((c) => doors.every((loc) => Math.hypot(loc.x - c.x, loc.y - c.y) > DOOR_CLEAR_M * upm));
  candidates.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!candidates.length) return { pickups: [], upm };

  // 由家出發的最遠點取樣：分散在整條路線上，彼此至少相隔 SPACING_M（假引擎的地圖是縮小的，間距另算）
  const spacing = mock ? MOCK_SPACING : SPACING_M * upm;
  const home = stops[0];
  const picked = [];
  const gap = candidates.map((c) => Math.hypot(c.x - home.x, c.y - home.y) + 1e9);
  let first = 0;
  for (let i = 1; i < candidates.length; i += 1) if (candidates[i].d < candidates[first].d || (candidates[i].d === candidates[first].d && gap[i] < gap[first])) first = i;
  let next = first;
  while (picked.length < INSPIRE_COUNT && next >= 0) {
    const chosen = candidates[next];
    picked.push({ id: chosen.id, x: chosen.x, y: chosen.y });
    let best = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      gap[i] = Math.min(gap[i], Math.hypot(candidates[i].x - chosen.x, candidates[i].y - chosen.y));
      if (gap[i] >= spacing && (best < 0 || gap[i] > gap[best])) best = i;
    }
    next = best;
  }
  return { pickups: picked, upm };
}

/** 從 prev 移到 cur 的這一段經過了哪些還沒撿的靈感。傳送（一次跳太遠）不算。 */
export function sweepPickups(pickups, taken, prev, cur, upm) {
  if (!prev || !cur) return [];
  if (Math.hypot(cur.x - prev.x, cur.y - prev.y) > JUMP_M * upm) return [];
  const radius = PICK_RADIUS_M * upm;
  return pickups.filter((p) => !taken.has(p.id) && segDistance(p, prev, cur) <= radius);
}

/**
 * 最近一個還沒撿的靈感：{ pickup, meters, angle }。angle 是相對玩家朝向的角度（弧度，正值往右），
 * 超出顯示距離就回傳 null。
 */
export function nearestPickup(pickups, taken, player, upm) {
  let best = null;
  for (const p of pickups) {
    if (taken.has(p.id)) continue;
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (!best || d < best.d) best = { pickup: p, d };
  }
  if (!best || best.d > SHOW_M * upm) return null;
  const bearing = Math.atan2(best.pickup.y - player.y, best.pickup.x - player.x);
  let angle = bearing - (Number(player.heading) || 0);
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  return { pickup: best.pickup, meters: Math.round(best.d / upm), angle };
}

/** 準時獎勵：剩一半以上的時間 +3，否則 +2；超時或用過自動前往就沒有。 */
export function punctualBonus({ left, total, usedAuto }) {
  if (usedAuto || !(left > 0) || !(total > 0)) return null;
  return left / total >= 0.5 ? PUNCTUAL_FULL : PUNCTUAL_PART;
}
