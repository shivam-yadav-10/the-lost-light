import { useId } from 'react';

const BARBS = Array.from({ length: 22 }, (_, index) => {
  const y = 194 + index * 8;
  const t = index / 21;
  const spine = 273 - 34 * Math.sin(t * Math.PI) + 32 * t;
  const width = 78 * (1 - t) + 10;
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
          <path d="M312 402C254 369 234 308 250 254Q272 213 273 188
            M309 398C257 361 241 308 255 256Q278 212 277 188" strokeWidth="1.5" />
          {/* Separate swept vanes leave the eye open rather than crossing it. */}
          <path d="M273 215C200 204 156 153 179 100Q198 60 194 28
            M274 209C213 195 169 157 185 111Q204 64 200 37
            M267 196C216 184 185 155 194 119Q214 77 207 48
            M243 179C212 165 204 141 212 114Q225 82 216 59
            M218 148Q219 109 227 91Q230 76 223 66
            M277 217C309 178 327 145 311 106Q292 66 222 25
            M281 204C309 164 317 144 302 109Q288 78 232 39
            M286 182C303 151 304 132 291 108Q278 85 238 51
            M288 150Q289 120 267 100Q250 84 243 67" strokeWidth="1.3" />
          <path d="M273 210C315 188 338 154 330 116
            M272 216C326 196 350 165 349 131
            M272 224C323 214 355 187 362 151
            M276 231C321 222 348 209 372 175
            M267 218C213 218 177 201 155 166
            M260 226C206 225 174 211 153 185
            M255 233C208 236 178 224 161 210" strokeWidth=".7" />
          {BARBS.map(({ y, width, spine }, index) => <g key={index}>
            <path d={`M${spine} ${y + 24}C${spine - width * .3} ${y + 7} ${spine - width * .8} ${y + 14} ${spine - width} ${y - 20}
              C${spine - width * .72} ${y + 11} ${spine - width * .25} ${y + 1} ${spine} ${y + 24}Z`}
              fill="currentColor" strokeWidth=".55" />
            <path d={`M${spine + 2} ${y + 22}C${spine + width * .15} ${y - 7} ${spine + width * .78} ${y - 13} ${spine + width * .65} ${y - 49}
              C${spine + width * .94} ${y - 15} ${spine + width * .25} ${y + 1} ${spine + 2} ${y + 22}Z`}
              fill="currentColor" strokeWidth=".55" />
          </g>)}
          <path d="M251 101C221 107 207 130 215 156C225 186 251 195 273 179
            C294 163 293 132 277 115Q265 105 251 101Z" strokeWidth="1.7" />
          <path d="M250 113C229 116 219 134 227 154C234 176 251 183 267 169
            Q286 150 272 127Q265 117 250 113Z" strokeWidth=".8" />
          <path d="M247 127C236 131 231 142 238 154C245 167 261 159 270 147
            Q281 133 262 128Q254 125 247 127Z" strokeWidth="1.6" />
          <path d="M248 133Q237 145 247 156Q258 153 261 138
            M250 131Q251 146 245 151M242 138Q254 133 267 138" strokeWidth=".75" />
        </g>
      </defs>
      <g transform="rotate(-12 260 220)">
        <use href={`#${relief}`} stroke="#180f06" color="#180f06" transform="translate(1.5 2)" opacity=".8" />
        <use href={`#${relief}`} stroke="#8c571d" color="#8c571d" transform="translate(.6 .9)" />
        <use href={`#${relief}`} stroke={`url(#${gold})`} color="#dfb565" />
        <use href={`#${relief}`} stroke="#fff4d0" color="#fff4d0" transform="translate(-.3 -.4)" opacity=".2" />
      </g>
    </svg>
  </div>;
}
