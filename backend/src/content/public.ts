import type { MandalaCell, MandalaMotif, PublicPuzzle, RiddleLine, SceneLamp } from './types.js';
import { SPOKES } from './types.js';

/**
 * PLAYER-FACING content. Served by the API only after a puzzle unlocks.
 * Never put answers, aliases, hints or codes here; they belong in `protected.ts`.
 * Placeholders like [LOCATION_A: …] and [POSTER_1: …] must be replaced with real office places before the event.
 *
 * Unlock times are UTC (IST = UTC+05:30) for 10 November 2026.
 */

// ---------- I. The Festival Street ----------

// Decorative lettering on the great rangoli in the street's square.
// Letters per ring (1 = nearest the heart), spokes in order N, NE, E, SE, S, SW, W, NW.
const RANGOLI_LETTERS = ['TKEOAMLU', 'DPGIWHCM', 'FOYNBATL', 'SJUEZKRV', 'AXHQODRI'];

const RANGOLI_RING_STYLE: { motif: MandalaMotif; colour: string; dots: number }[] = [
  { motif: 'dot', colour: '#f59e0b', dots: 0 },
  { motif: 'petal', colour: '#f97316', dots: 0 },
  { motif: 'diamond', colour: '#fbbf24', dots: 0 },
  { motif: 'teardrop', colour: '#f59e0b', dots: 3 },
  { motif: 'bead', colour: '#fb923c', dots: 0 },
];

export const STREET_RANGOLI: MandalaCell[] = RANGOLI_LETTERS.flatMap((letters, ringIndex) =>
  SPOKES.map((spoke, spokeIndex) => ({
    spoke,
    ring: ringIndex + 1,
    letter: letters[spokeIndex],
    motif: RANGOLI_RING_STYLE[ringIndex].motif,
    colour: RANGOLI_RING_STYLE[ringIndex].colour,
    rotate: 0,
    dots: RANGOLI_RING_STYLE[ringIndex].dots,
    scale: 1,
  })),
);

// Tiny diyas hidden in the scene (coordinates in the 1200 × 720 scene). Only the lit ones count.
export const STREET_LAMPS: SceneLamp[] = [
  { x: 140, y: 168, letter: 'E', lit: true }, // on a rooftop
  { x: 232, y: 332, letter: 'K', lit: false }, // window ledge
  { x: 318, y: 505, letter: 'M', lit: true }, // sweet-stall shelf
  { x: 452, y: 642, letter: 'T', lit: false }, // on the road
  { x: 548, y: 84, letter: 'B', lit: true }, // centre of the gold firework (548, 78)
  { x: 712, y: 410, letter: 'A', lit: false }, // doorstep
  { x: 868, y: 668, letter: 'E', lit: true }, // under the cart
  { x: 930, y: 500, letter: 'O', lit: false }, // lantern-stall counter
  { x: 1062, y: 300, letter: 'R', lit: true }, // in the tree
  { x: 1150, y: 640, letter: 'S', lit: false }, // street corner
];

// ---------- V. The Five Dawns: six riddle sets, one per variant group ----------
// Each line: clue, answer word lengths, and the 1-based position of the marked letter.
// Answers and each set's final word live in protected.ts (FIVE_DAWNS_SETS).

const day = (n: number) => `Day ${n}`;

