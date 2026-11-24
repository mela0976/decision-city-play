// 內容載入：先看 window.__DC_CONTENT__（打包時注入），沒有才 fetch 十個內容檔（含敘事層的 story 與 feed）。
// useFixtures 為真時改讀 js/game/dev/fixtures/ 的假資料。
// 英日版（lang.js）：中文原檔照常載入，再疊上 content/i18n/<lang>/ 的同名譯檔。譯檔缺少或結構和原檔不同時，
// 那一檔退回中文並在主控台警告一次。語音照中文原句找檔，所以載入時記下每句譯文對應的中文（見 voiceTexts）。

import { LANG, T, ZH_T } from './strings.js?v=c1d6a75d';

export const CONTENT_FILES = ['roles', 'books', 'missions', 'quiz', 'npcs', 'radio', 'grandma', 'endings', 'story', 'feed'];
const FEED_FORMATS = new Set(['livestream', 'dashcam', 'story', 'forum', 'chat', 'short', 'meeting', 'aichat']);
const STEP_TYPES = new Set(['dialogue', 'goto', 'choice', 'quiz', 'cutscene']);

export class ContentError extends Error {
  constructor(file, kind, detail) {
    super(T.contentError(file, kind));
    this.name = 'ContentError';
    this.file = file;
    this.kind = kind;
    this.detail = detail || '';
  }
}

async function fetchJson(url, file) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-cache' });
  } catch {
    throw new ContentError(file, 'http');
  }
  if (!response.ok) throw new ContentError(file, 'http', String(response.status));
  try {
    return await response.json();
  } catch {
    throw new ContentError(file, 'json');
  }
}

// ── 譯檔 ─────────────────────────────────────────────

// 這些鍵是 id 或素材 key：譯檔裡的值必須和原檔一字不差（SPEC 第 2 節「不能動」）
const LOCKED_KEYS = new Set(['id', 'who', 'via', 'locationId', 'giver', 'type', 'format', 'image', 'after', 'splash', 'video', 'skin', 'portrait', 'cover', 'kind', 'npcId', 'titleCode', 'chapterIds', 'ids', 'clock', 'time', 'coveredBy', 'unlock', 'strength', 'video', 'reward', 'bond', 'answer']);

/** 譯檔和原檔是否「只換字，不換骨」：型別、鍵、陣列長度相同，數值與 id 相同，只有文字可以不同。 */
function sameShape(zh, tr, key = '', locked = false) {
  const lock = locked || LOCKED_KEYS.has(key);
  if (Array.isArray(zh)) return Array.isArray(tr) && zh.length === tr.length && zh.every((x, i) => sameShape(x, tr[i], key, lock));
  if (zh && typeof zh === 'object') {
    if (!tr || typeof tr !== 'object' || Array.isArray(tr)) return false;
    const keys = Object.keys(zh);
    if (keys.length !== Object.keys(tr).length) return false;
    return keys.every((k) => Object.hasOwn(tr, k) && sameShape(zh[k], tr[k], k, lock));
  }
  if (typeof zh !== typeof tr) return false;
  if (typeof zh === 'string') return !lock || zh === tr;
  return zh === tr;
}

/** 走過原檔與譯檔：每個有 text 的物件記下中文原句（_zh），每個不同的字串記一組「譯文 → 中文」。 */
function pairUp(zh, tr, voice) {
  if (Array.isArray(zh)) {
    zh.forEach((x, i) => pairUp(x, tr[i], voice));
    return;
  }
  if (zh && typeof zh === 'object') {
    if (typeof zh.text === 'string') tr._zh = zh.text;
    for (const k of Object.keys(zh)) pairUp(zh[k], tr[k], voice);
    return;
  }
  if (typeof zh === 'string' && zh !== tr) voice.pairs.push([tr, zh]);
}

/** 原檔裡含 {role} 的句子：譯檔缺少時畫面上是中文句子配上譯名，語音要換回中文職稱再找。 */
function collectRoleTemplates(zh, voice) {
  if (Array.isArray(zh)) zh.forEach((x) => collectRoleTemplates(x, voice));
  else if (zh && typeof zh === 'object') for (const v of Object.values(zh)) collectRoleTemplates(v, voice);
  else if (typeof zh === 'string' && zh.includes('{role}')) voice.roleTemplates.push(zh);
}

