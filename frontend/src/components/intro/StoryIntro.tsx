import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { markTeamIntroSeen } from '../../services/teamService';
import { useTeam } from '../../store/team';
import { useProgress } from '../../store/useProgress';
import { CHIME_NOTES, TeaserAudio } from '../../story/teaserAudio';
import { Flame } from './Flame';
import { FragmentRing, type FragmentState } from './FragmentRing';
import { IntroControls } from './IntroControls';
import { ParticleField } from './ParticleField';
import { Lines, StoryScene, TextSlot, type IntroLine } from './StoryScene';

const SCENE_COUNT = 5;
const EXIT_MS = 700;

interface Beat {
  lines: IntroLine[];
  holdMs: number;
  onEnter?: () => void;
}

/** Advances through a short list of timed beats, calling onDone once the last one elapses. */
function useBeats(beats: Beat[], onDone: () => void): [Beat, number] {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const beat = beats[index];
    beat.onEnter?.();
    const t = window.setTimeout(() => {
      if (index < beats.length - 1) setIndex((i) => i + 1);
      else onDone();
    }, beat.holdMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, beats, onDone]);
  return [beats[index], index];
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

interface SceneProps {
  onDone: () => void;
  audio: TeaserAudio;
}

/**
 * The cinematic post-login intro: a sound-on gate (first viewing only), five short automatic
 * scenes, a sound toggle, a Skip Intro escape hatch, and a final "Enter the Hunt" beat before
 * handing off to the dashboard. See the individual scene components below for the script.
 */
export function StoryIntro() {
  const { session } = useTeam();
  const { refresh } = useProgress();
  const navigate = useNavigate();
  const location = useLocation();
  const firstTime = Boolean((location.state as { first?: boolean } | null)?.first);

  const audioRef = useRef<TeaserAudio | null>(null);
  if (!audioRef.current) audioRef.current = new TeaserAudio();
  const audio = audioRef.current;

  const [sceneIndex, setSceneIndex] = useState(0);
  const [phase, setPhase] = useState<'gate' | 'scenes' | 'epilogue'>(firstTime ? 'gate' : 'scenes');
  const [muted, setMuted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);

  useEffect(() => () => audio.stop(0.3), [audio]);

  // Replays skip the gate — the click on the "Replay the story" link already counts as the
  // user gesture browsers require before audio can play, so start it straight away.
  useEffect(() => {
    if (!firstTime) {
      audio.start();
      audio.drone(1, 2);
    }
  }, [audio, firstTime]);

  const advance = useCallback(() => setSceneIndex((i) => Math.min(i + 1, SCENE_COUNT - 1)), []);

  const finish = useCallback(async () => {
    if (exitingRef.current || !session) return;
    exitingRef.current = true;
    setExiting(true);
    audio.stop(EXIT_MS / 1000);
    try {
      await Promise.all([markTeamIntroSeen(session.teamDocId), wait(EXIT_MS)]);
      await refresh();
    } catch (err) {
      // Let them in anyway; without this flag the dashboard would send them straight back here.
      console.warn('Could not record that the story was seen:', err);
    }
    navigate('/dashboard', { replace: true, state: { introDone: true } });
  }, [audio, navigate, refresh, session]);

  const handleSkip = useCallback(() => {
    void finish();
  }, [finish]);

  const handleEnter = useCallback(() => {
    setPhase('epilogue');
    window.setTimeout(() => void finish(), 2600);
  }, [finish]);

  const handleBegin = useCallback(() => {
    audio.start();
    audio.drone(1, 2);
    setPhase('scenes');
  }, [audio]);

  const toggleMute = useCallback(() => {
    setMuted((wasMuted) => {
      if (wasMuted) {
        // Turning sound on: start the engine if needed, then bring in the ambient pad.
        audio.start();
        audio.drone(1, 2);
      }
      audio.setMuted(!wasMuted);
      return !wasMuted;
    });
  }, [audio]);

  // Escape always skips, wherever focus happens to be.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleSkip]);

  const teamName = session?.teamName ?? 'Your team';

  return (
    <div
      className={`fixed inset-0 z-40 flex select-none flex-col items-center overflow-hidden bg-midnight ${exiting ? 'story-exit' : ''}`}
    >
      <div aria-hidden="true" className="intro-nebula absolute" />
      <div aria-hidden="true" className="intro-vignette pointer-events-none absolute inset-0 z-10" />
      {phase === 'gate' && <SoundGate onBegin={handleBegin} />}
      {phase === 'scenes' && <IntroControls muted={muted} onToggleMute={toggleMute} onSkip={handleSkip} />}
      {phase === 'scenes' && (
        <>
          {sceneIndex === 0 && <SceneDarkness key="s0" onDone={advance} audio={audio} />}
          {sceneIndex === 1 && <SceneWrongness key="s1" onDone={advance} audio={audio} />}
          {sceneIndex === 2 && <SceneTeam key="s2" teamName={teamName} onDone={advance} audio={audio} />}
          {sceneIndex === 3 && <SceneWarning key="s3" onDone={advance} audio={audio} />}
          {sceneIndex === 4 && <SceneBeginning key="s4" onEnter={handleEnter} audio={audio} />}
        </>
      )}
      {phase === 'epilogue' && (
        <StoryScene>
          <div aria-hidden="true" className="intro-finale-wash" />
          <p className="intro-epilogue story-text intro-title-glow relative text-xl font-light text-parchment lg:text-3xl">
            Somewhere in GTCI, the first fragment is waiting.
          </p>
        </StoryScene>
      )}
      {phase === 'scenes' && <SceneProgress current={sceneIndex} total={SCENE_COUNT} />}
    </div>
  );
}

