// 敘事層（docs/NARRATIVE.md、content/game/story.json、feed.json）：
//   序幕、每個任務開場的「那一年的台灣網路」、任務之後的過場（提案入手、真心話被打斷、搭檔與阿嬤的訊息）、收工時的兩種結尾。
// 這裡只管流程；文字全部來自內容檔，畫面在 ui/phone.js、ui/feed.js、ui/interlude.js。

import { showMessages } from './ui/phone.js';
import { playFeed } from './ui/feed.js';
import { showSlide, runSincere } from './ui/interlude.js';

const PROLOGUE_SCENE = 'intro_poster';
const FINALE_SCENE = 'loc_rechao';

/** 訊息畫面上的對象：名字、職稱、頭像（只有阿嬤與玩家自己有立繪）。 */
export function contactOf(game, who) {
  const person = game.speakerOf(who);
  const npc = game.content.npcById.get(who);
  let portrait = null;
  if (who === 'grandma' || npc?.skin === 'npc_grandma') portrait = 'grandma_portrait';
  else if (person.isPlayer) portrait = game.role?.portrait || null;
  return { id: who, name: person.name, title: person.title, portrait };
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
        history: contact.portrait === 'grandma_portrait' ? grandmaHistory(game) : [],
        messages: filled.slice(i, j).map((item) => item.text),
        signal,
        sfx: game.sfx,
        voice: game.voiceFor(line.who),
        voiceMessage: contact.portrait === 'grandma_portrait',
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
  await playLines(game, lines, { sceneKey: PROLOGUE_SCENE, signal });
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
  const withGrandma = grandmaWithUs(game);
  const lines = (withGrandma ? finale.withGrandma : finale.withoutGrandma) || [];
  if (lines.length) await playLines(game, lines, { sceneKey: FINALE_SCENE, signal });
  game.setScene(null);
  return withGrandma ? 'withGrandma' : 'withoutGrandma';
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
  if (last && grandmaWithUs(game) && state.interludesSeen.includes(last.after)) {
    const grandma = contactOf(game, castNpc(game, 'grandma') || 'grandma');
    pages.push({ no: pages.length + 1, year: null, title: last.grandma.text, points: [], quote: '', source: grandma.name, owned: true, grandma: true });
  }
  return pages;
}
