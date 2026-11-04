import type { CheckpointContent, ErrandGroup, ProtectedPuzzle, RateLimit, ShardContent } from './types.js';
import { WORD_PUZZLE_POSTERS } from './public.js';

export const WORD_PUZZLE_ANSWERS: Record<string, string[]> = {
  W1: ['Cow', 'Apple', 'Farm', 'Sun', 'Pick', 'Barn'],
  W2: ['Color', 'Tarp', 'Bucket', 'Paint', 'Roller', 'Brush'],
  W3: ['Mittens', 'Boot', 'Chill', 'Sled', 'Frost', 'Snow'],
  W4: ['Cheese', 'Hungry', 'Music', 'Red', 'Party', 'Yummy'],
  W5: ['Score', 'Basket', 'Dunk', 'Net', 'Chops', 'Court'],
  W6: ['Windy', 'Winter', 'White', 'Whistle', 'Wood', 'Wool'],
  W7: ['Hot', 'Fish', 'Boy', 'Tree', 'Wave', 'Nice'],
  W8: ['Friends', 'Balloon', 'Gift', 'Cake', 'Game', 'Party'],
  W9: ['Mirror', 'Straw', 'Couch', 'Tiles', 'Cat', 'Cord'],
};

/**
 * PROTECTED content. Answers, aliases, hints, fragment metadata, physical codes and shard rules.
 * Backend-only: never import this from anything that is sent to the browser.
 * Full design rationale: docs/puzzle-design.md
 */

const MIN = 60_000;

const CORE_LIMIT: RateLimit = { cooldownMs: 3_000, maxWrong: 8, windowMs: 10 * MIN, lockoutMs: 5 * MIN };
const CONVERGENCE_LIMIT: RateLimit = { cooldownMs: 30_000, maxWrong: 5, windowMs: 15 * MIN, lockoutMs: 10 * MIN };
const VAULT_LIMIT: RateLimit = { cooldownMs: 60_000, maxWrong: 5, windowMs: 30 * MIN, lockoutMs: 15 * MIN };

const corePenalties = (a: string, b: string, c: string) => [
  { text: a, penaltyMinutes: 5 },
  { text: b, penaltyMinutes: 10 },
  { text: c, penaltyMinutes: 15 },
];

/**
 * V. The Five Dawns: each team gets one of six riddle sets (clues in public.ts, FIVE_DAWNS_RIDDLES).
 * `lines` are the five answers (spaces removed); the marked letters spell `final`.
 */
export const FIVE_DAWNS_SETS: { group: string; final: string; lines: string[] }[] = [
  { group: 'V1', final: 'TRUTH', lines: ['DHANTERAS', 'NARAKASURA', 'KUBERA', 'ANNAKUT', 'BHAIDOOJ'] },
  { group: 'V2', final: 'NADIR', lines: ['DHANVANTARI', 'KALI', 'AYODHYA', 'INDRA', 'SUBHADRA'] },
  { group: 'V3', final: 'MANGO', lines: ['BROOM', 'UBTAN', 'GANESHA', 'GOVARDHAN', 'BHAIDOOJ'] },
  { group: 'V4', final: 'AARTI', lines: ['YAMA', 'SATYABHAMA', 'RANGOLI', 'ANNAKUT', 'TILAK'] },
  { group: 'V5', final: 'HALWA', lines: ['DHANTERAS', 'KALI', 'LAKSHMI', 'PADWA', 'YAMA'] },
  { group: 'V6', final: 'GRAIN', lines: ['GOLD', 'NARAKASURA', 'AMAVASYA', 'BALI', 'YAMUNA'] },
];

/** Spreads teams evenly across a puzzle's variant groups by team id (keys are sorted, so A/B/C and V1–V6 cycle). */
export function variantKey(teamId: number, keys: string[]): string {
  const sorted = [...keys].sort();
  return sorted[(((teamId - 1) % sorted.length) + sorted.length) % sorted.length];
}

