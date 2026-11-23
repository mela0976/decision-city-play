// 介面本身的字（按鈕、狀態）。任務、角色、題目的文字一律來自 content/game/*.json，不寫在這裡。
// 三種語言的字放在 js/game/i18n/{zh,en,ja}.js（同鍵、同巢狀）；這裡依目前語言（lang.js）轉出同一組名稱。

import { LANG } from './lang.js?v=3b36a303';
import * as zh from './i18n/zh.js?v=3b36a303';
import * as en from './i18n/en.js?v=3b36a303';
import * as ja from './i18n/ja.js?v=3b36a303';

const PACKS = { zh, en, ja };
const pack = PACKS[LANG] || zh;

export { LANG };
export const METER_IDS = ['brand', 'sales', 'trust', 'liver'];
export const METER_NAMES = pack.METER_NAMES;
export const T = pack.T;
export const KEY = pack.KEY;
export const HINT = pack.HINT;
export const PLACES = pack.PLACES;
export const LANDMARKS = pack.LANDMARKS;
/** 中文原文的介面字：標題的霓虹招牌（街景的一部分，不翻）與語音對照用。 */
export const ZH_T = zh.T;
/** 章節名的引號（SPEC 3.3：〈〉→ 英文 “ ”、日文「」）。 */
export const chapterQuote = (title) => (LANG === 'en' ? `“${title}”` : LANG === 'ja' ? `「${title}」` : `〈${title}〉`);
