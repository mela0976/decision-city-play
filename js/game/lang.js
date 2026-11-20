// 目前的語言：網址 ?lang= 優先，其次是玩家記住的偏好，再其次看瀏覽器語言；都沒有就是中文。
// 換語言一律記住偏好後重新載入頁面（介面字串與內容檔都在載入時決定）。

export const LANGS = ['zh', 'en', 'ja'];
const PREF_KEY = 'decision-city-lang';
export const HTML_LANG = { zh: 'zh-Hant', en: 'en', ja: 'ja' };

const valid = (value) => (LANGS.includes(value) ? value : null);

function fromUrl() {
  try {
    return valid(new URLSearchParams(window.location.search).get('lang'));
  } catch {
    return null;
  }
}

function fromPref() {
  try {
    return valid(window.localStorage.getItem(PREF_KEY));
  } catch {
    return null;
  }
}

function fromBrowser() {
  let list = [];
  try {
    list = navigator.languages?.length ? [...navigator.languages] : [navigator.language];
  } catch {
    list = [];
  }
  const first = String(list.find(Boolean) || '').toLowerCase();
  if (!first) return null;
  if (first.startsWith('ja')) return 'ja';
  if (first.startsWith('zh')) return 'zh';
  return 'en';
}

export const LANG = fromUrl() || fromPref() || fromBrowser() || 'zh';

try {
  document.documentElement.lang = HTML_LANG[LANG];
} catch {
  /* 沒有 document（例如 Node 裡載入檢查）就算了 */
}

/** 換語言：記住偏好、把網址上的 ?lang= 換成新的（網址優先，不換會被它蓋掉），重新載入。 */
export function switchLang(next) {
  if (!valid(next)) return;
  try {
    window.localStorage.setItem(PREF_KEY, next);
  } catch {
    /* 存不了偏好：網址上的 lang 還是會帶過去 */
  }
  const url = new URL(window.location.href);
  url.searchParams.set('lang', next);
  window.location.assign(url.toString());
}
