// 書中章節的引用：章節名加上一行小字署名（作者或團隊、頁碼）。任務卡、章節卡、支線清單、提案附錄共用。

import { h } from '../dom.js?v=0da320b3';
import { chapterQuote } from '../strings.js?v=0da320b3';

export const chapterCite = (tag, className, ref) =>
  h(tag, { class: className }, chapterQuote(ref.title), ref.by ? h('small', { class: 'chapter-by', text: ref.by, title: ref.roles || null }) : null);