/**
 * 依目前語言建立譯檔的讀取器。中文版（或假資料）回傳 null，什麼都不做。
 * 有哪些譯檔看 content/i18n/manifest.json（tools/i18n_manifest.py 產生），不在清單上的不去抓，避免 404。
 */
async function createLocalizer({ useFixtures, injected }) {
  if (LANG === 'zh' || useFixtures) return null;
  // story.js 的備用對白（內容檔沒寫 finale.unfinished 時）也照中文原句找語音
  const voice = { pairs: [[T.fallbackKai, ZH_T.fallbackKai], [T.fallbackGrandma, ZH_T.fallbackGrandma], ['OK.', 'OK。']], roleTemplates: [], zhRoleTitle: new Map() };
  const base = new URL(`content/i18n/${LANG}/`, document.baseURI);
  const bundled = injected && typeof injected === 'object' ? injected.i18n?.[LANG] || null : null;
  let listed = new Set();
  if (!bundled) {
    try {
      const response = await fetch(new URL('content/i18n/manifest.json', document.baseURI), { cache: 'no-cache' });
      if (response.ok) listed = new Set((await response.json())?.[LANG] || []);
    } catch {
      /* 沒有清單：全部退回中文 */
    }
  }
  const missing = [];
  const read = async (rel) => {
    if (bundled) {
      const key = rel.replace(/\.json$/, '');
      return key.startsWith('side/') ? bundled.side?.[key.slice(5)] ?? null : bundled[key] ?? null;
    }
    if (!listed.has(rel)) return null;
    try {
      const response = await fetch(new URL(rel, base), { cache: 'no-cache' });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  };
  return {
    voice,
    /** 回傳這一檔要用的內容：譯檔可用就用譯檔（已標上 _zh），否則原檔。 */
    async localize(rel, zh) {
      if (zh == null) return zh;
      if (rel === 'roles.json' && Array.isArray(zh)) for (const role of zh) if (role?.id) voice.zhRoleTitle.set(role.id, role.title);
      collectRoleTemplates(zh, voice);
      const tr = await read(rel);
      if (tr == null) {
        missing.push(rel);
        return zh;
      }
      if (!sameShape(zh, tr)) {
        console.warn(`[決策之城] ${LANG} 譯檔的結構和原檔不同，退回中文：content/i18n/${LANG}/${rel}`);
        return zh;
      }
      pairUp(zh, tr, voice);
      return tr;
    },
    /** 全部載完後呼叫一次：缺少的譯檔合成一則警告。 */
    report() {
      if (missing.length) console.warn(`[決策之城] ${LANG} 譯檔缺少，退回中文：${missing.sort().join('、')}`);
    },
  };
}

function requireArray(raw, file, { allowEmpty = false } = {}) {
  const value = raw[file];
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new ContentError(file, 'shape', `應該是一個${allowEmpty ? '' : '有內容的'}陣列`);
  }
  return value;
}

