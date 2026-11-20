// 內容載入：先看 window.__DC_CONTENT__（打包時注入），沒有才 fetch 十個內容檔（含敘事層的 story 與 feed）。
// useFixtures 為真時改讀 js/game/dev/fixtures/ 的假資料。

export const CONTENT_FILES = ['roles', 'books', 'missions', 'quiz', 'npcs', 'radio', 'grandma', 'endings', 'story', 'feed'];
const FEED_FORMATS = new Set(['livestream', 'dashcam', 'story', 'forum', 'chat', 'short', 'meeting', 'aichat']);
const STEP_TYPES = new Set(['dialogue', 'goto', 'choice', 'quiz', 'cutscene']);

export class ContentError extends Error {
  constructor(message, file) {
    super(message);
    this.name = 'ContentError';
    this.file = file;
  }
}

async function fetchJson(url, file) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-cache' });
  } catch {
    throw new ContentError(`${file}.json 連不上`, file);
  }
  if (!response.ok) throw new ContentError(`${file}.json 讀不到（${response.status}）`, file);
  try {
    return await response.json();
  } catch {
    throw new ContentError(`${file}.json 格式壞了`, file);
  }
}

function requireArray(raw, file, { allowEmpty = false } = {}) {
  const value = raw[file];
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new ContentError(`${file}.json 應該是一個${allowEmpty ? '' : '有內容的'}陣列`, file);
  }
  return value;
}

function validate(raw) {
  const roles = requireArray(raw, 'roles');
  for (const role of roles) {
    if (!role?.id || !role.title || typeof role.start !== 'object') throw new ContentError('roles.json 有角色缺少 id、title 或 start', 'roles');
  }
  const missions = requireArray(raw, 'missions');
  for (const mission of missions) {
    if (!mission?.id || !Array.isArray(mission.steps)) throw new ContentError('missions.json 有任務缺少 id 或 steps', 'missions');
    for (const step of mission.steps) {
      if (!STEP_TYPES.has(step?.type)) throw new ContentError(`missions.json：${mission.id} 有不認得的步驟種類`, 'missions');
      if (step.type === 'choice' && !Array.isArray(step.options)) throw new ContentError(`missions.json：${mission.id} 的抉擇沒有選項`, 'missions');
    }
  }
  requireArray(raw, 'endings');
  requireArray(raw, 'books', { allowEmpty: true });
  requireArray(raw, 'quiz', { allowEmpty: true });
  requireArray(raw, 'npcs', { allowEmpty: true });
  requireArray(raw, 'radio', { allowEmpty: true });
  if (raw.grandma != null && typeof raw.grandma !== 'object') throw new ContentError('grandma.json 應該是一個物件', 'grandma');
  if (raw.story == null || typeof raw.story !== 'object' || Array.isArray(raw.story)) throw new ContentError('story.json 應該是一個物件', 'story');
  for (const key of ['prologue', 'interludes']) {
    if (!Array.isArray(raw.story[key])) throw new ContentError(`story.json 缺少 ${key}`, 'story');
  }
  for (const item of raw.story.interludes) {
    if (!item?.after || !item.grandma || !Array.isArray(item.grandma.replies)) throw new ContentError('story.json 有過場缺少 after 或阿嬤的回覆選項', 'story');
  }
  const feed = requireArray(raw, 'feed', { allowEmpty: true });
  for (const post of feed) {
    if (!post?.id || !FEED_FORMATS.has(post.format)) throw new ContentError('feed.json 有貼文缺少 id 或用了不認得的 format', 'feed');
  }
}

/**
 * 支線：每個年份一個檔（content/game/side/<年份>.json）。任何一檔讀不到或格式不對都只是少那一年的支線，不影響主線。
 * 回傳 { missions, byId, chapters, chapterById, npcs, failed }。
 */
async function loadSide({ base, years, injected, knownNpcIds }) {
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
    }),
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
  validate(raw);

  const missions = [...raw.missions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const books = [...raw.books].sort((a, b) => a.year - b.year);
  // 支線：主線有哪些年份就找哪些年份的檔；新 NPC 併進 NPC 表（標上 sideYear，那一年開放後才出現在街上）
  const sideBase = useFixtures ? new URL('./dev/fixtures/', import.meta.url) : new URL('content/game/', document.baseURI);
  const years = [...new Set(missions.map((m) => m.year).filter(Number.isInteger))].sort();
  const side = await loadSide({ base: sideBase, years, injected: source === 'bundle' ? raw.side || {} : null, knownNpcIds: new Set(raw.npcs.map((n) => n.id)) });
  raw.npcs = [...raw.npcs, ...side.npcs];
  return {
    side,
    source,
    roles: raw.roles,
    books,
    missions,
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