export const FIVE_DAWNS_RIDDLES: Record<string, RiddleLine[]> = {
  V1: [
    { label: day(1), lengths: [9], mark: 5, clue: 'On my first day, people buy gold, silver and new steel to welcome wealth. What is the day called?' },
    { label: day(2), lengths: [10], mark: 3, clue: 'My second dawn remembers a battle of old. The one who fell that morning gives the day its name. Who fell?' },
    { label: day(3), lengths: [6], mark: 2, clue: 'On my third night the goddess of wealth is welcomed, and beside her many honour the treasurer of the gods. Name him.' },
    { label: day(4), lengths: [7], mark: 7, clue: 'On my fourth day, a hill once lifted to shelter a village is remembered with a mountain of food. What is this offering called?' },
    { label: day(5), lengths: [4, 4], mark: 2, clue: "On my fifth day, sisters pray for their brothers' long lives. What is the day called?" },
  ],
  V2: [
    { label: day(1), lengths: [11], mark: 4, clue: 'My first day is also the birthday of the god of Ayurveda, who rose from the churning ocean holding a pot of nectar. Name him.' },
    { label: day(2), lengths: [4], mark: 2, clue: 'In parts of western India, my second day is called ____ Chaudas, after a fierce goddess. Fill in the blank.' },
    { label: day(3), lengths: [7], mark: 4, clue: 'On my third night, a whole city once lit lamps to welcome its prince home after fourteen years. Name the city.' },
    { label: day(4), lengths: [5], mark: 1, clue: 'On my fourth day, a hill was lifted to shield a village from the storms of an angry god. Name the god of rain.' },
    { label: day(5), lengths: [8], mark: 7, clue: 'On my fifth day sisters honour their brothers. In one story, a victorious god visited his sister after slaying a demon. Name her.' },
  ],
  V3: [
    { label: day(1), lengths: [5], mark: 5, clue: 'On my first day, many households buy a humble cleaning tool, believed to sweep poverty out of the home. What is it?' },
    { label: day(2), lengths: [5], mark: 4, clue: 'Before sunrise on my second day, many bathe after rubbing on a fragrant paste of gram flour and turmeric. What is the paste called?' },
    { label: day(3), lengths: [7], mark: 3, clue: 'On my third night, the goddess of wealth is worshipped together with the remover of obstacles. Name him.' },
    { label: day(4), lengths: [9], mark: 1, clue: 'On my fourth day, a hill once lifted on a single finger to shelter cowherds from the rain is honoured. Name the hill.' },
    { label: day(5), lengths: [4, 4], mark: 6, clue: "On my fifth day, a sister marks her brother's forehead and prays for him. Name the day." },
  ],
  V4: [
    { label: day(1), lengths: [4], mark: 2, clue: 'On the evening of my first day, a single lamp is lit facing south for the god of death. Name him.' },
    { label: day(2), lengths: [10], mark: 2, clue: 'In many tellings, a warrior queen rode into battle beside Krishna and struck down the demon of my second day. Name her.' },
    { label: day(3), lengths: [7], mark: 1, clue: 'On my third night, colourful patterns of powder and petals are drawn at doorsteps to welcome the goddess. What are they called?' },
    { label: day(4), lengths: [7], mark: 7, clue: 'On my fourth day, temples heap up a mountain of food in thanks for a hill once lifted. What is the offering called?' },
    { label: day(5), lengths: [5], mark: 2, clue: "On my fifth day, a sister places a mark on her brother's forehead. What is the mark called?" },
  ],
  V5: [
    { label: day(1), lengths: [9], mark: 2, clue: 'My first day takes its name from wealth ("dhan"). What is the day called?' },
    { label: day(2), lengths: [4], mark: 2, clue: 'In Gujarat, my second day is known as ____ Chaudas. The blank is the name of a goddess.' },
    { label: day(3), lengths: [7], mark: 1, clue: 'On my third night, doors are left open and lamps are lit so the goddess of wealth can find her way in. Name her.' },
    { label: day(4), lengths: [5], mark: 4, clue: 'In Maharashtra, my fourth day celebrates the bond between husband and wife and is called Diwali ____. Fill in the blank.' },
    { label: day(5), lengths: [4], mark: 2, clue: 'On my fifth day, the god of death is said to have visited his sister and promised long life to every brother she blesses. Name him.' },
  ],
  V6: [
    { label: day(1), lengths: [4], mark: 1, clue: 'On my first day, buying this yellow metal is said to bring lasting wealth. What is it?' },
    { label: day(2), lengths: [10], mark: 3, clue: 'My second day is named after a demon king who fell at dawn. Name him.' },
    { label: day(3), lengths: [8], mark: 1, clue: 'My third night falls on the darkest night of the lunar month, when there is no moon at all. What is that night called?' },
    { label: day(4), lengths: [4], mark: 4, clue: 'In many regions, my fourth day honours a generous demon king who was sent to the underworld but returns once a year. Name him.' },
    { label: day(5), lengths: [6], mark: 5, clue: 'On my fifth day, a river goddess is said to have welcomed her brother, the god of death, to her home. Name her.' },
  ],
};

// ---------- Puzzles ----------