function validate(raw) {
  const roles = requireArray(raw, 'roles');
  for (const role of roles) {
    if (!role?.id || !role.title || typeof role.start !== 'object') throw new ContentError('roles', 'shape', 'roles.json 有角色缺少 id、title 或 start');
  }
  const missions = requireArray(raw, 'missions');
  for (const mission of missions) {
    if (!mission?.id || !Array.isArray(mission.steps)) throw new ContentError('missions', 'shape', 'missions.json 有任務缺少 id 或 steps');
    for (const step of mission.steps) {
      if (!STEP_TYPES.has(step?.type)) throw new ContentError('missions', 'shape', `missions.json：${mission.id} 有不認得的步驟種類`);
      if (step.type === 'choice' && !Array.isArray(step.options)) throw new ContentError('missions', 'shape', `missions.json：${mission.id} 的抉擇沒有選項`);
    }
  }
  requireArray(raw, 'endings');
  requireArray(raw, 'books', { allowEmpty: true });
  requireArray(raw, 'quiz', { allowEmpty: true });
  requireArray(raw, 'npcs', { allowEmpty: true });
  requireArray(raw, 'radio', { allowEmpty: true });
  if (raw.grandma != null && typeof raw.grandma !== 'object') throw new ContentError('grandma', 'shape', 'grandma.json 應該是一個物件');
  if (raw.story == null || typeof raw.story !== 'object' || Array.isArray(raw.story)) throw new ContentError('story', 'shape', 'story.json 應該是一個物件');
  for (const key of ['prologue', 'interludes']) {
    if (!Array.isArray(raw.story[key])) throw new ContentError('story', 'shape', `story.json 缺少 ${key}`);
  }
  for (const item of raw.story.interludes) {
    if (!item?.after || !item.grandma || !Array.isArray(item.grandma.replies)) throw new ContentError('story', 'shape', 'story.json 有過場缺少 after 或阿嬤的回覆選項');
  }
  const feed = requireArray(raw, 'feed', { allowEmpty: true });
  for (const post of feed) {
    if (!post?.id || !FEED_FORMATS.has(post.format)) throw new ContentError('feed', 'shape', 'feed.json 有貼文缺少 id 或用了不認得的 format');
  }
}

/**
 * 支線：每個年份一個檔（content/game/side/<年份>.json）。任何一檔讀不到或格式不對都只是少那一年的支線，不影響主線。
 * 回傳 { missions, byId, chapters, chapterById, npcs, failed }。
 */
async function loadSide({ base, years, injected, knownNpcIds, localizer }) {
  const out = { missions: [], byId: new Map(), chapters: [], chapterById: new Map(), npcs: [], failed: [] };
  const files = await Promise.all(
    years.map(async (year) => {
      try {
        if (injected && typeof injected === 'object') return injected[year] || null;
        const response = await fetch(new URL(`side/${year}.json`, base), { cache: 'no-cache' });
        return response.ok ? await response.json() : null;
      } catch {
        return null;
      }
    }).map(async (pending, i) => (localizer ? localizer.localize(`side/${years[i]}.json`, await pending) : pending)),
  );
  years.forEach((year, i) => {
    const file = files[i];
    try {
      if (!file || !Array.isArray(file.missions) || !Array.isArray(file.chapters)) throw new Error('empty');
      const npcs = (file.npcs || []).filter((npc) => npc?.id && npc.name && !knownNpcIds.has(npc.id));
      const missions = file.missions.map((mission, index) => {
        if (!mission?.id || !mission.title || !mission.locationId || !Array.isArray(mission.steps)) throw new Error('mission');
        for (const step of mission.steps) {
          if (!STEP_TYPES.has(step?.type)) throw new Error('step');
          if (step.type === 'choice' && !Array.isArray(step.options)) throw new Error('options');
          if (step.type === 'quiz' && !(step.inline && Array.isArray(step.inline.options)) && !Array.isArray(step.ids)) throw new Error('quiz');
        }
        return { ...mission, year: mission.year ?? year, order: index + 1, isSide: true, splash: `loc_${mission.locationId}`, chapterIds: mission.chapterIds || [] };
      });
      for (const npc of npcs) {
        knownNpcIds.add(npc.id);
        out.npcs.push({ ...npc, sideYear: year });
      }
      for (const chapter of file.chapters) {
        if (!chapter?.id) continue;
        const item = { ...chapter, year };
        out.chapters.push(item);
        out.chapterById.set(item.id, item);
      }
      for (const mission of missions) {
        if (out.byId.has(mission.id)) continue;
        out.missions.push(mission);
        out.byId.set(mission.id, mission);
      }
    } catch {
      out.failed.push(year);
    }
  });
  return out;
}

