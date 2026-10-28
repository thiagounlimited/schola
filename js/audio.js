// Motor de som do SCHOLA: cordas dedilhadas, sinos e uma trilha ambiente "wellness".
// Tudo é sintetizado com Web Audio — nenhum arquivo de áudio é carregado.

// Escala pentatônica de Dó (C3 → C6): qualquer combinação soa consonante.
const PENTA = [0, 2, 4, 7, 9];
export const SCALE = [];
for (let oct = 0; oct < 3; oct++) for (const s of PENTA) SCALE.push(48 + oct * 12 + s);
SCALE.push(84);
export const noteFreq = (i) => 440 * 2 ** ((SCALE[Math.max(0, Math.min(SCALE.length - 1, i))] - 69) / 12);

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.soundOn = true;
    this.musicOn = true;
  }

  // Precisa ser chamado dentro de um gesto do usuário (toque/clique).
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.bus = ctx.createGain();
    this.bus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.38;
    this.bus.connect(this.reverb).connect(wet).connect(this.master);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend?.(); else ctx.resume?.();
    });
    if (this.musicOn) this._startPad();
  }

  setSound(on) { this.soundOn = on; }
  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    if (on) this._startPad(); else this._stopPad();
  }

  _impulse(seconds) {
    const { ctx } = this;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    return buf;
  }

  _out(pan) {
    const { ctx } = this;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      p.connect(this.bus);
      return p;
    }
    return this.bus;
  }

  get ready() { return this.ctx && this.soundOn; }

  // Corda dedilhada: triângulo + harmônico com filtro que fecha (som de elástico).
  pluck(freq, vel = 0.7, pan = 0, dur = 1.8) {
    if (!this.ready) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const out = this._out(pan);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3 * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(Math.min(16000, freq * (6 + vel * 8)), t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.4, t + dur * 0.7);
    g.connect(f).connect(out);

    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.setValueAtTime(freq * 1.012, t);
    o1.frequency.exponentialRampToValueAtTime(freq, t + 0.08); // leve "boing" do elástico
    o1.connect(g);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.003;
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    o2.connect(g2).connect(g);
    for (const o of [o1, o2]) { o.start(t); o.stop(t + dur + 0.05); }
  }

  // Sino suave (parciais inarmônicas) para flores que desabrocham.
  chime(freq, vel = 0.5, pan = 0) {
    if (!this.ready) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const out = this._out(pan);
    [[1, 1, 2.2], [2.76, 0.35, 1.2], [5.4, 0.12, 0.6]].forEach(([mul, amp, dur]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16 * vel * amp, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }

  // "Hmm" gentil para ações que não valem — nunca punitivo.
  nope() {
    if (!this.ready) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    [196, 185].forEach((fr, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = fr;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.35);
      o.connect(g).connect(this.bus);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.4);
    });
  }

  pop(pan = 0) {
    if (!this.ready) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f).connect(g).connect(this._out(pan));
    src.start(t);
  }

  tick() {
    if (!this.ready) return;
    this.pluck(noteFreq(12), 0.25, 0, 0.25);
  }

  // Arpejo ascendente de vitória.
  arpeggio(start = 5) {
    if (!this.ready) return;
    [0, 2, 4, 5, 7].forEach((step, i) => {
      setTimeout(() => this.chime(noteFreq(start + step), 0.7, (i - 2) * 0.3), i * 110);
    });
  }

  // Camada de "Fluxo": brilho harmônico que cresce com o foco contínuo (0–1).
  setFlow(v) {
    if (!this.ctx) return;
    const level = this.musicOn ? Math.max(0, Math.min(1, v)) : 0;
    if (!this.flow) {
      if (level <= 0) return;
      const { ctx } = this;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      const trem = ctx.createGain();
      trem.gain.value = 0.7;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.35;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.3;
      lfo.connect(lfoGain).connect(trem.gain);
      trem.connect(g).connect(this.bus);
      const oscs = [noteFreq(7), noteFreq(10), noteFreq(12), noteFreq(14)].map((fr, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = fr;
        o.detune.value = (i - 1.5) * 3;
        const og = ctx.createGain();
        og.gain.value = [0.5, 0.35, 0.25, 0.15][i];
        o.connect(og).connect(trem);
        o.start();
        return o;
      });
      lfo.start();
      this.flow = { g, oscs: [...oscs, lfo] };
    }
    this.flow.g.gain.setTargetAtTime(0.0001 + 0.05 * level, this.ctx.currentTime, 0.6);
  }

  // Trilha ambiente "wellness": acordes longos e quentes que mudam a cada respiração (10 s,
  // ~6 respirações por minuto, o ritmo da respiração de coerência), um mar de ruído suave
  // que sobe e desce no mesmo compasso e notas de kalimba esparsas. Tudo em Dó maior, para
  // os efeitos dos jogos (pentatônica) sempre soarem consonantes.
  _startPad() {
    if (this.pad || !this.ctx) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(1, t + 6);
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 1800;
    out.connect(warm).connect(this.bus);

    // Mar: ruído rosado filtrado, com volume que "respira".
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
      d[i] = (b0 + b1 + b2) * 0.35;
    }
    const sea = ctx.createBufferSource();
    sea.buffer = buf;
    sea.loop = true;
    const seaF = ctx.createBiquadFilter();
    seaF.type = 'bandpass';
    seaF.frequency.value = 420;
    seaF.Q.value = 0.6;
    const seaG = ctx.createGain();
    seaG.gain.value = 0.018;
    const breath = ctx.createOscillator();
    breath.frequency.value = 0.1;
    const breathG = ctx.createGain();
    breathG.gain.value = 0.014;
    breath.connect(breathG).connect(seaG.gain);
    sea.connect(seaF).connect(seaG).connect(out);
    sea.start(t);
    breath.start(t);

    const CHORDS = [
      [48, 55, 64, 71, 74], // Cmaj9
      [45, 52, 60, 67, 71], // Am9
      [41, 48, 57, 64, 67], // Fmaj9
      [43, 50, 57, 62, 64], // G6/9
    ];
    const BELLS = [72, 74, 76, 79, 81, 84, 86, 88];
    const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
    const BAR = 10;
    let k = 0;
    const playChord = () => {
      if (!this.pad || ctx.state !== 'running') return; // aba escondida: não acumula acordes
      const now = ctx.currentTime;
      CHORDS[k++ % CHORDS.length].forEach((m, i) => {
        const g = ctx.createGain();
        const peak = [0.03, 0.022, 0.016, 0.011, 0.008][i];
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(peak, now + 4);
        g.gain.setValueAtTime(peak, now + BAR - 1);
        g.gain.linearRampToValueAtTime(0.0001, now + BAR + 4);
        g.connect(out);
        [['sine', 0], ['triangle', 6]].forEach(([type, det]) => {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = mtof(m);
          o.detune.value = det * (i % 2 ? 1 : -1);
          const og = ctx.createGain();
          og.gain.value = type === 'sine' ? 1 : 0.35;
          o.connect(og).connect(g);
          o.start(now);
          o.stop(now + BAR + 4.2);
        });
      });
      // Duas ou três notas de kalimba espalhadas no compasso.
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const at = now + 1.5 + Math.random() * (BAR - 3);
        const fr = mtof(BELLS[Math.floor(Math.random() * BELLS.length)]);
        [[1, 0.022, 3.2], [3.98, 0.004, 0.6]].forEach(([mul, amp, dur]) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = fr * mul;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, at);
          g.gain.linearRampToValueAtTime(amp, at + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
          o.connect(g).connect(out);
          o.start(at);
          o.stop(at + dur + 0.05);
        });
      }
    };
    this.pad = { g: out, oscs: [sea, breath], timer: setInterval(playChord, BAR * 1000) };
    playChord();
  }

  _stopPad() {
    if (!this.pad) return;
    const { g, oscs, timer } = this.pad;
    clearInterval(timer);
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.5);
    oscs.forEach((o) => o.stop(t + 1.6));
    setTimeout(() => g.disconnect(), 6000);
    this.pad = null;
  }
}
