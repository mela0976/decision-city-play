// 敘事層（docs/NARRATIVE.md、content/game/story.json、feed.json）：
//   序幕、每個任務開場的「那一年的台灣網路」、任務之後的過場（提案入手、真心話被打斷、搭檔與阿嬤的訊息）、收工時的兩種結尾。
// 這裡只管流程；文字全部來自內容檔，畫面在 ui/phone.js、ui/feed.js、ui/interlude.js。

import { showMessages } from './ui/phone.js?v=ac7fc88';
import { playFeed } from './ui/feed.js?v=ac7fc88';
import { showSlide, runSincere } from './ui/interlude.js?v=ac7fc88';
import { T, LANG } from './strings.js?v=ac7fc88';

// 序幕在吳興街租屋處；清單裡沒有那張圖就退回開場海報
const PROLOGUE_SCENE = 'loc_home';
const PROLOGUE_SCENE_FALLBACK = 'intro_poster';
const FINALE_SCENE = 'loc_rechao';
const MORNING_SCENE = 'loc_office';
// 內容檔沒有寫 finale.unfinished 時的備用對白（肝指數中途滿了、任務沒做完）
const FINALE_UNFINISHED = [
  { who: 'data_kai', text: T.fallbackKai },
  { who: 'boss_lin', text: LANG === 'en' ? 'OK.' : 'OK。' },
  { who: 'grandma', text: T.fallbackGrandma, via: 'line' },
];

/** 訊息畫面上的對象：名字、職稱、頭像。有 avatar_<id> 就用；沒有的話阿嬤與玩家自己用立繪，其他人用名字的第一個字。 */
export function contactOf(game, who) {
  const person = game.speakerOf(who);
  const npc = game.content.npcById.get(who);
  const isGrandma = who === 'grandma' || npc?.skin === 'npc_grandma';
  let portrait = person.avatar || null;
  if (!portrait && isGrandma) portrait = 'grandma_portrait';
  else if (!portrait && person.isPlayer) portrait = game.role?.portrait || null;
  return { id: who, name: person.name, title: person.title, portrait, isGrandma };
}

const castNpc = (game, id) => game.content.story.cast?.find((member) => member.id === id)?.npcId || null;

/** 阿嬤先前傳過的訊息（已經看過的過場裡的那幾則），訊息畫面上當作歷史紀錄。 */
function grandmaHistory(game, limit = 2) {
  const seen = new Set(game.state.interludesSeen);
  return game.content.story.interludes.filter((item) => seen.has(item.after)).map((item) => item.grandma.text).slice(-limit);
}

/**
 * 播一段劇本：via 為 line 的句子用訊息畫面（同一個人連續幾則併在同一串），其餘用字幕。
 */
export async function playLines(game, lines, { sceneKey, signal }) {
  const filled = game.fillLines(lines).map((line, i) => ({ ...line, via: lines[i].via }));
  const { layer } = game.els;
  game.setScene(sceneKey);
  let i = 0;
  while (i < filled.length) {
    const line = filled[i];
    let j = i + 1;
    if (line.via === 'line') {
      while (j < filled.length && filled[j].via === 'line' && filled[j].who === line.who) j += 1;
      const contact = contactOf(game, line.who);
      await showMessages({
        layer,
        assets: game.assets,
        contact,
        history: contact.isGrandma ? grandmaHistory(game) : [],
        me: contactOf(game, 'player'),
        messages: filled.slice(i, j).map((item) => item.text),
        signal,
        sfx: game.sfx,
        voice: game.voiceFor(line.who),
        voiceMessage: contact.isGrandma,
        onState: () => game.setHint('message', { name: contact.name }),
      });
    } else {
      while (j < filled.length && filled[j].via !== 'line') j += 1;
      await game.talk(filled.slice(i, j), { signal });
    }
    i = j;
  }
  layer.replaceChildren();
}

export async function playPrologue(game, signal) {
  const lines = game.content.story.prologue || [];
  if (!lines.length) return;
  await playLines(game, lines, { sceneKey: game.assets.imageSrc(PROLOGUE_SCENE) ? PROLOGUE_SCENE : PROLOGUE_SCENE_FALLBACK, signal });
  game.setScene(null);
}

/**
 * 晨會：序幕之後、第一個任務之前，在富幫 A25 會議室。會議室劇照淡入，字幕對話；不給分、不計時、不動時鐘。
 * 台詞有語音（缺檔時只出字幕）。存檔由呼叫的人處理（除錯預覽不存）。
 */
export async function playMorning(game, signal) {
  const lines = game.content.story.morning?.lines || [];
  if (!lines.length) return;
  const { scene } = game.els;
  // 先把舊的劇照收掉，再放會議室的，淡入才看得到
  game.setScene(null);
  scene.dataset.fade = 'in';
  try {
    await playLines(game, lines, { sceneKey: game.assets.imageSrc(MORNING_SCENE) ? MORNING_SCENE : PROLOGUE_SCENE_FALLBACK, signal });
  } finally {
    delete scene.dataset.fade;
  }
  game.setScene(null);
}

/** 任務卡之前：那一年的幾則貼文。 */
export async function playFeedFor(game, mission, signal) {
  const posts = game.content.feed.filter((post) => post.year === mission.year);
  if (!posts.length) return;
  game.setHint('feed', { year: mission.year });
  await playFeed({ layer: game.els.layer, assets: game.assets, posts, year: mission.year, signal, sfx: game.sfx });
  game.els.layer.replaceChildren();
}

