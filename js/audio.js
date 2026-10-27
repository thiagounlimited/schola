// Motor de som do SCHOLA: cordas dedilhadas, sinos e um pad ambiente suave.
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

  _startPad() {
    if (this.pad || !this.ctx) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 520;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(f.frequency);
    g.connect(f).connect(this.bus);
    const oscs = [65.41, 98.0, 130.81, 196.0].map((fr, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'sine' : 'triangle';
      o.frequency.value = fr;
      o.detune.value = (i - 1.5) * 4;
      const og = ctx.createGain();
      og.gain.value = [0.5, 0.35, 0.25, 0.12][i];
      o.connect(og).connect(g);
      o.start();
      return o;
    });
    lfo.start();
    this.pad = { g, oscs: [...oscs, lfo] };
  }

  _stopPad() {
    if (!this.pad) return;
    const { g, oscs } = this.pad;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.2);
    oscs.forEach((o) => o.stop(t + 1.3));
    this.pad = null;
  }
}