export const WORD_PUZZLE_POSTERS = [
  { id: 1, file: 'word-puzzle-1.webp', location: 'Reception',
    lines: ['Before a guest can find their way,', 'I greet the names that start the day.', 'Where first hellos begin their tale,', 'seek the numbered lantern on the trail.'] },
  { id: 2, file: 'word-puzzle-2.jpg', location: 'Reception',
    lines: ['I welcome feet from far and near,', 'and tell new faces where to steer.', 'Return to where the greetings flow;', 'a numbered lantern waits below.'] },
  { id: 3, file: 'word-puzzle-3.webp', location: 'Pantry area',
    lines: ['Between the meetings, take a pause,', 'where cups and small refreshments draw us.', 'Not at your desk: let thirst be guide;', 'a numbered lantern waits inside.'] },
  { id: 4, file: 'word-puzzle-4.webp', location: 'Pantry area',
    lines: ['A cup, a snack, a moment away,', 'a little refuge in the working day.', 'Where colleagues stop to sip and stay,', 'find the lantern that marks your way.'] },
  { id: 5, file: 'word-puzzle-5.webp', location: 'Near IT Helpdesk printer',
    lines: ['Where troubled screens find helping hands,', 'a quieter neighbour takes commands.', 'It turns your files to sheets of white;', 'beside that printer, seek your light.'] },
  { id: 6, file: 'word-puzzle-6.webp', location: 'Near Townhall area',
    lines: ['Not one small meeting, but voices all,', 'we gather here to hear the call.', 'Where news is told to many ears,', 'your numbered lantern now appears.'] },
  { id: 7, file: 'word-puzzle-7.webp', location: 'Phase 2 cafeteria',
    lines: ['When lunch brings footsteps from every seat,', 'find where the second phase comes to eat.', 'Among the tables, pause and see:', 'your numbered lantern waits for thee.'] },
  { id: 8, file: 'word-puzzle-8.webp', location: 'Phase 2 cafeteria',
    lines: ['Beyond the work, where trays convene,', 'the second phase has a lunchtime scene.', 'Where meals and conversation meet,', 'seek your lantern near the seats.'] },
  { id: 9, file: 'word-puzzle-9.webp', location: 'Phase 2 cafeteria',
    lines: ['Let midday hunger lead your quest,', 'where phase two diners take their rest.', 'No screen or desk will hold this clue;', 'a numbered lantern waits for you.'] },
];

