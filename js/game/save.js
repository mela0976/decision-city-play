// 存檔：照 docs/CONTRACTS.md 第 8 節，localStorage 鍵 decision-city-save-v1。
//   { version, roleId, meters, clock, doneMissionIds, currentMissionId, books,
//     quizSeen: { correct, asked, right }, grandma: { unlocked, on, templeVisits },
//     relief, bond, interludesSeen, prologueSeen, morningDone,
//     side: { <支線 id>: { option, quiz } }, sideGain: { <meter>: 支線累計帶來的增減 } }   ← 支線；舊存檔沒有就當成空的
//     inspiration: [<靈感 id>]   ← 自己騎車沿路撿到的靈感，依撿到的順序；舊存檔沒有就當成空的
// 讀寫都包在 try/catch；讀不到、版本不符或欄位不齊（例如舊格式的存檔），一律當作沒有存檔。
// 音效、提示列等偏好另存 decision-city-prefs-v1。破關紀錄與年度重玩的成績也記在偏好裡（finished、lastRole、replay），
// 所以重新開一局、或年度重玩，都不會動到主線存檔。

import { METER_IDS } from './strings.js?v=de58bb6c';

export const SAVE_KEY = 'decision-city-save-v1';
export const SAVE_VERSION = 1;
const PREFS_KEY = 'decision-city-prefs-v1';

const isCount = (n) => Number.isInteger(n) && n >= 0;
const strings = (list) => list.filter((item) => typeof item === 'string');

function normalizeSide(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, item] of Object.entries(raw)) {
    if (!item || typeof item !== 'object') continue;
    out[id] = { option: Number.isInteger(item.option) ? item.option : -1, quiz: !!item.quiz };
  }
  return out;
}

function normalizeGain(raw) {
  const out = {};
  for (const id of METER_IDS) out[id] = Number.isFinite(raw?.[id]) ? raw[id] : 0;
  return out;
}

function normalize(data) {
  if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION) return null;
  if (data.roleId !== null && typeof data.roleId !== 'string') return null;
  if (!data.meters || typeof data.meters !== 'object') return null;
  const meters = {};
  for (const id of METER_IDS) {
    const value = data.meters[id];
    if (!Number.isFinite(value)) return null;
    meters[id] = Math.max(0, Math.min(100, Math.round(value)));
  }
  if (typeof data.clock !== 'string' || !/^\d{1,2}:\d{2}$/.test(data.clock)) return null;
  if (!Array.isArray(data.doneMissionIds) || !Array.isArray(data.books)) return null;
  if (data.currentMissionId !== null && typeof data.currentMissionId !== 'string') return null;
  const quiz = data.quizSeen;
  if (!quiz || typeof quiz !== 'object' || !Array.isArray(quiz.correct) || !isCount(quiz.asked) || !isCount(quiz.right)) return null;
  const grandma = data.grandma;
  if (!grandma || typeof grandma !== 'object') return null;
  if (!Array.isArray(data.relief) || !Array.isArray(data.interludesSeen)) return null;
  if (!Number.isFinite(data.bond) || typeof data.prologueSeen !== 'boolean') return null;
  return {
    version: SAVE_VERSION,
    roleId: data.roleId,
    meters,
    clock: data.clock,
    carUnlocked: data.carUnlocked === true, // A26
    carNoticePending: data.carNoticePending === true,
    doneMissionIds: strings(data.doneMissionIds),
    currentMissionId: data.currentMissionId,
    books: data.books.filter((year) => Number.isInteger(year)),
    quizSeen: { correct: strings(quiz.correct), asked: quiz.asked, right: Math.min(quiz.right, quiz.asked) },
    grandma: { unlocked: !!grandma.unlocked, on: !!grandma.unlocked && !!grandma.on, templeVisits: isCount(grandma.templeVisits) ? grandma.templeVisits : 0 },
    relief: strings(data.relief),
    bond: Math.round(data.bond),
    interludesSeen: strings(data.interludesSeen),
    prologueSeen: data.prologueSeen,
    // 晨會：舊存檔沒有這個欄位，已經有任務進度的就當作看過，免得回來又被擋在晨會
    morningDone: typeof data.morningDone === 'boolean' ? data.morningDone : data.doneMissionIds.length > 0 || (data.prologueSeen && data.currentMissionId !== null),
    side: normalizeSide(data.side),
    sideGain: normalizeGain(data.sideGain),
    inspiration: Array.isArray(data.inspiration) ? [...new Set(strings(data.inspiration))] : [],
  };
}

export function createStore() {
  let available = false;
  try {
    const probe = '__decision-city-probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }

  return {
    get available() {
      return available;
    },
    read() {
      if (!available) return null;
      try {
        const text = window.localStorage.getItem(SAVE_KEY);
        if (!text) return null;
        return normalize(JSON.parse(text));
      } catch {
        return null;
      }
    },
    write(data) {
      if (!available) return false;
      try {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
        return true;
      } catch {
        available = false;
        return false;
      }
    },
    clear() {
      if (!available) return;
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch {
        /* 清不掉就算了，下次讀到再判斷 */
      }
    },
    readPrefs() {
      if (!available) return {};
      try {
        const prefs = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}');
        return prefs && typeof prefs === 'object' ? prefs : {};
      } catch {
        return {};
      }
    },
    writePrefs(prefs) {
      if (!available) return;
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      } catch {
        /* 偏好存不了不影響遊戲 */
      }
    },
  };
}
