import type { ContentBlock } from '../api/types';
import { RiddleSet } from './RiddleSet';
import { StreetScene } from './StreetScene';

/** Renders structured puzzle content delivered by the API. Contains no puzzle data of its own. */
export function PuzzleBlocks({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="space-y-10">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return <p className="whitespace-pre-line text-lg font-light leading-relaxed text-parchment/90">{block.text}</p>;
    case 'note':
      return (
        <p className="rounded-2xl border border-ember/25 bg-ember/5 px-6 py-4 text-base text-parchment/85">{block.text}</p>
      );
    case 'verse':
      return (
        <blockquote className="card space-y-2 text-lg font-light leading-relaxed text-parchment/90 lg:text-xl">
          {block.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </blockquote>
      );
    case 'street':
      return <StreetScene caption={block.caption} rangoli={block.rangoli} lamps={block.lamps} />;
    case 'riddles':
      return <RiddleSet items={block.items} />;
    case 'courtyard':
      return (
        <section className="card !p-6" aria-labelledby="courtyard-clues">
          <h2 id="courtyard-clues" className="eyebrow">The Keeper's four clues</h2>
          <ol className="mt-4 list-decimal space-y-4 pl-5 text-parchment/85">
            {block.clues.map((clue) => <li key={clue}>{clue}</li>)}
          </ol>
        </section>
      );
    case 'list':
      return (
        <section className="card !p-6">
          <h2 className="eyebrow">{block.title}</h2>
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-parchment/85">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      );
  }
}
