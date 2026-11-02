/**
 * Ambient sound for the opening story, generated in the browser with the Web Audio API
 * (no audio files). A soft triangle-wave pad underlies the spoken narration, with gentle
 * chime accents on key beats. Every method is safe to call when audio is unavailable;
 * sound is a bonus, never a requirement.
 */

const MASTER_VOLUME = 0.2;

// Bhupali / major pentatonic around C5, used for the chime accents.
export const CHIME_NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

type AudioContextCtor = typeof AudioContext;

export class TeaserAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padGain: GainNode | null = null;
  private padNodes: AudioScheduledSourceNode[] = [];
  private muted = false;

  /** Creates the audio context. Call from a click handler so the browser allows playback. */
  start(): void {
    if (this.ctx) return;
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
      void this.ctx.resume().catch(() => undefined);
    } catch (err) {
      console.warn('Story audio unavailable:', err);
      this.ctx = null;
      this.master = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.15);
  }

  /** Fades in a soft pad. Calling again while it plays just changes its level. */
  drone(level = 1, fadeSeconds = 3): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    if (!this.padGain) this.buildPad(ctx, master);
    this.rampPad(0.4 * level, fadeSeconds);
  }

  /** Fades the pad to silence. */
  droneOut(fadeSeconds = 2.5): void {
    this.rampPad(0, fadeSeconds);
  }

  /** A soft, rounded chime accent — a couple of gentle partials with a slow, warm decay. */
  chime(frequency: number, volume = 0.3, delaySeconds = 0): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delaySeconds;
    const warmth = ctx.createBiquadFilter();
    warmth.type = 'lowpass';
    warmth.frequency.value = 2200;
    warmth.Q.value = 0.4;
    warmth.connect(master);
    const partials = [
      { ratio: 1, amp: 1, decay: 3.4 },
      { ratio: 2.01, amp: 0.16, decay: 1.8 },
    ];
    for (const p of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency * p.ratio;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume * p.amp, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);
      osc.connect(gain).connect(warmth);
      osc.start(t);
      osc.stop(t + p.decay + 0.1);
    }
  }

  /** A few slow, soft chimes, like sparks drifting apart — not a jingle, a sigh. */
  scatter(): void {
    CHIME_NOTES.slice(0, 4).forEach((note, i) => this.chime(note, 0.05, i * 0.22));
  }

  /** The closing swell: the pad returns fuller and a soft, slow chord rings out. */
  swell(): void {
    this.drone(1.2, 3.5);
    [CHIME_NOTES[0] / 2, CHIME_NOTES[2], CHIME_NOTES[3]].forEach((note, i) => this.chime(note, 0.12, 0.4 + i * 0.3));
  }

  /** Fades everything out and releases the audio device. */
  stop(fadeSeconds = 0.6): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeSeconds);
    this.ctx = null;
    this.master = null;
    this.padGain = null;
    const nodes = this.padNodes;
    this.padNodes = [];
    window.setTimeout(() => {
      for (const node of nodes) {
        try {
          node.stop();
        } catch {
          // Already stopped; nothing to release.
        }
      }
      void ctx.close().catch(() => undefined);
    }, fadeSeconds * 1000 + 100);
  }

  private rampPad(target: number, fadeSeconds: number): void {
    const { ctx, padGain } = this;
    if (!ctx || !padGain) return;
    const gain = padGain.gain;
    gain.cancelScheduledValues(ctx.currentTime);
    gain.setValueAtTime(gain.value, ctx.currentTime);
    gain.linearRampToValueAtTime(target, ctx.currentTime + fadeSeconds);
  }

  /**
   * A quiet triangle-wave pad (much softer than a sawtooth): a close, slightly detuned pair
   * an octave apart plus a fifth above, rounded off with a gentle low-pass. A very slow
   * tremolo lets it "breathe" without any buzz or edge.
   */
  private buildPad(ctx: AudioContext, master: GainNode): void {
    const padGain = ctx.createGain();
    padGain.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.3;

    // Slow amplitude "breathing" instead of a filter sweep — reads as calm, not wobbly.
    const tremolo = ctx.createGain();
    tremolo.gain.value = 1;
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoDepth.gain.value = 0.12;
    lfo.connect(lfoDepth).connect(tremolo.gain);
    lfo.start();
    this.padNodes.push(lfo);

    const voices = [
      { freq: 130.81, amp: 0.3 },
      { freq: 131.3, amp: 0.22 },
      { freq: 196.0, amp: 0.14 },
      { freq: 261.63, amp: 0.1 },
    ];
    for (const v of voices) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = v.freq;
      gain.gain.value = v.amp * 0.3;
      osc.connect(gain).connect(filter);
      osc.start();
      this.padNodes.push(osc);
    }
    filter.connect(tremolo).connect(padGain).connect(master);
    this.padGain = padGain;
  }
}