export const PROTECTED_PUZZLES: ProtectedPuzzle[] = [
  {
    id: 1,
    answers: ['ember', 'an ember', 'embers'],
    nearMisses: [
      { answers: ['rebme'], message: 'The right letters, read the wrong way. Go from left to right.' },
    ],
    incorrectMessage: 'Not quite. Look again; the flames are small, and some hide in unlikely places.',
    completionMessage:
      'Five little flames, found and gathered. A small orange glow returns to the street. Keep this fragment safe: its details will matter.',
    hints: corePenalties(
      'Use the magnifier. The lit lamps are tiny. Look on rooftops, in the stalls, even up in the sky.',
      'Ignore every unlit diya. There are exactly five lamps with a flame.',
      'The leftmost lit lamp sits on a rooftop; another hides among the fireworks. Read all five from left to right.',
    ),
    rateLimit: CORE_LIMIT,
    fragment: { symbol: 'star', number: 2, direction: 'NE', keyword: 'CHALK', colour: 'Orange' },
  },
  {
    id: 2,
    answers: [], // team-specific: see answersByGroup
    answersByGroup: {
      A: ['GLOW-7K4M'],
      B: ['GLOW-2P9X'],
      C: ['GLOW-5T3R'],
      D: ['GLOW-8N6V'],
      E: ['GLOW-4H7Q'],
      F: ['GLOW-9W2S'],
    },
    otherGroupMessage: "That card belongs to another team's errand. Your light is waiting somewhere else.",
    nearMisses: [],
    incorrectMessage: 'That is not the code on your card. Check the riddle again and look closely around the place it describes.',
    completionMessage: 'Errand done. A violet light stirs in the places you pass every day.',
    hints: corePenalties(
      'Your riddle points to a familiar office place or object. Think about what happens there.',
      'It may describe coffee, printed pages, drinking water, meals, a three-wheeled ride in Phase 2, or welcoming visitors.',
      'Look for a small diya card at the place your riddle describes. Leave it there and enter its code here.',
    ),
    rateLimit: CORE_LIMIT,
    fragment: { symbol: 'crescent', number: 4, direction: 'W', keyword: 'SHADOW', colour: 'Violet' },
  },
  {
    id: 3,
    answers: [
      'daytime',
      'day',
      'daylight',
      'day time',
      'it was day',
      'it was daytime',
      'during the day',
      'in the day',
      'in daylight',
      'broad daylight',
      'it was daylight',
    ],
    nearMisses: [
      { answers: ['night', 'at night', 'moonlight', 'moon'], message: 'Are you sure it was night? Read the story again.' },
      { containsAny: ['headlight', 'torch', 'phone', 'lamp', 'diya'], message: 'Every light in the story was out. The driver needed none.' },
    ],
    incorrectMessage: 'The driver saw Kiran clearly. Ask yourself what the story never actually says.',
    completionMessage:
      'Amavasya is a date, not a time: it has a day as well as a night. A yellow glow settles in, as if it had been daylight all along.',
    hints: corePenalties(
      'Read the story again. Does it ever say it was night?',
      'Amavasya is a date on the lunar calendar. It has a day as well as a night.',
      'The driver did not need any light from a lamp, a car or the moon.',
    ),
    rateLimit: CORE_LIMIT,
    fragment: { symbol: 'diamond', number: 2, direction: 'SE', keyword: 'LATTICE', colour: 'Yellow' },
  },
  {
    id: 4,
    answers: [],
    hiddenWordsByGroup: WORD_PUZZLE_ANSWERS,
    nearMisses: [],
    incorrectMessage: 'Find at least four different hidden words in your assigned picture. Check the poster number and your spelling.',
    completionMessage: 'Seen at last, in plain sight all along. A red glow gathers behind the glass.',
    hints: corePenalties(
      'The riddle describes an office area. Find that area, then match the poster number shown on your puzzle page.',
      'Scan the numbered QR and zoom into the picture. The hidden words are worked into the shapes and details.',
      'You need four different words from the same picture. Enter one word per box; order and letter case do not matter.',
    ),
    rateLimit: CORE_LIMIT,
    fragment: { symbol: 'ring', number: 4, direction: 'N', keyword: 'GLASS', colour: 'Red' },
  },
  {
    id: 5,
    answers: [], // team-specific: see answersByGroup (built from FIVE_DAWNS_SETS)
    answersByGroup: Object.fromEntries(FIVE_DAWNS_SETS.map((s) => [s.group, [s.final]])),
    riddleAnswersByGroup: Object.fromEntries(FIVE_DAWNS_SETS.map((s) => [s.group, s.lines])),
    otherGroupMessage:
      "That word belongs to another team's riddles. Your five dawns spell something else; read your own marked letters.",
    nearMisses: [
      {
        containsAny: [...new Set(FIVE_DAWNS_SETS.flatMap((s) => s.lines)), 'bhai dooj'],
        message: 'That answers one line. Now take the marked letter from each answer and read them from the first day to the fifth.',
      },
    ],
    incorrectMessage: 'The dawns do not agree. Check each answer fits its boxes, then read the marked letters in order.',
    completionMessage:
      'Five dawns, five letters, one word. A golden fragment drops into your hands. It glitters. Perhaps a little too brightly.',
    hints: corePenalties(
      'Each line is one day of Diwali, in order. The boxes show how many letters each answer has.',
      'Solve each line separately; a quick search per line is fair game. Then take the letter in the marked box.',
      'Read the five marked letters from the first day to the fifth. They spell an ordinary word.',
    ),
    rateLimit: CORE_LIMIT,
    // Deliberately false: a reflection. Shard C reveals the truth.
    fragment: { symbol: 'flame', number: 1, direction: 'SW', keyword: 'DRAWER', colour: 'Gold' },
    trueFragment: { symbol: 'flame', number: 1, direction: 'SE', keyword: 'REWARD', colour: 'Green' },
  },
  {
    id: 6,
    answers: ['courtyard-v3 leaf moon lotus bell star sbssbbssbbssbbssbbbb'],
    nearMisses: [],
    incorrectMessage: 'The courtyard is not ready yet. Check the gate-number clues and the path through all five lanterns.',
    completionMessage:
      'One small diya lights the whole courtyard. The sixth fragment is yours. Carry its light into the Convergence.',
    hints: corePenalties(
      'Use the gate-number clues first. Leaf and Lotus have one gate between them, Bell is immediately before Star, and Moon is not at either end. Follow the actual beam, not the faded branches.',
      'Place Leaf at gate 1 and Lotus at gate 3; that leaves Moon, Bell, Star at gates 2, 4, 5. From the diya turn north at A, west at B, south at C, then west at D. The eastward branch at F sends you back to C.',
      'Gates 1 to 5: Leaf, Moon, Lotus, Bell, Star. Mirrors A to J: /, \\, /, /, \\, \\, /, /, \\, \\. Mirrors K to T: /, /, \\, \\, /, /, \\, \\, \\, \\. The correct beam visits all twenty mirrors in alphabetical order before reaching the beacon.',
    ),
    rateLimit: CORE_LIMIT,
    fragment: { symbol: 'spiral', number: 2, direction: 'S', keyword: 'RETURN', colour: 'Blue' },
  },
  {
    id: 7,
    answers: ['unite'],
    nearMisses: [],
    incorrectMessage: 'The lantern keeps its silence. Check the corners, and look between the lights.',
    completionMessage:
      'The lanterns become one. The false flame was a reflection all along: its true colour is green, its true word REWARD. Your key, {key}, is now your proof. The Vault will ask for it.',
    hints: [
      { text: 'Find the teams named in your circle. All must reach this chamber and exchange their own seals.', penaltyMinutes: 10 },
      { text: 'Rotate and slide every partner card until its corner marks meet those on your fixed card.', penaltyMinutes: 15 },
      {
        text: 'The gold is not the message. Read the five dark letters left in the unlit spaces when every card is aligned.',
        penaltyMinutes: 20,
      },
    ],
    rateLimit: CONVERGENCE_LIMIT,
  },
  {
    id: 8,
    answers: ['shared'], // final word; the proof code is the team's Convergence key
    nearMisses: [
      { answers: ['shaded'], message: 'The light is still shaded. One of your flames is not what it seems.' },
      { answers: ['derahs'], message: 'You are reading the light backwards.' },
    ],
    incorrectMessage: 'The Vault stays sealed.',
    completionMessage:
      'The colours meet, and the light turns white again. It was never one flame. It was every flame, SHARED. The Light was never meant to be found alone.',
    hints: [
      { text: 'Each fragment carries a word and a number. The number picks a letter from the word.', penaltyMinutes: 10 },
      { text: 'Arrange the six letters as a rainbow is read, red first.', penaltyMinutes: 20 },
      {
        text: 'If your word comes out as SHADED, the false flame is still fooling you. Turn its word around.',
        penaltyMinutes: 30,
      },
    ],
    rateLimit: VAULT_LIMIT,
  },
];

