/**
 * Winning fanfare, synthesized live with the Web Audio API (no audio files):
 * brass "da-da-da DAAA!" + cymbal crash + sparkle chimes.
 */

const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

export class Fanfare {
  private ctx = new AudioContext()
  private out: GainNode
  private noise: AudioBuffer

  constructor() {
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 4
    this.out = this.ctx.createGain()
    this.out.gain.value = 0.75
    this.out.connect(comp).connect(this.ctx.destination)
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 3, this.ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }

  /** Plays the fanfare. Resolves false if the browser blocks sound (no click on the page yet). */
  async play(): Promise<boolean> {
    await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 300))])
    if (this.ctx.state !== 'running') return false
    this.schedule(this.ctx.currentTime + 0.05)
    return true
  }

  close() {
    const now = this.ctx.currentTime
    this.out.gain.cancelScheduledValues(now)
    this.out.gain.setValueAtTime(this.out.gain.value, now)
    this.out.gain.linearRampToValueAtTime(0, now + 0.3)
    const ctx = this.ctx
    window.setTimeout(() => ctx.close(), 400)
  }

  private brass(note: number, start: number, dur: number, vol: number) {
    const ctx = this.ctx
    const g = ctx.createGain()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(500, start)
    lp.frequency.linearRampToValueAtTime(3200, start + 0.06)
    lp.frequency.linearRampToValueAtTime(1800, start + 0.3)
    g.gain.setValueAtTime(0, start)
    g.gain.linearRampToValueAtTime(vol, start + 0.03)
    g.gain.setValueAtTime(vol, start + dur * 0.8)
    g.gain.linearRampToValueAtTime(0, start + dur)
    for (const cents of [-6, 6]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = hz(note)
      o.detune.value = cents
      if (dur > 0.5) {
        // vibrato blooms on held notes
        const lfo = ctx.createOscillator()
        const depth = ctx.createGain()
        lfo.frequency.value = 5.5
        depth.gain.setValueAtTime(0, start)
        depth.gain.linearRampToValueAtTime(12, start + 0.6)
        lfo.connect(depth).connect(o.detune)
        lfo.start(start)
        lfo.stop(start + dur)
      }
      o.connect(lp)
      o.start(start)
      o.stop(start + dur + 0.05)
    }
    lp.connect(g).connect(this.out)
  }

  private schedule(at: number) {
    const ctx = this.ctx
    // da-da-da DAAAA! ... ta-ta TAAA!
    const T = 0.13
    const hit = at + 3 * T
    ;[67, 67, 67].forEach((n, i) => this.brass(n, at + i * T, T * 0.85, 0.09))
    ;[60, 67, 72, 76, 79].forEach((n) => this.brass(n, hit, 1.8, 0.07))
    ;[77, 81, 84].forEach((n) => this.brass(n, hit + 1.9, 0.18, 0.05))
    ;[79, 83, 86].forEach((n) => this.brass(n, hit + 2.1, 0.18, 0.05))
    ;[72, 76, 79, 84].forEach((n) => this.brass(n, hit + 2.3, 1.4, 0.06))

    // cymbal crashes on the big chords
    for (const [t, len, vol] of [
      [hit, 2.2, 0.35],
      [hit + 2.3, 1.8, 0.25],
    ]) {
      const crash = ctx.createBufferSource()
      crash.buffer = this.noise
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 5000
      const cg = ctx.createGain()
      cg.gain.setValueAtTime(vol, t)
      cg.gain.exponentialRampToValueAtTime(0.001, t + len)
      crash.connect(hp).connect(cg).connect(this.out)
      crash.start(t)
      crash.stop(t + len + 0.1)
    }

    // sparkle chimes
    ;[84, 88, 91, 96, 100, 103, 108].forEach((n, i) => {
      const s = at + 0.5 + i * 0.06
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = hz(n)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.07, s)
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.7)
      const p = ctx.createStereoPanner()
      p.pan.value = i % 2 ? 0.5 : -0.5
      o.connect(g).connect(p).connect(this.out)
      o.start(s)
      o.stop(s + 0.75)
    })
  }
}