/** A quiet full-width row of diyas marking progress through the teaser, lighting left to right. */
function SceneProgress({ current, total }: { current: number; total: number }) {
  const litCount = Math.round((current / total) * PROGRESS_DIYA_COUNT);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex items-center justify-between px-5 opacity-60 sm:px-10 lg:px-16"
    >
      {Array.from({ length: PROGRESS_DIYA_COUNT }, (_, i) => (
        <MiniDiya key={i} lit={i < litCount} active={i === litCount} />
      ))}
    </div>
  );
}

const PROGRESS_DIYA_COUNT = 18;

/** A tiny diya silhouette: a lit one glows amber, an unlit one is a faint outline. */
function MiniDiya({ lit, active = false }: { lit: boolean; active?: boolean }) {
  return (
    <svg width="11" height="14" viewBox="0 0 11 14" className={active ? 'intro-progress-current' : ''}>
      <path
        d="M2 11.5 Q5.5 13 9 11.5 L8 10 Q5.5 11.2 3 10 Z"
        fill={lit ? '#b45309' : '#241f4d'}
        fillOpacity={lit ? 0.9 : 0.6}
        stroke={lit ? '#f59e0b' : '#4a3a2e'}
        strokeOpacity={lit ? 0.6 : 0.4}
        strokeWidth="0.6"
      />
      <path
        d="M5.5 1.5 C7.2 4 7.6 6 5.5 8.5 C3.4 6 3.8 4 5.5 1.5 Z"
        fill={lit ? '#fde68a' : 'none'}
        stroke={lit ? 'none' : '#f59e0b'}
        strokeOpacity={lit ? 1 : 0.3}
        strokeWidth="0.6"
        opacity={lit ? 0.95 : 0.4}
      />
    </svg>
  );
}

function SoundGate({ onBegin }: { onBegin: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => buttonRef.current?.focus({ preventScroll: true }), []);

  return (
    <StoryScene>
      <ParticleField density="low" />
      <Flame size={110} intensity="glow" />
      <div className="relative flex flex-col items-center gap-4">
        <p className="story-line-in eyebrow">The Lost Light</p>
        <p className="story-line-in intro-title-glow text-xl font-light text-parchment/85 lg:text-2xl" style={{ animationDelay: '350ms' }}>
          Turn on audio to enhance the experience.
        </p>
        <button
          ref={buttonRef}
          type="button"
          className="story-line-in btn-ember mt-4 !px-12"
          style={{ animationDelay: '700ms' }}
          onClick={onBegin}
        >
          Begin
        </button>
      </div>
    </StoryScene>
  );
}

// --- Scene 1: Darkness ---------------------------------------------------

const SURROUND_OFFSETS = [
  { x: -170, y: -10 },
  { x: -95, y: -70 },
  { x: 95, y: -70 },
  { x: 170, y: -10 },
  { x: 0, y: -100 },
];

