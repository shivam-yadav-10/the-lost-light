import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjustPlacement, alignmentProof, cardsAligned, parseMemberIds, parseOverlayCard, overlayKeyAction } from '../src/services/convergenceOverlay.ts';

test('focused overlay shortcuts rotate with Ctrl+R and reverse with Ctrl+Shift+R', () => {
  const event = { key: 'r', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false };
  assert.deepEqual(overlayKeyAction(event), { x: 0, y: 0, rotation: 90 });
  assert.deepEqual(overlayKeyAction({ ...event, key: 'R', shiftKey: true }), { x: 0, y: 0, rotation: -90 });
  assert.deepEqual(overlayKeyAction({ ...event, ctrlKey: false }), { x: 0, y: 0, rotation: 90 });
  assert.deepEqual(overlayKeyAction({ ...event, key: 'ArrowLeft' }), { x: -1, y: 0, rotation: 0 });
  for (const patch of [{ altKey: true }, { metaKey: true }, { key: 'Tab' }, { key: 'Enter' }]) {
    assert.equal(overlayKeyAction({ ...event, ...patch }), null);
  }
});

test('drag snapping, keyboard/button steps and quarter-turns can solve both initial partner placements', () => {
  const first = { teamId: 'b', x: 3, y: 2, rotation: 90 };
  const second = { teamId: 'c', x: -3, y: -2, rotation: 270 };
  const snapped = adjustPlacement(first, { x: .2, y: -.2, rotation: first.rotation - 90 });
  assert.equal(cardsAligned([snapped], ['b']), true);
  let stepped = second;
  for (let step = 0; step < 3; step++) stepped = adjustPlacement(stepped, { x: stepped.x + 1 });
  for (let step = 0; step < 2; step++) stepped = adjustPlacement(stepped, { y: stepped.y + 1 });
  stepped = adjustPlacement(stepped, { rotation: stepped.rotation + 90 });
  assert.equal(cardsAligned([snapped, stepped], ['b', 'c']), true);
  assert.deepEqual(adjustPlacement(first, { x: 100, y: -100, rotation: -90 }),
    { teamId: 'b', x: 8, y: -8, rotation: 270 });
});

test('card parser rejects invalid dimensions, duplicates, empty cards, and out-of-range pixels', () => {
  const card = { width: 31, height: 9, lit: [0, 31, 278] };
  assert.deepEqual(parseOverlayCard(card), card);
  for (const value of [null, {}, { ...card, width: 30 }, { ...card, lit: [] },
    { ...card, lit: [0, 0] }, { ...card, lit: [-1] }, { ...card, lit: [279] },
    { ...card, lit: [0.5] }]) assert.throws(() => parseOverlayCard(value));
});

test('member parser requires a mutual-size circle containing own team exactly once', () => {
  assert.deepEqual(parseMemberIds(['a', 'b'], 'a'), ['a', 'b']);
  assert.deepEqual(parseMemberIds(['a', 'b', 'c'], 'b'), ['a', 'b', 'c']);
  for (const value of [[], ['a'], ['a', 'a'], ['b', 'c'], ['a', 'b', 'c', 'd'], ['a', 2], ['a', '']]) {
    assert.throws(() => parseMemberIds(value, 'a'));
  }
});

test('pair and triple alignment require every partner, zero translation and complete turns', () => {
  const b = { teamId: 'b', x: 0, y: 0, rotation: 0 };
  const c = { teamId: 'c', x: 0, y: 0, rotation: 360 };
  assert.equal(cardsAligned([b], ['b']), true);
  assert.equal(cardsAligned([b, c], ['b', 'c']), true);
  for (const placements of [[], [b], [b, b], [b, { ...c, x: 1 }], [b, { ...c, y: -1 }],
    [b, { ...c, rotation: 90 }], [b, { ...c, rotation: 180 }], [b, { ...c, rotation: 0.1 }],
    [b, { ...c, teamId: 'outsider' }], [b, { ...c, x: null }]]) {
    assert.equal(cardsAligned(placements, ['b', 'c']), false);
    assert.throws(() => alignmentProof(JSON.stringify(placements), ['a', 'b', 'c'], 'a'));
  }
});
