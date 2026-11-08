import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playPianoTone } from '../src/services/pianoAudio.ts';
import { PIANO_FREQUENCIES } from '../src/services/piano.ts';

function fixture() {
  const oscillators = [];
  const gains = [];
  const context = {
    currentTime: 10,
    destination: {},
    createOscillator() {
      const node = {
        frequency: { value: 0 }, type: '', ended: false, disconnected: false,
        connect(target) { this.target = target; },
        disconnect() { this.disconnected = true; },
        start(time) { this.startAt = time; },
        stop(time) { this.stopAt = time; },
      };
      oscillators.push(node);
      return node;
    },
    createGain() {
      const events = [];
      const node = {
        disconnected: false,
        gain: {
          setValueAtTime: (value, time) => events.push({ kind: 'set', value, time }),
          linearRampToValueAtTime: (value, time) => events.push({ kind: 'linear', value, time }),
          exponentialRampToValueAtTime: (value, time) => events.push({ kind: 'exponential', value, time }),
        },
        events, connect(target) { this.target = target; },
        disconnect() { this.disconnected = true; },
      };
      gains.push(node);
      return node;
    },
  };
  return { context, oscillators, gains };
}

test('all keys retain their pitch with quiet, faster-decaying harmonics and a smooth bounded envelope', () => {
  for (const frequency of PIANO_FREQUENCIES) {
    const f = fixture();
    playPianoTone(f.context, frequency);
    assert.equal(f.oscillators.length, 4);
    let peak = 0;
    f.oscillators.forEach((oscillator, index) => {
      assert.equal(oscillator.type, 'sine');
      assert.equal(oscillator.frequency.value, frequency * (index + 1));
      assert.equal(oscillator.startAt, 10);
      const gain = f.gains[index];
      assert.equal(oscillator.target, gain);
      assert.equal(gain.target, f.context.destination);
      assert.deepEqual(gain.events[0], { kind: 'set', value: 0, time: 10 });
      assert.equal(gain.events[1].time, 10.008);
      peak += gain.events[1].value;
      assert.equal(gain.events.at(-1).value, 0);
      assert.ok(oscillator.stopAt > gain.events.at(-1).time);
      for (let event = 1; event < gain.events.length; event++) {
        assert.ok(gain.events[event].time > gain.events[event - 1].time);
        if (gain.events[event].kind === 'exponential') assert.ok(gain.events[event].value > 0);
      }
      if (index > 0) {
        assert.ok(oscillator.stopAt < f.oscillators[index - 1].stopAt);
        assert.ok(gain.events[1].value < f.gains[index - 1].events[1].value);
      }
      oscillator.onended();
      assert.equal(oscillator.disconnected, true);
      assert.equal(gain.disconnected, true);
    });
    assert.ok(peak <= 0.2, 'one note stays below the combined peak gain budget');
    assert.ok(f.oscillators[0].stopAt > 11.5, 'fundamental rings longer than the old half-second beep');
  }
});

test('invalid note frequencies fail before creating audio nodes', () => {
  const f = fixture();
  for (const frequency of [0, -1, NaN, Infinity]) assert.throws(() => playPianoTone(f.context, frequency), /Invalid/);
  assert.equal(f.oscillators.length, 0);
});