export const ERRAND_GROUPS: ErrandGroup[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Each team's errand location group, spread evenly across teams by id. */
export function errandGroup(teamId: number): ErrandGroup {
  return variantKey(teamId, ERRAND_GROUPS) as ErrandGroup;
}

/** Each team's Five Dawns riddle set. */
export function riddleSet(teamId: number): string {
  return variantKey(teamId, FIVE_DAWNS_SETS.map((s) => s.group));
}

/** Where each errand group's card is placed (shown to organisers only). */
export const ERRAND_LOCATIONS: Record<ErrandGroup, string> = {
  A: '[LOCATION_A: coffee machine]',
  B: '[LOCATION_B: printer]',
  C: '[LOCATION_C: water dispenser]',
  D: 'Cafeteria',
  E: 'Auto-rickshaw in Phase 2',
  F: 'Reception area',
};

/** Stable public image URLs for printed QR codes. Answers stay in organiser content. */
export const POSTER_IMAGES = WORD_PUZZLE_POSTERS.map((poster) => ({
  poster: poster.id,
  url: `https://shivam-yadav-10.github.io/the-lost-light/${poster.file}`,
  location: poster.location,
  words: WORD_PUZZLE_ANSWERS[`W${poster.id}`],
}));

export const CHECKPOINTS: CheckpointContent[] = [
  ...ERRAND_GROUPS.map((group) => ({
    code: PROTECTED_PUZZLES.find((p) => p.id === 2)!.answersByGroup![group][0],
    title: 'An errand card',
    message: 'You found an errand card. Enter this code in II · The Errand. Each team has its own card.',
    puzzleId: 2,
  })),
  {
    code: 'KEEPER-POSTERS-6W2J',
    title: "The Keeper's copy of the posters",
    message: `Use only your assigned poster number from puzzle IV. Emergency picture links: ${POSTER_IMAGES.map((p) => `${p.poster}) ${p.url}`).join('  ')}`,
    puzzleId: 4,
  },
];

export const SHARDS: ShardContent[] = [
  {
    type: 'A',
    name: 'The Order',
    text: 'Your key has six digits, one for each colour of light. Speak them as the light fades: begin at violet, end at red.',
  },
  {
    type: 'B',
    name: 'The Place',
    text: "Each fragment points to one cell of your lantern. Its direction names the spoke. Its number counts the rings inward from the rim, so ring 1 is the outermost. A true cell bears its fragment's mark.",
  },
  {
    type: 'C',
    name: 'The Reflection',
    text: 'One fragment burns false: its colour belongs to no rainbow. It stands in the place of the one colour no other fragment claims. It is a reflection: mirror its direction east for west, and read its keyword backwards.',
  },
  {
    type: 'D',
    name: 'The Sum',
    text: 'Every lantern cell holds a flame digit above and a shadow digit below. Light adds: each digit of your key is the two added together, keeping only the last digit.',
  },
];

/** Rainbow order used by the Vault (red first) and, reversed, by shard A. */
export const RAINBOW = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Violet'];

export function protectedPuzzle(id: number): ProtectedPuzzle {
  const found = PROTECTED_PUZZLES.find((p) => p.id === id);
  if (!found) throw new Error(`No protected content for puzzle ${id}`);
  return found;
}
