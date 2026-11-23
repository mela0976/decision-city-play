// 支線任務：九本書其餘的章節。這裡只放查詢與數值規則，流程在 game.js，畫面在 ui/side-*.js。
//
// 開放規則：某一年的主線任務過關後，那一年的支線全部開放，之後整局都能做，全部選做。
// 數值規則：89 個支線全做、全選最有利的選項，原始加總是品牌力 +260～460、信任 +630～800、肝指數 +340～380，
//   會讓三項全滿、肝指數必爆。所以支線帶來的增減一律只算三分之一，而且整局累計有上限：
//   品牌力、業績、客戶信任各 +12（最多扣到 −8），肝指數 +5（最多降到 −10）。到了上限，支線只給章節卡。

import { METER_IDS } from './strings.js?v=986dcfc6';

export const SIDE_SCALE = 1 / 3;
export const SIDE_CAP = { brand: [-8, 12], sales: [-8, 12], trust: [-8, 12], liver: [-10, 5] };

export const blankGain = () => Object.fromEntries(METER_IDS.map((id) => [id, 0]));

/**
 * 把一筆支線的數值變化換算成實際要加的量：打折（四捨五入，但非零的至少算 1），再扣掉已經用掉的額度。
 * gain 會被更新。回傳 { applied, capped }。
 */
export function scaleSideEffects(effects, gain) {
  const applied = {};
  let capped = false;
  for (const id of METER_IDS) {
    const raw = Number(effects?.[id]) || 0;
    if (!raw) continue;
    const scaled = Math.sign(raw) * Math.max(1, Math.round(Math.abs(raw) * SIDE_SCALE));
    const [low, high] = SIDE_CAP[id];
    const before = gain[id] || 0;
    const after = Math.max(low, Math.min(high, before + scaled));
    if (after - before !== scaled) capped = true;
    if (after !== before) applied[id] = after - before;
    gain[id] = after;
  }
  return { applied, capped };
}

export const yearDone = (game, year) => game.content.missions.some((m) => m.year === year && game.state.doneMissionIds.includes(m.id));

// 年度重玩中：只開放重玩那一年的支線
export const sideStatus = (game, side) => (game.state.side[side.id] ? 'done' : game.replay && side.year !== game.replay.year ? 'locked' : yearDone(game, side.year) ? 'open' : 'locked');

/** 開放中、還沒做的支線。 */
export const openSides = (game) => game.content.side.missions.filter((side) => sideStatus(game, side) === 'open');

export const sidesAt = (game, locationId) => openSides(game).filter((side) => side.locationId === locationId);

/** 章節進度：主線涵蓋的章節在那個主線過關時算已讀；支線涵蓋的在支線完成時算已讀。 */
export function chapterProgress(game) {
  const { content, state } = game;
  const isRead = (chapter) => {
    const by = chapter.coveredBy;
    if (!by) return false;
    return content.missionById.has(by) ? state.doneMissionIds.includes(by) : !!state.side[by];
  };
  const years = new Map();
  let read = 0;
  for (const chapter of content.side.chapters) {
    const entry = years.get(chapter.year) || { year: chapter.year, read: 0, total: 0, sidesDone: 0, sidesTotal: 0 };
    entry.total += 1;
    if (isRead(chapter)) {
      entry.read += 1;
      read += 1;
    }
    years.set(chapter.year, entry);
  }
  let sidesDone = 0;
  for (const side of content.side.missions) {
    const entry = years.get(side.year) || { year: side.year, read: 0, total: 0, sidesDone: 0, sidesTotal: 0 };
    entry.sidesTotal += 1;
    if (state.side[side.id]) {
      entry.sidesDone += 1;
      sidesDone += 1;
    }
    years.set(side.year, entry);
  }
  return { read, total: content.side.chapters.length, sidesDone, sidesTotal: content.side.missions.length, years: [...years.values()].sort((a, b) => a.year - b.year), isRead };
}

export const chapterTitles = (game, side) => side.chapterIds.map((id) => game.content.side.chapterById.get(id)?.title).filter(Boolean);

/** 手機裡的支線清單：按年份分組。 */
export function sideGroups(game) {
  const progress = chapterProgress(game);
  return progress.years.map((year) => ({
    ...year,
    open: yearDone(game, year.year) && (!game.replay || game.replay.year === year.year),
    items: game.content.side.missions
      .filter((side) => side.year === year.year)
      .map((side) => ({
        id: side.id,
        title: side.title,
        place: game.placeName(side.locationId),
        giver: game.content.npcById.get(side.giver)?.name || '',
        chapters: chapterTitles(game, side),
        status: sideStatus(game, side),
      })),
  }));
}

/** 「今晚的提案」的附錄：已完成支線的章節卡，照年份排。 */
export function appendixCards(game) {
  return game.content.side.missions
    .filter((side) => game.state.side[side.id] && side.card)
    .map((side) => ({ id: side.id, year: side.year, title: side.card.title || side.title, text: side.card.text || '', chapters: chapterTitles(game, side) }));
}
