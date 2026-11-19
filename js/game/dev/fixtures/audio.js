// 假資料用的聲音清單：全部指向現場產生的極短測試音（8 位元單聲道 WAV，做成 data: 網址，不必另外放檔案）。
// 用途是讓自動化驗收確認「該播的時候有呼叫播放、該停的時候有停」；聽起來只是幾聲嗶。

function beep(hz, seconds, rate = 8000) {
  const samples = Math.floor(rate * seconds);
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (offset, value) => [...value].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i += 1) {
    const fade = Math.min(1, i / 200, (samples - i) / 200);
    bytes[44 + i] = 128 + Math.round(Math.sin((i / rate) * hz * 2 * Math.PI) * 40 * fade);
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * content：假資料的內容；voiceKey：sound.js 的同一個算法。
 * 假資料的每一句對話、序幕、真心話、訊息與收尾都配上測試音，key 的算法跟正式的一樣。
 */
export function buildFixtureAudio(content, voiceKey) {
  const musicSrc = beep(220, 1.2);
  const voiceSrc = beep(440, 0.9);
  const sfxSrc = beep(880, 0.25);
  const loopSrc = beep(110, 0.8);
  const music = { music_title: { src: musicSrc, sec: 1.2, loop: true }, music_grandma: { src: musicSrc, sec: 1.2, loop: true }, music_ending: { src: musicSrc, sec: 1.2, loop: true } };
  for (const station of content.radio) music[`music_${station.id}`] = { src: musicSrc, sec: 1.2, loop: true };

  const sfx = {};
  for (const key of ['sfx_garbage_truck', 'sfx_alert', 'sfx_stamp', 'sfx_success', 'sfx_fail', 'sfx_message', 'sfx_temple_bell', 'sfx_elevator_ding', 'sfx_scooter_start']) sfx[key] = { src: sfxSrc, sec: 0.25, loop: false };
  for (const key of ['sfx_scooter_loop', 'sfx_ev_hum', 'sfx_rain_loop', 'sfx_city_day_loop', 'sfx_night_market_loop']) sfx[key] = { src: loopSrc, sec: 0.8, loop: true };

  const voice = {};
  const titles = content.roles.map((role) => role.title);
  const add = (who, text) => {
    // 主角的句子兩種聲線都配；{role} 代入每一個職稱各算一次。
    const speakers = who === 'player' ? ['player_f', 'player_m'] : [who];
    const texts = String(text).includes('{role}') ? titles.map((title) => String(text).replaceAll('{role}', title)) : [String(text)];
    for (const speaker of speakers) for (const line of texts) voice[voiceKey(speaker, line)] = { src: voiceSrc, sec: 0.9 };
  };
  for (const mission of content.missions) for (const step of mission.steps) if (step.type === 'dialogue') for (const line of step.lines) add(line.who, line.text);
  for (const line of content.story.prologue) add(line.who, line.text);
  for (const item of content.story.interludes) {
    add(item.sincere.who, item.sincere.text);
    add(item.partner.who, item.partner.text);
    add(content.story.cast?.find((member) => member.id === 'grandma')?.npcId || 'grandma', item.grandma.text);
  }
  for (const line of [...(content.story.finale?.withGrandma || []), ...(content.story.finale?.withoutGrandma || [])]) add(line.who, line.text);
  return { music, voice, sfx };
}
