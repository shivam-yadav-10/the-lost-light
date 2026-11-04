import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeam } from '../store/team';

const LANTERNS = Array.from({ length: 14 }, (_, index) => ({
  left: `${4 + (index * 37) % 92}%`,
  top: `${8 + (index * 23) % 78}%`,
  '--drift': `${18 + index % 5 * 4}s`,
  '--delay': `${-index * 3}s`,
  '--size': `${14 + index % 4 * 5}px`,
}));

export function WaitingRoom({ children }: { children: ReactNode }) {
  const { signOut } = useTeam();
  const navigate = useNavigate();
  return <main className="waiting-room">
    <div className="waiting-sky" aria-hidden="true">
      <div className="waiting-nebula" />
      <div className="waiting-stars" />
      <svg className="waiting-dial" viewBox="-200 -200 400 400" fill="none">
        <circle r="190" stroke="currentColor" strokeDasharray="1 9" />
        <circle r="170" stroke="currentColor" strokeWidth=".4" />
        <circle r="156" stroke="currentColor" strokeWidth=".5" strokeDasharray="30 8 2 8" />
        {Array.from({ length: 12 }, (_, index) => <g key={index} transform={`rotate(${index * 30})`}>
          <path d="M0 -139Q17 -160 0 -182Q-17 -160 0 -139Z" stroke="currentColor" strokeWidth=".6" />
          <path d="M0 -129V-120" stroke="currentColor" />
        </g>)}
      </svg>
      {LANTERNS.map((style, index) => <div key={index} className="waiting-lantern" style={style as CSSProperties}>
        <span className="waiting-lantern-paper" />
        <span className="waiting-lantern-flame" />
      </div>)}
      <div className="waiting-horizon" />
    </div>
    <button type="button" className="waiting-logout" onClick={() => {
      signOut();
      navigate('/login', { replace: true });
    }}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 5H5v14h4M13 8l4 4-4 4M8 12h13" />
      </svg>
      Log out
    </button>
    <div className="waiting-content">{children}</div>
  </main>;
}
