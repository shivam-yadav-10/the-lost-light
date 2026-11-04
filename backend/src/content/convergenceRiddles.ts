export interface ConvergenceClue {
  title: string;
  text: string;
  detail: string;
  art: string;
}

export const CONVERGENCE_RIDDLES = [
  { id: 'C1', answer: 'MATCH', clues: [
    { title: 'A borrowed flame', text: 'I begin with a spark.', detail: 'A wooden stem wakes against a rough strip.', art: 'spark' },
    { title: 'Two of a kind', text: 'I am found when two belong together.', detail: 'Two tiles share the same pattern, line for line.', art: 'tiles' },
    { title: 'Across the field', text: 'Between rivals, I become a contest.', detail: 'Two sides meet on one field beneath the lights.', art: 'field' },
  ] },
  { id: 'C2', answer: 'SCALE', clues: [
    { title: 'In the balance', text: 'I tell the weight of what you carry.', detail: 'Two pans hang from a level beam.', art: 'balance' },
    { title: 'A silver coat', text: 'I am one small piece of a fish\'s armour.', detail: 'Overlapping plates shimmer beneath the water.', art: 'fish' },
    { title: 'Notes ascending', text: 'Step through my notes, from low to high.', detail: 'A musician practises an ordered climb of tones.', art: 'notes' },
  ] },
  { id: 'C3', answer: 'LIGHT', clues: [
    { title: 'Against the dark', text: 'I let hidden shapes be seen.', detail: 'A lantern casts its glow into the night.', art: 'lantern' },
    { title: 'Easy to carry', text: 'I am the opposite of heavy.', detail: 'A feather rests almost weightless in an open palm.', art: 'feather' },
    { title: 'A waking wick', text: 'As an action, I bring a candle to life.', detail: 'One flame passes to an unburnt wick.', art: 'candle' },
  ] },
  { id: 'C4', answer: 'WATCH', clues: [
    { title: 'Around the wrist', text: 'I carry the hour wherever you go.', detail: 'Hands turn on a tiny dial fastened to a strap.', art: 'timepiece' },
    { title: 'Eyes on the horizon', text: 'As an action, I keep my eyes on what may come.', detail: 'A lookout follows a distant sail without looking away.', art: 'eye' },
    { title: 'Through the night', text: 'I am a period of duty for a guard.', detail: 'A sentinel takes the next turn at the gate.', art: 'gate' },
  ] },
  { id: 'C5', answer: 'CRANE', clues: [
    { title: 'In the shallows', text: 'I stand on long legs beneath a feathered coat.', detail: 'A tall wetland bird lifts its narrow beak.', art: 'bird' },
    { title: 'Above the rooftops', text: 'I raise what human arms cannot.', detail: 'A tower and a long jib lift a heavy load on a cable.', art: 'hoist' },
    { title: 'Beyond the crowd', text: 'As an action, I stretch my neck to see.', detail: 'A spectator reaches upward to glimpse the procession.', art: 'neck' },
  ] },
  { id: 'C6', answer: 'POINT', clues: [
    { title: 'At the very tip', text: 'I am where a sharpened pencil ends.', detail: 'Two sloping edges meet at a single tip.', art: 'pencil' },
    { title: 'One on the board', text: 'I am one unit added to a score.', detail: 'A player earns one more mark on the scoreboard.', art: 'score' },
    { title: 'Show the way', text: 'As an action, I indicate a direction.', detail: 'An outstretched finger shows which path to take.', art: 'arrow' },
  ] },
];

/** Existing circle assignments are immutable; refuse to reuse a set for another circle. */
export function planRiddleSets(groups: string[][], existing: Map<string, string>): Map<string, string> {
  if (groups.length > CONVERGENCE_RIDDLES.length) throw new Error('Only six unique Convergence riddle sets exist. Add sets before provisioning more circles.');
  const result = new Map<string, string>();
  const used = new Set<string>();
  for (const members of groups) {
    const saved = members.map((id) => existing.get(id));
    if (saved.every((id) => id === undefined)) continue;
    const set = saved[0];
    if (!set || !CONVERGENCE_RIDDLES.some((riddle) => riddle.id === set)
      || saved.some((id) => id !== set) || used.has(set)) {
      throw new Error('Inconsistent or duplicate Convergence riddle assignment; refusing to reassign circles.');
    }
    used.add(set);
    members.forEach((id) => result.set(id, set));
  }
  for (const members of groups) {
    if (result.has(members[0])) continue;
    const set = CONVERGENCE_RIDDLES.find((riddle) => !used.has(riddle.id))!.id;
    used.add(set);
    members.forEach((id) => result.set(id, set));
  }
  return result;
}