/** A few faint diyas lighting up around the original flame — not fragments, just tradition. */
function SurroundingFlames({ visible }: { visible: boolean }) {
  return (
    <div aria-hidden="true" className={`story-fade pointer-events-none absolute inset-0 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {SURROUND_OFFSETS.map((o, i) => (
        <div key={i} className="absolute left-1/2 top-1/2" style={{ transform: `translate(calc(-50% + ${o.x}px), calc(-50% + ${o.y}px))` }}>
          <Flame size={32} intensity="spark" />
        </div>
      ))}
    </div>
  );
}

function SceneDarkness({ onDone, audio }: SceneProps) {
  const [diyasVisible, setDiyasVisible] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const beats = useMemo<Beat[]>(
    () => [
      { lines: [{ text: 'Every Diwali begins with a light.' }], holdMs: 3200 },
      {
        lines: [
          { text: 'One flame becomes another.' },
          { text: 'And another.' },
          { text: 'Until the darkness has nowhere left to hide.' },
        ],
        holdMs: 6200,
        onEnter: () => {
          setDiyasVisible(true);
          audio.chime(CHIME_NOTES[4], 0.06);
        },
      },
      { lines: [], holdMs: 700, onEnter: () => setBlackout(true) },
    ],
    [audio],
  );
  const [beat, index] = useBeats(beats, onDone);

  return (
    <StoryScene>
      <ParticleField density="low" />
      <div className="relative">
        <Flame size={100} intensity="spark" />
        <SurroundingFlames visible={diyasVisible} />
      </div>
      <TextSlot>
        <Lines key={index} lines={beat.lines} />
      </TextSlot>
      {blackout && <div aria-hidden="true" className="intro-blackout z-20 bg-midnight" />}
    </StoryScene>
  );
}

// --- Scene 2: Something is wrong -----------------------------------------

function SceneWrongness({ onDone, audio }: SceneProps) {
  const [ringVisible, setRingVisible] = useState(false);
  const beats = useMemo<Beat[]>(
    () => [
      { lines: [], holdMs: 1700 },
      { lines: [{ text: 'But this morning...' }, { text: 'something at GTCI went dark.' }], holdMs: 3400 },
      { lines: [{ text: 'The final Light never arrived.' }], holdMs: 2700 },
      { lines: [{ text: 'In its place, we found something else.' }], holdMs: 2700 },
      { lines: [], holdMs: 1100 },
      {
        lines: [
          { text: 'THE LIGHT WAS NOT LOST.', emphasis: true },
          { text: 'IT WAS DIVIDED.', emphasis: true },
        ],
        holdMs: 3900,
        onEnter: () => {
          setRingVisible(true);
          audio.chime(CHIME_NOTES[1], 0.1);
        },
      },
      { lines: [{ text: 'Six fragments remain.' }], holdMs: 2500 },
      { lines: [{ text: 'Hidden among things you see every day.' }], holdMs: 2800 },
      { lines: [{ text: 'In patterns you might ignore.' }], holdMs: 2500 },
      { lines: [{ text: 'In places you might pass without looking twice.' }], holdMs: 3100 },
    ],
    [audio],
  );
  const [beat, index] = useBeats(beats, onDone);
  const glitching = index === 4;

  return (
    <StoryScene>
      <ParticleField density="low" glitch={glitching} />
      <FragmentRing states={ringVisible ? (['ghost', 'ghost', 'ghost', 'ghost', 'ghost', 'ghost'] as FragmentState[]) : []} radius={150} size={24} rangoli />
      <TextSlot>
        <Lines key={index} lines={beat.lines} />
      </TextSlot>
    </StoryScene>
  );
}

// --- Scene 3: The team ----------------------------------------------------

function SceneTeam({ teamName, onDone, audio }: SceneProps & { teamName: string }) {
  const [ringState, setRingState] = useState<FragmentState[]>(['dark', 'dark', 'dark', 'dark', 'dark', 'dark']);
  const timeoutsRef = useRef<number[]>([]);
  useEffect(() => () => timeoutsRef.current.forEach(window.clearTimeout), []);

  const flickerOne = useCallback(() => {
    const i = 2;
    setRingState((s) => s.map((v, idx) => (idx === i ? 'flicker' : v)));
    timeoutsRef.current.push(
      window.setTimeout(() => setRingState((s) => s.map((v, idx) => (idx === i ? 'lit' : v))), 1300),
      window.setTimeout(() => setRingState((s) => s.map((v, idx) => (idx === i ? 'dark' : v))), 3600),
    );
  }, []);

  const beats = useMemo<Beat[]>(
    () => [
      {
        lines: [
          { text: teamName, emphasis: true },
          { text: 'You are now part of the hunt.' },
        ],
        holdMs: 5600,
        onEnter: () => {
          flickerOne();
          audio.chime(CHIME_NOTES[2], 0.08);
        },
      },
      { lines: [{ text: 'Throughout today, the fragments will reveal themselves.' }], holdMs: 3800 },
      { lines: [{ text: 'Some will need to be solved.' }], holdMs: 2900 },
      { lines: [{ text: 'Some will need to be found.' }], holdMs: 2900 },
      {
        lines: [
          { text: 'And some...' },
          { text: 'may already be hiding in plain sight.', emphasis: true },
        ],
        holdMs: 5000,
      },
    ],
    [audio, flickerOne, teamName],
  );
  const [beat, index] = useBeats(beats, onDone);

  return (
    <StoryScene>
      <ParticleField density="low" />
      <FragmentRing states={ringState} radius={150} size={24} />
      <TextSlot>
        <Lines key={index} lines={beat.lines} />
      </TextSlot>
    </StoryScene>
  );
}

// --- Scene 4: The warning --------------------------------------------------

function SceneWarning({ onDone, audio }: SceneProps) {
  const [mysteryState, setMysteryState] = useState<FragmentState[]>([
    'ghost',
    'ghost',
    'ghost',
    'ghost',
    'ghost',
    'ghost',
    'mystery',
  ]);
  const timeoutsRef = useRef<number[]>([]);
  useEffect(() => () => timeoutsRef.current.forEach(window.clearTimeout), []);

  const revealMystery = useCallback(() => {
    timeoutsRef.current.push(
      window.setTimeout(() => setMysteryState((s) => s.map((v, idx) => (idx === 6 ? 'flicker' : v))), 700),
      window.setTimeout(() => setMysteryState((s) => s.map((v, idx) => (idx === 6 ? 'hidden' : v))), 3200),
    );
  }, []);

  const beats = useMemo<Beat[]>(
    () => [
      { lines: [], holdMs: 3800, onEnter: revealMystery },
      { lines: [{ text: 'One more thing.' }], holdMs: 2600 },
      { lines: [{ text: 'Do not assume everything you find belongs to you.' }], holdMs: 3800 },
      { lines: [{ text: 'Do not assume every clue is what it seems.' }], holdMs: 3800 },
      {
        lines: [
          { text: 'And above all...' },
          { text: 'keep what you discover.', emphasis: true },
        ],
        holdMs: 4800,
        onEnter: () => audio.chime(CHIME_NOTES[0] / 2, 0.08),
      },
      { lines: [{ text: 'You may understand its purpose only when it is too late to go looking for it again.' }], holdMs: 5200 },
    ],
    [audio, revealMystery],
  );
  const [beat, index] = useBeats(beats, onDone);

  return (
    <StoryScene>
      <div aria-hidden="true" className="intro-dim fixed inset-0" />
      <ParticleField density="low" />
      <FragmentRing states={mysteryState} layout="row" size={26} />
      <TextSlot>
        <Lines key={index} lines={beat.lines} />
      </TextSlot>
    </StoryScene>
  );
}

// --- Scene 5: The beginning ------------------------------------------------

const BEGINNING_LINES = [
  'You have until the Light fades.',
  'Look closer than you normally would.',
  'Trust your team.',
  'And remember...',
  'No one sees the whole picture at first.',
];
const BEGINNING_HOLDS = [3400, 3700, 3100, 2300, 4200];

function SceneBeginning({ onEnter, audio }: { onEnter: () => void; audio: TeaserAudio }) {
  const [lineIndex, setLineIndex] = useState(0);
  const [showTitle, setShowTitle] = useState(false);

  useEffect(() => {
    if (showTitle) return;
    if (lineIndex >= BEGINNING_LINES.length) {
      const t = window.setTimeout(() => {
        setShowTitle(true);
        audio.swell();
      }, 1700);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setLineIndex((i) => i + 1), BEGINNING_HOLDS[lineIndex]);
    return () => window.clearTimeout(t);
  }, [audio, lineIndex, showTitle]);

  return (
    <StoryScene>
      {showTitle && <div aria-hidden="true" className="intro-finale-wash" />}
      <ParticleField density={showTitle ? 'high' : 'low'} />
      <Flame size={showTitle ? 150 : 90} intensity={showTitle ? 'blaze' : 'glow'} />
      {!showTitle && (
        <TextSlot>
          <Lines key={lineIndex} lines={[{ text: BEGINNING_LINES[lineIndex] }]} />
        </TextSlot>
      )}
      {showTitle && (
        <div className="relative flex flex-col items-center gap-3">
          <h1 className="story-title-in intro-title-shadow text-shimmer text-5xl font-semibold tracking-wide lg:text-7xl">The Lost Light</h1>
          <p className="story-line-in intro-title-glow text-lg text-parchment/85 lg:text-xl" style={{ animationDelay: '1100ms' }}>
            A GTCI Diwali Mystery
          </p>
          <p className="story-line-in intro-title-glow text-base text-parchment/70 lg:text-lg" style={{ animationDelay: '1900ms' }}>
            The hunt begins now.
          </p>
          <button
            type="button"
            className="story-line-in btn-ember mt-4 !px-12"
            style={{ animationDelay: '2800ms' }}
            onClick={onEnter}
          >
            Enter the Hunt
          </button>
        </div>
      )}
    </StoryScene>
  );
}
