// 「那一年的台灣網路」：每個任務開場播的幾則虛構貼文，每則約兩秒，可跳過。
// 八種外框都是通用樣式（直播、行車紀錄器、限時動態、論壇、群組、短影音、線上會議、與 AI 的對話），
// 不模仿任何真實平台的標誌、配色與版面。有圖的貼文用 9:16 直式圖置中，兩側用同一張圖模糊放大鋪滿。

import { h, interaction, reducedMotion } from '../dom.js?v=de58bb6c';
import { T, ZH_T } from '../strings.js?v=de58bb6c';
import { icon } from './icons.js?v=de58bb6c';

const BASE_MS = 2200;
const PER_CHAR_MS = 12;
const MAX_MS = 3400;

const speaker = (text) => {
  const match = String(text).match(/^([^：:]{1,8})[：:]\s*(.+)$/);
  return match ? { name: match[1], text: match[2] } : { name: '', text: String(text) };
};
const isSelf = (name) => T.feedSelf.includes(name) || ZH_T.feedSelf.includes(name);
const escapeRe = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 論壇留言的前綴（推／噓／→ 或譯版的 ▲／▼／→）；譯檔還沒到、退回中文內容時也認得中文前綴
const FORUM_TAG = new RegExp(`^(${[...new Set([...Object.values(T.forumTags), ...Object.values(ZH_T.forumTags)])].map(escapeRe).join('|')})\\s*(.*)$`);

