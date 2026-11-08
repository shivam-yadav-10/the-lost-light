const PARTIALS = [
  { harmonic: 1, volume: 0.13, decay: 1.5 },
  { harmonic: 2, volume: 0.04, decay: 0.65 },
  { harmonic: 3, volume: 0.018, decay: 0.35 },
  { harmonic: 4, volume: 0.006, decay: 0.2 },
];

/** Higher harmonics fade first, leaving a warm sustained fundamental after the hammer-like attack. */
export function playPianoTone(context: AudioContext, frequency: number) {
  if (!Number.isFinite(frequency) || frequency <= 0) throw new Error('Invalid piano note frequency.');
  const now = context.currentTime;
  for (const { harmonic, volume, decay } of PARTIALS) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency * harmonic;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(volume * 0.35, now + decay * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    gain.gain.linearRampToValueAtTime(0, now + decay + 0.02);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + decay + 0.03);
  }
}
