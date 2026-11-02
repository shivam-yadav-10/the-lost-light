interface IntroControlsProps {
  muted: boolean;
  onToggleMute: () => void;
  onSkip: () => void;
  showSkip?: boolean;
}

/** The persistent top bar: a sound toggle (off by default) and a Skip Intro escape hatch. */
export function IntroControls({ muted, onToggleMute, onSkip, showSkip = true }: IntroControlsProps) {
  return (
    <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 pt-[max(1rem,env(safe-area-inset-top))] lg:px-10">
      <button
        type="button"
        className="btn-ghost !px-4 !py-2 text-xs"
        onClick={onToggleMute}
        aria-pressed={!muted}
        aria-label={muted ? 'Turn sound on' : 'Mute sound'}
      >
        <SpeakerIcon muted={muted} />
        <span className="ml-2 hidden sm:inline">{muted ? 'Sound off' : 'Sound on'}</span>
      </button>
      {showSkip && (
        <button type="button" className="btn-ghost !px-5 !py-2 text-xs" onClick={onSkip}>
          Skip Intro
        </button>
      )}
    </div>
  );
}

function SpeakerIcon({ muted, size = 14 }: { muted: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" />
      {muted ? (
        <path d="m16 9 5 6m0-6-5 6" />
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  );
}