/**
 * 任務過關之後的過場。preview 為真時只播畫面（除錯用），不動存檔。
 * 選了阿嬤那一則的回覆才記進 interludesSeen；在那之前重新整理，回來會從這段過場的開頭再播，不會重複加分。
 */
export async function playInterlude(game, mission, signal, { preview = false } = {}) {
  const item = game.content.interludeByMission.get(mission.id);
  if (!item) return null;
  if (!preview && game.state.interludesSeen.includes(mission.id)) return null;
  const { layer } = game.els;
  const page = game.content.missions.indexOf(mission) + 1;

  game.setScene(mission.splash);
  game.setHint('slide', { page });
  await showSlide({ layer, page, year: mission.year, title: item.slide, signal, sfx: game.sfx });

  const speaker = game.speakerOf(item.sincere.who);
  const bossId = castNpc(game, 'boss');
  game.setHint('dialogue', { speaker: speaker.name, menu: game.inGame });
  const kind = await runSincere({
    layer,
    assets: game.assets,
    speaker,
    text: game.fillLines([item.sincere])[0].text,
    interrupt: { kind: item.interrupt.kind, text: game.fillLines([item.interrupt])[0].text },
    sender: item.interrupt.kind === 'boss_line' && bossId ? contactOf(game, bossId) : null,
    signal,
    sfx: game.sfx,
    voice: game.voiceFor(item.sincere.who),
  });

  const partner = contactOf(game, item.partner.who);
  await showMessages({
    layer,
    assets: game.assets,
    contact: partner,
    messages: [game.fillLines([item.partner])[0].text],
    signal,
    sfx: game.sfx,
    voice: game.voiceFor(item.partner.who),
    onState: () => game.setHint('message', { name: partner.name }),
  });

  const grandmaId = castNpc(game, 'grandma') || 'grandma';
  const grandma = contactOf(game, grandmaId);
  const reply = await showMessages({
    layer,
    assets: game.assets,
    contact: grandma,
    history: grandmaHistory(game),
    messages: [game.fillLines([item.grandma])[0].text],
    replies: item.grandma.replies,
    me: contactOf(game, 'player'),
    signal,
    sfx: game.sfx,
    voice: game.voiceFor(grandmaId),
    voiceMessage: true,
    onState: (state, count) => (state === 'reply' ? game.setHint('reply', { name: grandma.name, count }) : game.setHint('message', { name: grandma.name })),
    // 一選完回覆就結算並存檔：阿嬤線累計、數值照加、這段過場記為看過。之後重新整理不會再補播，也不會再加一次。
    onReply: (picked) => {
      if (preview || game.state.interludesSeen.includes(mission.id)) return;
      game.state.bond += Number(picked.bond) || 0;
      if (picked.effects) game.applyEffects(picked.effects, { silent: true });
      game.state.interludesSeen.push(mission.id);
      game.commit();
    },
  });
  layer.replaceChildren();
  return { kind, reply };
}

export function grandmaWithUs(game) {
  const threshold = game.content.story.finale?.bondThreshold;
  return Number.isFinite(threshold) && game.state.bond >= threshold;
}

/** 熱炒店收工：阿嬤線夠不夠，決定播哪一段。 */
export async function playFinale(game, signal) {
  const finale = game.content.story.finale;
  if (!finale) return null;
  // 肝指數中途滿了、任務沒做完：不能播「九頁簡報」那段，改播短的收工對白
  const unfinished = game.state.doneMissionIds.length < game.content.missions.length;
  const withGrandma = !unfinished && grandmaWithUs(game);
  const lines = (unfinished ? finale.unfinished || FINALE_UNFINISHED : withGrandma ? finale.withGrandma : finale.withoutGrandma) || [];
  if (lines.length) await playLines(game, lines, { sceneKey: FINALE_SCENE, signal });
  game.setScene(null);
  return unfinished ? 'unfinished' : withGrandma ? 'withGrandma' : 'withoutGrandma';
}

/** 「今晚的提案」的頁面：一個任務一頁；阿嬤線夠了、也收到她最後那則訊息之後，多一頁她的那一句。 */
export function proposalPages(game) {
  const { content, state } = game;
  const pages = content.missions.map((mission, i) => {
    const book = content.bookByYear.get(mission.year);
    const item = content.interludeByMission.get(mission.id);
    return {
      no: i + 1,
      year: mission.year,
      title: item?.slide || book?.theme || mission.title,
      points: book?.keyPoints || [],
      quote: book?.quote || '',
      source: book ? [book.title, book.subtitle].filter(Boolean).join('｜') : '',
      owned: state.books.includes(mission.year),
    };
  });
  const last = content.story.interludes[content.story.interludes.length - 1];
  const allDone = state.doneMissionIds.length >= content.missions.length;
  if (last && allDone && grandmaWithUs(game) && state.interludesSeen.includes(last.after)) {
    const grandma = contactOf(game, castNpc(game, 'grandma') || 'grandma');
    // 內容有寫 finale.grandmaSlide 就用它；沒有才退回她最後那則訊息
    const slide = content.story.finale?.grandmaSlide;
    pages.push({ no: pages.length + 1, year: null, title: slide?.title || last.grandma.text, points: [], quote: slide?.title ? slide.text || '' : '', source: grandma.name, owned: true, grandma: true });
  }
  return pages;
}
