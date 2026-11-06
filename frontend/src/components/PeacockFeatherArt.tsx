import { useId } from 'react';

const BARBS = Array.from({ length: 26 }, (_, index) => {
  const y = 54 + index * 9;
  const width = 105 * Math.sqrt(Math.max(0, 1 - ((y - 162) / 130) ** 2));
  const spine = 255 - (y - 54) * .12;
  return { y, width, spine };
});

/** Offset shadow and highlight strokes create an engraved gold relief. */
export function PeacockFeatherArt() {
  const id = useId();
  const gold = `${id}-gold`;
  const relief = `${id}-relief`;
  return <div className="feather-counter-art" aria-hidden="true">
    <div className="feather-counter-aura" />
    <svg className="feather-counter-relief" viewBox="0 0 520 430" fill="none" focusable="false">
      <defs>
        <linearGradient id={gold} x1="150" y1="50" x2="330" y2="360" gradientUnits="userSpaceOnUse">
          <stop stopColor="#875421" />
          <stop offset=".2" stopColor="#e9b758" />
          <stop offset=".38" stopColor="#fff4cb" />
          <stop offset=".55" stopColor="#b8802d" />
          <stop offset=".75" stopColor="#ffe6a0" />
          <stop offset="1" stopColor="#a16a2b" />
        </linearGradient>
        <g id={relief} strokeLinecap="round" strokeLinejoin="round">
          <path d="M199 392C220 343 229 290 235 244Q250 154 256 35
            M204 385Q231 312 240 242Q254 144 258 39" strokeWidth="2" />
          <path d="M256 35C203 42 154 85 145 139C133 198 172 261 228 291
            M258 35C305 45 346 88 352 140C360 201 303 266 228 291"
            strokeWidth=".85" opacity=".75" />
          {BARBS.map(({ y, width, spine }, index) => <g key={index} strokeWidth=".85">
            <path d={`M${spine} ${y + 39}Q${spine - width * .38} ${y + 19} ${spine - width} ${y}`} />
            <path d={`M${spine + 2} ${y + 36}Q${spine + width * .55} ${y + 23} ${spine + width + 10} ${y - 3}`} />
            <path d={`M${spine - width} ${y}q9 -5 17 -6M${spine + width + 10} ${y - 3}q-7 -7 -14 -8`}
              strokeWidth=".45" opacity=".65" />
          </g>)}
          <path d="M251 75C220 83 195 109 194 140C192 178 215 208 244 214
            C276 210 303 182 303 145C303 109 279 82 251 75Z" strokeWidth="1.5" />
          <path d="M250 91C224 99 209 120 210 144C211 173 226 193 245 198
            C269 193 286 172 286 146C287 119 272 99 250 91Z" strokeWidth="1.1" />
          <path d="M249 113C231 121 223 137 225 153C227 173 238 181 246 183
            C262 177 274 162 272 145C271 130 261 119 249 113Z" strokeWidth="1.7" />
          <path d="M248 132C238 137 236 151 241 158C248 167 259 155 258 146
            Q257 137 248 132Z" strokeWidth="1.2" />
          <path d="M245 140Q242 147 247 152" strokeWidth=".65" />
        </g>
      </defs>
      <g transform="rotate(12 260 220)">
        <use href={`#${relief}`} stroke="#180f06" strokeWidth="3.8" transform="translate(2 3)" opacity=".9" />
        <use href={`#${relief}`} stroke="#8c571d" transform="translate(.8 1.2)" />
        <use href={`#${relief}`} stroke={`url(#${gold})`} />
        <use href={`#${relief}`} stroke="#fff4d0" transform="translate(-.4 -.6)" opacity=".35" />
      </g>
    </svg>
  </div>;
}
