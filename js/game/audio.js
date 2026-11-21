// 合成提示音：用 Web Audio 現場合成的短音，不需要任何音檔。
// 有音檔時 sound.js 會播音檔；音檔缺的時候（或還沒載到）退回這裡的合成音。
// 過場的六種打斷各有一個聲音：垃圾車的旋律、警報、雷聲、宣傳車喇叭、來電鈴聲、訊息提示音。

const PATTERNS = {
  select: [{ f: 620, t: 0, d: 0.06, type: 'square' }],
  right: [
    { f: 660, t: 0, d: 0.09, type: 'triangle' },
    { f: 990, t: 0.09, d: 0.14, type: 'triangle' },
  ],
  wrong: [
    { f: 230, t: 0, d: 0.12, type: 'sawtooth' },
    { f: 170, t: 0.12, d: 0.18, type: 'sawtooth' },
  ],
  clear: [
    { f: 523, t: 0, d: 0.1, type: 'square' },
    { f: 659, t: 0.1, d: 0.1, type: 'square' },
    { f: 784, t: 0.2, d: 0.1, type: 'square' },
    { f: 1047, t: 0.3, d: 0.26, type: 'square' },
  ],
  stamp: [{ f: 110, t: 0, d: 0.12, type: 'square' }],
  message: [
    { f: 880, t: 0, d: 0.07, type: 'sine' },
    { f: 1175, t: 0.08, d: 0.12, type: 'sine' },
  ],
  // 垃圾車：用方波彈幾個音的小旋律（公版古典曲的開頭動機）
  // 垃圾車：〈少女的祈禱〉（Bądarzewska，1856，公有領域）開頭「5 1 3 5 1 3— 2 2 1 1 7 6 6」，E♭ 大調
  garbage_truck: [[466, 0, 0.17], [622, 0.24, 0.17], [784, 0.48, 0.17], [932, 0.72, 0.17], [1245, 0.96, 0.17], [1568, 1.2, 0.68],
    [1397, 1.9, 0.28], [1397, 2.25, 0.42], [1245, 2.8, 0.14], [1245, 2.98, 0.18], [1175, 3.24, 0.17], [1047, 3.48, 0.17], [1047, 3.72, 0.55]]
    .map(([f, t, d]) => ({ f: f / 2, t, d, type: 'square', g: 0.05 })),
  // 警報：兩個音高交替的刺耳長音
  alert: [0, 1, 2, 3, 4, 5].map((i) => ({ f: i % 2 ? 960 : 853, t: i * 0.25, d: 0.24, type: 'sawtooth', g: 0.06 })),
  // 宣傳車：喇叭的破音感，兩句上揚的語調
  campaign_truck: [
    { f: 300, to: 420, t: 0, d: 0.28, type: 'sawtooth', g: 0.06 },
    { f: 300, to: 420, t: 0.34, d: 0.28, type: 'sawtooth', g: 0.06 },
    { f: 360, to: 250, t: 0.72, d: 0.4, type: 'sawtooth', g: 0.06 },
  ],
  // 來電：兩聲一組的鈴聲
  delivery_call: [0, 0.16, 0.7, 0.86].map((t) => ({ f: 1320, t, d: 0.12, type: 'sine', g: 0.07 })),
  // 主管訊息：比一般訊息低沉、短促的一聲
  boss_line: [
    { f: 740, t: 0, d: 0.06, type: 'triangle', g: 0.08 },
    { f: 554, t: 0.07, d: 0.16, type: 'triangle', g: 0.08 },
  ],
};

/** 雷聲：低通濾過的雜訊，先一聲炸開再拖長滾過。 */
function thunder(audio, out, start) {
  const seconds = 1.6;
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * seconds), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, start);
  filter.frequency.exponentialRampToValueAtTime(90, start + seconds);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.28, start + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.08, start + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  source.connect(filter).connect(gain).connect(out);
  source.start(start);
  source.stop(start + seconds);
}

export const canSynth = (name) => name === 'thunder' || name in PATTERNS;

/** 在 audio（AudioContext）上合成一個提示音，接到 out。沒有這個名字就回傳 false。 */
export function synth(audio, out, name) {
  if (!audio || audio.state !== 'running') return false;
  const start = audio.currentTime + 0.01;
  if (name === 'thunder') {
    thunder(audio, out, start);
    return true;
  }
  const pattern = PATTERNS[name];
  if (!pattern) return false;
  for (const note of pattern) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const peak = note.g || 0.07;
    osc.type = note.type;
    osc.frequency.setValueAtTime(note.f, start + note.t);
    if (note.to) osc.frequency.linearRampToValueAtTime(note.to, start + note.t + note.d);
    gain.gain.setValueAtTime(0.0001, start + note.t);
    gain.gain.exponentialRampToValueAtTime(peak, start + note.t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.t + note.d);
    osc.connect(gain).connect(out);
    osc.start(start + note.t);
    osc.stop(start + note.t + note.d + 0.02);
  }
  return true;
}
