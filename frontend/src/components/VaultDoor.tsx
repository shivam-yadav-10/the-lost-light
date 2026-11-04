import { useId } from 'react';

function DoorEngraving({ id }: { id: string }) {
  return <svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid slice" className="vault-engraving">
    <defs>
      <linearGradient id={`${id}-metal`} x2="1" y2="1">
        <stop stopColor="#f9d997" /><stop offset=".45" stopColor="#97703d" /><stop offset="1" stopColor="#e9b96a" />
      </linearGradient>
      <pattern id={`${id}-lattice`} width="48" height="48" patternUnits="userSpaceOnUse">
        <path d="M24 0 48 24 24 48 0 24ZM0 0 48 48M48 0 0 48" fill="none" stroke="#d5ab68" strokeOpacity=".22" />
        <circle cx="24" cy="24" r="4" fill="none" stroke="#d5ab68" strokeOpacity=".45" />
      </pattern>
    </defs>
    <rect width="360" height="640" fill={`url(#${id}-lattice)`} />
    <g fill="none" stroke={`url(#${id}-metal)`}>
      <path d="M20 620V180Q20 22 180 22T340 180V620Z" strokeWidth="3" />
      <path d="M32 608V182Q32 38 180 38T328 182V608Z" strokeWidth="1" />
      <path d="M48 590V190Q48 62 180 62T312 190V590Z" strokeWidth="2" />
      <path d="M60 574V195Q60 78 180 78T300 195V574Z" strokeOpacity=".5" />
      <g transform="translate(180 310)">
        <circle r="117" strokeWidth="2" /><circle r="108" strokeDasharray="2 7" strokeWidth="3" />
        <circle r="95" /><circle r="64" strokeWidth="2" /><circle r="24" />
        {Array.from({ length: 16 }, (_, i) => <g key={i} transform={`rotate(${i * 22.5})`}>
          <path d="M0-96Q-36-58 0-25Q36-58 0-96Z" strokeWidth="1.5" />
          <path d="M0-116V-107M-5-101 0-106 5-101" />
        </g>)}
        <path d="m0-16 5 11 12 5-12 5-5 11-5-11-12-5 12-5Z" fill="#f9d997" />
      </g>
      {[155, 480, 545].map((y) => <g key={y} transform={`translate(180 ${y})`}>
        <path d="M-94 0Q-48-38 0 0Q48 38 94 0M-94 0Q-48 38 0 0Q48-38 94 0" />
        <path d="M-70 0H70M0-18 18 0 0 18-18 0Z" />
        <circle r="5" fill="#e9b96a" />
      </g>)}
      {[95, 190, 430, 570].map((y) => <g key={y}>
        <circle cx="41" cy={y} r="4" fill="#d5ab68" /><circle cx="319" cy={y} r="4" fill="#d5ab68" />
      </g>)}
    </g>
  </svg>;
}

export function VaultDoor() {
  const id = useId();
  return <div className="vault-doorway" aria-hidden="true">
    <div className="vault-rays" />
    <div className="vault-door-light" />
    <div className="vault-door vault-door-left"><DoorEngraving id={`${id}-left`} /></div>
    <div className="vault-door vault-door-right"><DoorEngraving id={`${id}-right`} /></div>
    <div className="vault-seam" />
    <svg viewBox="0 0 800 600" preserveAspectRatio="none" className="vault-arch">
      <path d="M14 598V290C14-70 786-70 786 290V598M28 598V290C28-50 772-50 772 290V598"
        fill="none" stroke="#e9b96a" strokeOpacity=".65" strokeWidth="2" />
      <path d="M42 598V290C42-28 758-28 758 290V598" fill="none"
        stroke="#e9b96a" strokeOpacity=".4" strokeWidth="3" strokeDasharray="2 10" />
    </svg>
    <div className="vault-motes">
      {Array.from({ length: 14 }, (_, i) => <span key={i} style={{
        left: `${8 + (i * 37) % 84}%`,
        animationDelay: `${1.2 + i * .31}s`,
        animationDuration: `${5 + (i % 4)}s`,
      }} />)}
    </div>
  </div>;
}
