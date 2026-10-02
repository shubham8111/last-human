// All sound is synthesized with WebAudio, so the game ships with zero audio files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = {};
    this.musicOn = false;
    this.musicTimer = null;
  }

  // Browsers only allow audio after a user gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.22;
    this.music.connect(this.master);

    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  // Rate-limit a sound so 100 soldiers firing doesn't become white noise.
  gate(name, minGap) {
    if (!this.ctx || this.muted) return false;
    const t = this.ctx.currentTime;
    if (this.last[name] && t - this.last[name] < minGap) return false;
    this.last[name] = t;
    return true;
  }

  noiseBurst({ dur = 0.1, freq = 1200, q = 1, type = 'bandpass', vol = 0.3, attack = 0.002, out } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out || this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return f;
  }

  tone({ freq = 440, to = null, dur = 0.2, type = 'square', vol = 0.15, delay = 0, out } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  shot(flame) {
    if (!this.gate('shot', flame ? 0.07 : 0.055)) return;
    if (flame) {
      this.noiseBurst({ dur: 0.18, freq: 500, q: 0.6, type: 'lowpass', vol: 0.16, attack: 0.03 });
    } else {
      this.noiseBurst({ dur: 0.07, freq: 2400 + Math.random() * 800, q: 1.2, vol: 0.14 });
      this.tone({ freq: 180, to: 60, dur: 0.06, type: 'triangle', vol: 0.08 });
    }
  }

  hit() {
    if (!this.gate('hit', 0.04)) return;
    this.noiseBurst({ dur: 0.05, freq: 900, q: 2, vol: 0.08 });
  }

  zombieDie() {
    if (!this.gate('zdie', 0.06)) return;
    this.tone({ freq: 140 + Math.random() * 60, to: 50, dur: 0.22, type: 'sawtooth', vol: 0.07 });
    this.noiseBurst({ dur: 0.12, freq: 400, q: 1, type: 'lowpass', vol: 0.12 });
  }

  soldierDown() {
    if (!this.gate('sdown', 0.05)) return;
    this.tone({ freq: 520, to: 180, dur: 0.15, type: 'square', vol: 0.06 });
  }

  explosion() {
    if (!this.gate('boom', 0.08)) return;
    this.noiseBurst({ dur: 0.9, freq: 300, q: 0.7, type: 'lowpass', vol: 0.7, attack: 0.005 });
    this.tone({ freq: 90, to: 30, dur: 0.6, type: 'sine', vol: 0.5 });
  }

  gateGood() {
    if (!this.gate('gate', 0.1)) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.12, delay: i * 0.05 }));
  }

  gateBad() {
    if (!this.gate('gate', 0.1)) return;
    [392, 311, 233].forEach((f, i) => this.tone({ freq: f, dur: 0.22, type: 'sawtooth', vol: 0.08, delay: i * 0.07 }));
  }

  gunUp() {
    if (!this.gate('gunup', 0.2)) return;
    this.tone({ freq: 220, to: 880, dur: 0.25, type: 'sawtooth', vol: 0.12 });
    [659, 880, 1319].forEach((f, i) => this.tone({ freq: f, dur: 0.25, type: 'square', vol: 0.07, delay: 0.12 + i * 0.07 }));
    this.noiseBurst({ dur: 0.3, freq: 3000, q: 0.5, type: 'highpass', vol: 0.12 });
  }

  gateTick() {
    if (!this.gate('gtick', 0.05)) return;
    this.tone({ freq: 1400 + Math.random() * 300, dur: 0.05, type: 'sine', vol: 0.05 });
  }

  coin() {
    if (!this.gate('coin', 0.04)) return;
    this.tone({ freq: 1320, dur: 0.06, type: 'square', vol: 0.04 });
    this.tone({ freq: 1760, dur: 0.1, type: 'square', vol: 0.04, delay: 0.05 });
  }

  bossRoar() {
    if (!this.gate('roar', 0.5)) return;
    this.tone({ freq: 110, to: 55, dur: 1.4, type: 'sawtooth', vol: 0.3 });
    this.tone({ freq: 116, to: 52, dur: 1.4, type: 'sawtooth', vol: 0.25 });
    this.noiseBurst({ dur: 1.3, freq: 350, q: 0.8, type: 'lowpass', vol: 0.35, attack: 0.2 });
  }

  warn() {
    if (!this.gate('warn', 0.3)) return;
    this.tone({ freq: 880, dur: 0.12, type: 'square', vol: 0.07 });
    this.tone({ freq: 880, dur: 0.12, type: 'square', vol: 0.07, delay: 0.18 });
  }

  click() {
    if (!this.ctx || this.muted) return;
    this.tone({ freq: 900, to: 1200, dur: 0.06, type: 'triangle', vol: 0.12 });
  }

  win() {
    if (!this.ctx || this.muted) return;
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.15, delay: i * 0.12 }),
    );
  }

  lose() {
    if (!this.ctx || this.muted) return;
    [392, 370, 349, 262].forEach((f, i) => this.tone({ freq: f, dur: 0.5, type: 'sawtooth', vol: 0.1, delay: i * 0.25 }));
  }

  // A tense, minimal drum + bass loop scheduled ahead in small batches.
  startMusic(intense = false) {
    if (!this.ctx) return;
    this.intense = intense;
    if (this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    const bass = [55, 55, 65.4, 55, 49, 49, 58.3, 49];
    const tick = () => {
      if (!this.musicOn) return;
      const spb = this.intense ? 0.14 : 0.18; // seconds per 16th
      while (this.nextTime < this.ctx.currentTime + 0.3) {
        const s = this.step % 16;
        const t0 = this.nextTime - this.ctx.currentTime;
        if (s % 4 === 0) this.kick(t0);
        if (s % 8 === 4) this.snare(t0);
        if (s % 2 === 1 && this.intense) this.hat(t0);
        if (s % 2 === 0) {
          const f = bass[Math.floor(this.step / 4) % bass.length];
          this.tone({ freq: f, dur: spb * 1.8, type: 'sawtooth', vol: 0.18, delay: t0, out: this.music });
        }
        this.step++;
        this.nextTime += spb;
      }
      this.musicTimer = setTimeout(tick, 80);
    };
    tick();
  }

  stopMusic() {
    this.musicOn = false;
    clearTimeout(this.musicTimer);
  }

  kick(delay) {
    this.tone({ freq: 140, to: 40, dur: 0.25, type: 'sine', vol: 0.6, delay, out: this.music });
  }

  snare(delay) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1500;
    const g = c.createGain();
    const t = c.currentTime + delay;
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.connect(f).connect(g).connect(this.music);
    src.start(t);
    src.stop(t + 0.2);
  }

  hat(delay) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = c.createGain();
    const t = c.currentTime + delay;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(f).connect(g).connect(this.music);
    src.start(t);
    src.stop(t + 0.06);
  }
}