export const PUBLIC_PUZZLES: PublicPuzzle[] = [
  {
    id: 1,
    slug: 'the-festival-street',
    title: 'The Festival Street',
    fragmentName: 'Fragment of the Street',
    kind: 'core',
    sortOrder: 1,
    unlockAt: '2026-11-10T07:30:00.000Z',
    requires: [],
    intro:
      'Last night the whole street glowed. This morning every lamp is dark, except five little flames that slipped away and hid.',
    blocks: [
      {
        type: 'street',
        caption: 'The festival street. Use the magnifier: the lost flames are tiny.',
        rangoli: STREET_RANGOLI,
        lamps: STREET_LAMPS,
      },
      {
        type: 'text',
        text: 'Find the five diyas that are still lit. Each wears a small letter. Read the letters from left to right. Unlit lamps do not count.',
      },
    ],
  },
  {
    id: 2,
    slug: 'the-errand',
    title: 'The Errand',
    fragmentName: 'Fragment of the Errand',
    kind: 'core',
    sortOrder: 2,
    unlockAt: '2026-11-10T08:00:00.000Z',
    requires: [1],
    intro:
      'A fragment has been tucked beside something you use every day. The Keeper has written your team a riddle. Other teams were sent somewhere else.',
    blocks: [
      {
        type: 'note',
        text: 'Solve the riddle, go to the place it describes, and find a small card with a diya on it. Type the code from that card here.',
      },
    ],
    variants: {
      A: [
        {
          type: 'verse',
          lines: [
            'Before the first meeting, before the first mail,',
            'I hiss and I grind and I never once fail.',
            'I fill up your cup when your eyes are still dim:',
            'look where the mugs wait, close beside my rim.',
          ],
        },
      ],
      B: [
        {
          type: 'verse',
          lines: [
            'I never say a word, yet I answer in lines.',
            'Send me your pages and I copy your signs.',
            'I hum when I am busy and sulk when I jam:',
            'look where the warm sheets land, and there I am.',
          ],
        },
      ],
      C: [
        {
          type: 'verse',
          lines: [
            'I gulp when you pour and I bubble with cheer,',
            'one tap runs cold and the other runs near boiling here.',
            'Where cups are filled and the thirsty stand,',
            'my secret waits close at hand.',
          ],
        },
      ],
      D: [
        {
          type: 'verse',
          lines: [
            'When midday calls, the desks grow still,',
            'and hungry footsteps come to fill.',
            'Where trays and tables welcome you,',
            'a little diya holds your clue.',
          ],
        },
      ],
      E: [
        {
          type: 'verse',
          lines: [
            'Three wheels, a roof, a seat behind,',
            'a little city ride to find.',
            'In Phase 2, seek this waiting ride;',
            'a diya card rests by its side.',
          ],
        },
      ],
      F: [
        {
          type: 'verse',
          lines: [
            'Before a visitor finds their way,',
            'a first hello begins their day.',
            'Where guests are welcomed, pause and see:',
            'a little flame keeps company.',
          ],
        },
      ],
    },
  },
  {
    id: 3,
    slug: 'the-darkest-day',
    title: 'The Darkest Day',
    fragmentName: 'Fragment of the Darkest Day',
    kind: 'core',
    sortOrder: 3,
    unlockAt: '2026-11-10T08:30:00.000Z',
    requires: [2],
    intro: 'Some puzzles are not about what you see, but about what you assume.',
    blocks: [
      {
        type: 'verse',
        lines: [
          'Kiran walked the whole length of the market on Amavasya.',
          'There was no moon. The power had failed, so no streetlight shone.',
          'Not a single diya was lit, and Kiran was dressed in black from head to toe.',
          'A car with its headlights switched off came around the corner,',
          'and stopped just in time.',
        ],
      },
      { type: 'text', text: 'How did the driver see Kiran? Answer in a word or two.' },
    ],
  },
  {
    id: 4,
    slug: 'hidden-in-plain-sight',
    title: 'Hidden in Plain Sight',
    fragmentName: 'Fragment of the Glass',
    kind: 'core',
    sortOrder: 4,
    unlockAt: '2026-11-10T09:00:00.000Z',
    requires: [3],
    intro:
      'A picture is waiting somewhere in the office, but first you must find it. Follow your team’s riddle to a numbered QR poster, then look for words hidden in the picture.',
    blocks: [
      {
        type: 'note',
        text: 'Scan only the poster number assigned below. Each picture hides six words. Find at least four different words and enter them below, in any order. Keep the poster in place for other teams.',
      },
    ],
    variants: Object.fromEntries(WORD_PUZZLE_POSTERS.map((poster) => [
      `W${poster.id}`,
      [{ type: 'verse' as const, lines: poster.lines },
        { type: 'note' as const, text: `Your team is looking for QR poster ${poster.id}. Other posters belong to other teams.` }],
    ])),
  },
  {
    id: 5,
    slug: 'the-five-dawns',
    title: 'The Five Dawns',
    fragmentName: 'Fragment of the Five Dawns',
    kind: 'core',
    sortOrder: 5,
    unlockAt: '2026-11-10T09:30:00.000Z',
    requires: [4],
    intro: 'The festival lasts five days, and each day has kept a secret. Your team has been given its own five riddles.',
    blocks: [
      {
        type: 'note',
        text: 'Answer each riddle. The boxes show how many letters each answer has. Take the letter in the marked box, and read the five marked letters from the first day to the fifth.',
      },
    ],
    variants: Object.fromEntries(
      Object.entries(FIVE_DAWNS_RIDDLES).map(([group, items]) => [group, [{ type: 'riddles' as const, items }]]),
    ),
  },
  {
    id: 6,
    slug: 'the-lantern-courtyard',
    title: 'The Lantern Courtyard',
    fragmentName: 'Fragment of the Courtyard',
    kind: 'core',
    sortOrder: 6,
    unlockAt: '2026-11-10T10:00:00.000Z',
    requires: [1, 2, 3, 4, 5],
    intro: 'The Diwali courtyard has gone dark. Five lanterns wait beside a rangoli, and one diya still burns at its heart. Restore their places, then carry its light to the waiting beacon.',
    blocks: [
      {
        type: 'note',
        text: 'Everything you need is on this page. Click each numbered gate to cycle from empty through the five lantern symbols. Use every symbol once. The clues refer to gate numbers, not screen positions. Turn mirrors A to T so the light visits all five gates and all twenty mirrors before reaching the beacon. Scroll the courtyard sideways to explore both halves. Beware false branches: a wrong turn can return to an earlier mirror or lead to a dark dead end. No timer or move limit.',
      },
      {
        type: 'courtyard',
        clues: [
          'The Lotus lantern is exactly two gate numbers after the Leaf lantern.',
          'The Bell lantern is immediately before the Star lantern.',
          'The Moon lantern is at neither the first nor the last gate.',
          'The Moon lantern comes before the Bell lantern.',
        ],
      },
    ],
  },
  {
    id: 7,
    slug: 'the-convergence',
    title: 'The Convergence',
    fragmentName: 'The Seventh Shard',
    kind: 'convergence',
    sortOrder: 7,
    unlockAt: null,
    requires: [1, 2, 3, 4, 5, 6],
    intro:
      'Your lantern cannot tell its story alone. Find the Lightkeepers named below: your circle carries the missing light.',
    blocks: [
      {
        type: 'text',
        text: 'Exchange seals with every team in your circle. Each must reach this chamber before their seal can open an illustrated clue card. In a circle of three, you need both partners.',
      },
      {
        type: 'note',
        text: 'Solve two mysteries. The illustrated clues share one five-letter word unique to your circle. The lantern table hides another: slide and rotate every partner pattern until the corners meet, then read the dark spaces. Offer both words, separated by a space, in either order. To rotate, focus the lantern workspace and press Ctrl+R, or use the Rotate buttons.',
      },
    ],
  },
  {
    id: 8,
    slug: 'the-final-vault',
    title: 'The Final Vault',
    fragmentName: 'The Lost Light',
    kind: 'vault',
    sortOrder: 8,
    unlockAt: null,
    requires: [7],
    intro: 'Six colours. One light. Return what was scattered, and prove it is yours.',
    blocks: [],
  },
];

export const LIGHT_MESSAGES = {
  partial: 'Six fragments recovered. Light restored: 83%. Your team does not possess the complete Light.',
};