/** 行車紀錄器畫面上的車速讀數：資料裡沒有，從貼文 id 算一個固定的數字。 */
const speedOf = (id) => 28 + ([...String(id)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 22);

function media(post, assets) {
  return post.image ? assets.art(post.image, { kind: 'cover', className: 'post-media' }) : h('div', { class: 'post-media art art--cover', dataset: { tone: String(assets.toneOf(post.id)) } });
}

const commentsList = (post, className = 'post-comments') => h('ul', { class: className }, (post.comments || []).map((text, i) => h('li', { vars: { '--i': String(i) }, text })));

function bubbles(lines, { named = true } = {}) {
  return h(
    'ol',
    { class: 'post-bubbles' },
    lines.map((raw, i) => {
      const { name, text } = speaker(raw);
      return h('li', { class: `bubble${isSelf(name) ? ' bubble--self' : ''}`, vars: { '--i': String(i) } }, named && name ? h('b', { text: name }) : null, h('span', { text }));
    }),
  );
}

// 有畫面的四種（直播、行車紀錄器、限時動態、短影音）：screen 是直式畫面與疊在上面的介面，text 是帳號、內文與留言。
// 版面夠高時 text 疊在畫面下緣；手機橫向時畫面在左、文字在右（見 css/story.css）。
const screen = (...kids) => h('div', { class: 'post-screen' }, kids);
const textBlock = (post, { comments = true, boxed = false, pills = false } = {}) =>
  h(
    'div',
    { class: 'post-text' },
    h('p', { class: 'post-handle', text: post.handle || '' }),
    h('p', { class: `post-caption${boxed ? ' post-caption--box' : ''}`, text: post.caption || '' }),
    comments ? commentsList(post, `post-comments${pills ? ' post-comments--pills' : ''}`) : null,
  );

const FRAMES = {
  livestream(post, assets) {
    return [
      screen(
        media(post, assets),
        // meta 常常自己就以「直播中」開頭，徽章已經說了，後面只留觀看數
        h('header', { class: 'post-top' }, h('span', { class: 'live-badge', text: T.feedLive }), h('span', { class: 'post-meta', text: String(post.meta || '').replace(new RegExp(`^${T.feedLive}[・·\\s]*`), '') })),
        h('div', { class: 'live-hearts', 'aria-hidden': 'true' }, [0, 1, 2, 3].map((i) => h('i', { vars: { '--i': String(i) } }, icon('heart', { filled: true })))),
      ),
      textBlock(post),
    ];
  },
  dashcam(post, assets) {
    return [
      screen(
        media(post, assets),
        h('div', { class: 'dash-osd', 'aria-hidden': 'true' }, h('span', { class: 'dash-rec', text: T.feedRec }), h('span', { class: 'dash-speed', text: `${speedOf(post.id)} km/h` }), h('i', { class: 'dash-corner dash-corner--a' }), h('i', { class: 'dash-corner dash-corner--b' })),
        h('header', { class: 'post-top' }, h('span', { class: 'dash-time', text: post.meta || '' })),
      ),
      textBlock(post),
    ];
  },
  story(post, assets, { index, total, ms }) {
    return [
      screen(
        media(post, assets),
        h('div', { class: 'story-bars', 'aria-hidden': 'true', vars: { '--ms': `${ms}ms` } }, Array.from({ length: total }, (_, i) => h('i', { class: i < index ? 'is-done' : i === index ? 'is-now' : '' }))),
        h('header', { class: 'post-top post-top--story' }, h('span', { class: 'avatar avatar--letter', 'aria-hidden': 'true', text: [...(post.handle || '？')][0] }), h('b', { text: post.handle || '' }), h('span', { class: 'post-meta', text: post.meta || '' })),
      ),
      textBlock(post, { boxed: true, pills: true }),
    ];
  },
  forum(post, assets) {
    return [
      h(
        'div',
        { class: 'forum' },
        h('p', { class: 'forum-meta', text: post.meta || '' }),
        h('h3', { class: 'forum-title', text: post.handle || '' }),
        post.image ? assets.art(post.image, { kind: 'wide', className: 'forum-image' }) : null,
        h('p', { class: 'forum-body', text: post.caption || '' }),
        h(
          'ul',
          { class: 'forum-replies' },
          (post.comments || []).map((raw, i) => {
            const match = String(raw).match(FORUM_TAG);
            return h('li', { vars: { '--i': String(i) } }, h('b', { text: match ? match[1] : T.forumTags.arrow }), h('span', { text: match ? match[2] : raw }));
          }),
        ),
      ),
    ];
  },
  chat(post) {
    return [h('div', { class: 'chatlog' }, h('header', { class: 'chatlog-head' }, h('b', { text: post.handle || '' }), h('span', { text: post.meta || '' })), bubbles([post.caption, ...(post.comments || [])]))];
  },
  short(post, assets) {
    return [
      screen(
        media(post, assets),
        h('header', { class: 'post-top' }, h('span', { class: 'post-meta post-meta--chip', text: post.meta || '' })),
        h('div', { class: 'short-rail', 'aria-hidden': 'true' }, h('i', {}, icon('heart')), h('i', {}, icon('comment')), h('i', {}, icon('share'))),
        h('div', { class: 'short-progress', 'aria-hidden': 'true' }),
      ),
      textBlock(post),
    ];
  },
  meeting(post, assets) {
    return [
      h(
        'div',
        { class: 'meeting' },
        h('header', { class: 'meeting-head' }, h('b', { text: post.handle || '' }), h('span', { text: post.meta || '' })),
        h(
          'div',
          { class: 'meeting-grid' },
          h('div', { class: 'meeting-tile meeting-tile--live' }, media(post, assets)),
          [0, 1, 2].map(() => h('div', { class: 'meeting-tile', 'aria-hidden': 'true' }, h('span', { class: 'meeting-muted' }, icon('micOff'), h('small', { text: T.feedMuted })))),
        ),
        h('p', { class: 'meeting-caption', text: post.caption || '' }),
        commentsList(post, 'post-comments meeting-chat'),
      ),
    ];
  },
  aichat(post) {
    return [h('div', { class: 'chatlog chatlog--ai' }, h('header', { class: 'chatlog-head' }, h('b', { text: post.handle || '' }), h('span', { text: post.meta || '' })), h('p', { class: 'chatlog-summary', text: post.caption || '' }), bubbles(post.comments || []))];
  },
};

export function playFeed({ layer, assets, posts, year, signal, sfx, onPost }) {
  if (!posts.length) return signal?.aborted ? Promise.reject(new DOMException('flow aborted', 'AbortError')) : Promise.resolve();
  return interaction(signal, (done) => {
    let index = -1;
    let timer = 0;
    const backdrop = h('div', { class: 'feed-backdrop', 'aria-hidden': 'true' });
    const slot = h('div', { class: 'feed-slot' });
    const skip = h('button', { type: 'button', class: 'btn btn--small', id: 'feed-skip', 'data-primary': true, text: T.skip });
    const root = h(
      'section',
      { class: 'feed', 'aria-label': T.feedTitle },
      backdrop,
      h('header', { class: 'feed-head' }, h('span', { class: 'lightbox', text: String(year) }), h('span', { class: 'sign-plate feed-title', text: T.feedTitle })),
      slot,
      h('div', { class: 'cine-actions' }, skip),
    );

    const show = () => {
      clearTimeout(timer);
      index += 1;
      if (index >= posts.length) {
        done();
        return;
      }
      const post = posts[index];
      const length = (post.caption || '').length + (post.comments || []).join('').length;
      const ms = Math.min(MAX_MS, BASE_MS + length * PER_CHAR_MS);
      const frame = h('article', { class: `post post--${post.format}${post.image ? ' has-image' : ''}`, dataset: { id: post.id, format: post.format }, vars: { '--ms': `${ms}ms` } });
      frame.append(...(FRAMES[post.format] || FRAMES.forum)(post, assets, { index, total: posts.length, ms }).filter(Boolean));
      backdrop.replaceChildren(post.image ? assets.art(post.image, { kind: 'cover' }) : '');
      slot.replaceChildren(frame);
      if (reducedMotion()) frame.classList.add('is-still');
      sfx?.play('select');
      onPost?.(post, index);
      timer = setTimeout(show, ms);
    };

    skip.addEventListener('click', (e) => {
      e.stopPropagation();
      done();
    });
    // 點貼文本身是看下一則
    slot.addEventListener('click', show);

    layer.replaceChildren(root);
    skip.focus({ preventScroll: true });
    show();
    return () => {
      clearTimeout(timer);
      root.remove();
    };
  });
}