export async function loadContent({ useFixtures = false } = {}) {
  let raw;
  let source;
  const injected = window.__DC_CONTENT__;
  if (!useFixtures && injected && typeof injected === 'object') {
    raw = injected;
    source = 'bundle';
  } else {
    const base = useFixtures ? new URL('./dev/fixtures/', import.meta.url) : new URL('content/game/', document.baseURI);
    const entries = await Promise.all(
      CONTENT_FILES.map(async (file) => [file, await fetchJson(new URL(`${file}.json`, base), file)]),
    );
    raw = Object.fromEntries(entries);
    source = useFixtures ? 'fixtures' : 'content';
  }
  const localizer = await createLocalizer({ useFixtures, injected: source === 'bundle' ? injected : null });
  if (localizer) {
    const local = await Promise.all(CONTENT_FILES.map((file) => localizer.localize(`${file}.json`, raw[file])));
    raw = { ...raw, ...Object.fromEntries(CONTENT_FILES.map((file, i) => [file, local[i]])) };
  }
  validate(raw);

  const missions = [...raw.missions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const books = [...raw.books].sort((a, b) => a.year - b.year);
  // 支線：主線有哪些年份就找哪些年份的檔；新 NPC 併進 NPC 表（標上 sideYear，那一年開放後才出現在街上）
  const sideBase = useFixtures ? new URL('./dev/fixtures/', import.meta.url) : new URL('content/game/', document.baseURI);
  const years = [...new Set(missions.map((m) => m.year).filter(Number.isInteger))].sort();
  const side = await loadSide({ base: sideBase, years, injected: source === 'bundle' ? raw.side || {} : null, knownNpcIds: new Set(raw.npcs.map((n) => n.id)), localizer });
  raw.npcs = [...raw.npcs, ...side.npcs];
  // 職能劇本：每個職能一條自己的主線（content/game/role-missions.json，由 tools/build_role_missions.py 合併）。
  // 沒有這個檔或結構不對就用通用版。譯文照一般譯檔的方式疊上去，語音也照中文原句找。
  let roleMissions = null;
  if (!useFixtures) {
    try {
      let rm = source === 'bundle' ? raw['role-missions'] ?? null : null;
      if (!rm && source !== 'bundle') {
        const response = await fetch(new URL('content/game/role-missions.json', document.baseURI), { cache: 'no-cache' });
        rm = response.ok ? await response.json() : null;
      }
      if (rm && localizer) rm = await localizer.localize('role-missions.json', rm);
      if (rm && typeof rm === 'object') {
        roleMissions = new Map(Object.entries(rm).filter(([, list]) => Array.isArray(list) && list.length === missions.length)
          .map(([role, list]) => [role, [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))]));
      }
    } catch {
      roleMissions = null;
    }
  }
  // 職能過場台詞（客戶真心話、阿凱的回應）：content/game/role-interludes.json，{role:[{after, sincere, partner}]}
  let roleInterludes = null;
  if (!useFixtures) {
    try {
      let ri = source === 'bundle' ? raw['role-interludes'] ?? null : null;
      if (!ri && source !== 'bundle') {
        const response = await fetch(new URL('content/game/role-interludes.json', document.baseURI), { cache: 'no-cache' });
        ri = response.ok ? await response.json() : null;
      }
      if (ri && localizer) ri = await localizer.localize('role-interludes.json', ri);
      if (ri && typeof ri === 'object') roleInterludes = new Map(Object.entries(ri).filter(([, list]) => Array.isArray(list))
        .map(([role, list]) => [role, new Map(list.map((item) => [item.after, item]))]));
    } catch {
      roleInterludes = null;
    }
  }
  localizer?.report();
  return {
    side,
    source,
    voiceTexts: localizer?.voice || null,
    roles: raw.roles,
    books,
    missions,
    baseMissions: [...missions],
    roleMissions,
    roleInterludes,
    baseInterludes: raw.story.interludes,
    quiz: raw.quiz,
    npcs: raw.npcs,
    radio: raw.radio,
    grandma: raw.grandma || null,
    endings: raw.endings,
    story: raw.story,
    feed: raw.feed,
    interludeByMission: new Map(raw.story.interludes.map((item) => [item.after, item])),
    roleById: new Map(raw.roles.map((r) => [r.id, r])),
    missionById: new Map(missions.map((m) => [m.id, m])),
    bookByYear: new Map(books.map((b) => [b.year, b])),
    quizById: new Map(raw.quiz.map((q) => [q.id, q])),
    npcById: new Map(raw.npcs.map((n) => [n.id, n])),
  };
}
