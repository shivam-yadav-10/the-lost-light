import { useId } from 'react';

/** Layered strokes give the gold relief depth without a canvas or 3D runtime. */
export function KrishnaCounterArt() {
  const id = useId();
  const gold = `${id}-gold`;
  const relief = `${id}-relief`;
  const feather = `${id}-feather`;
  return <div className="krishna-counter-art" aria-hidden="true">
    <div className="krishna-counter-aura" />
    <svg className="krishna-counter-relief" viewBox="0 0 520 430" fill="none" focusable="false">
      <defs>
        <linearGradient id={gold} x1="95" y1="50" x2="420" y2="365" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7b491d" />
          <stop offset=".22" stopColor="#e3a64b" />
          <stop offset=".42" stopColor="#fff3c4" />
          <stop offset=".58" stopColor="#c58b35" />
          <stop offset=".78" stopColor="#ffe6a0" />
          <stop offset="1" stopColor="#95602c" />
        </linearGradient>
        <radialGradient id={feather}>
          <stop stopColor="#ffe6a0" stopOpacity=".22" />
          <stop offset=".5" stopColor="#49b6aa" stopOpacity=".15" />
          <stop offset="1" stopColor="#103a43" stopOpacity="0" />
        </radialGradient>
        <g id={relief} strokeLinecap="round" strokeLinejoin="round">
          {/* Crown, curls, and a tranquil face in three-quarter profile. */}
          <path d="M188 161Q183 128 204 110L218 88L239 103L259 84L276 106L298 98L305 132
            M192 144Q243 116 302 140M193 155Q247 129 306 151
            M207 130L214 116L227 125M240 119L253 102L268 123M280 127L290 115L297 135" />
          <path d="M194 155C170 171 171 192 186 201C165 211 177 233 190 232
            C172 245 181 265 198 262M189 168Q207 151 220 155
            M200 260Q186 282 206 294M204 276Q198 295 220 301" />
          <path d="M217 157C213 186 217 204 229 224C242 245 269 254 286 240
            Q297 228 297 214L311 207Q317 203 308 195L299 183Q301 169 297 157
            M244 174Q258 166 273 173M246 180Q258 185 270 179
            M285 174Q287 183 294 189M283 216Q292 212 300 215M286 222Q293 224 298 220" />
          <path d="M268 150L267 163M275 149L274 162M267 163Q270 168 274 162
            M276 153L276 158M218 191Q203 178 200 196Q199 211 215 209
            M207 212L202 229Q211 239 219 228L213 214M207 226L212 230" />
          {/* Draped shoulders and necklaces frame the flute-playing hands. */}
          <path d="M231 235L232 265Q212 279 187 284Q157 294 145 334
            M278 244L275 265Q305 277 327 291Q345 305 354 335
            M218 275Q250 316 292 276M211 280Q247 333 304 284
            M186 290Q172 313 178 341M192 300Q185 323 198 347
            M315 290Q326 316 316 342M309 311Q312 330 300 348" />
          <path d="M229 299Q248 316 275 303M232 308Q248 325 270 314
            M252 319L259 327L252 338L245 327Z
            M165 337Q201 360 245 364Q291 366 339 341
            M177 351Q244 391 327 354" />
          {/* The flute crosses the lips; fingers curl around the gold tube. */}
          <path d="M121 230L380 190Q389 189 390 195Q391 201 383 202L123 242Z
            M125 230L127 242M366 193L368 205M375 192L377 203
            M145 229L147 239M155 227L157 237M342 199L344 209
            M165 234L167 244Q166 261 158 275M165 244Q186 255 176 271
            M160 273L173 281M160 280L172 287" />
          <path d="M186 310Q189 291 200 280L223 254
            Q227 249 231 253Q234 256 229 262L216 278
            M210 285L238 258Q244 253 247 258Q249 261 244 266L223 288
            M218 293L242 273Q247 269 250 273Q252 277 246 282L227 299
            M226 303Q237 298 239 289M199 309Q216 323 231 305" />
          <path d="M320 309Q317 287 302 272L279 244
            Q275 238 271 242Q268 245 273 251L288 271
            M300 281L271 256Q266 252 263 256Q260 260 266 265L288 285
            M296 290L268 269Q262 265 260 270Q258 274 264 279L285 294
            M284 303Q273 296 272 287M307 308Q292 324 279 305" />
          {/* A sweeping peacock feather with fine engraved barbs. */}
          <path d="M236 116Q223 89 190 55Q174 36 178 13
            C141 20 120 53 128 80C135 105 165 111 191 96Q212 93 223 102" />
          <path d="M236 116Q188 78 162 47M193 84Q169 92 145 80
            M188 79Q164 81 140 67M181 72Q158 70 137 56
            M174 64Q154 58 143 43M167 56Q157 42 162 29
            M199 88Q201 66 191 43M190 78Q192 56 181 30
            M181 68Q183 48 174 25" />
          <path d="M156 43C143 47 142 67 155 77C169 87 184 73 180 58
            C177 46 166 40 156 43ZM158 51C151 57 155 71 164 71
            C174 71 176 57 166 51Q162 49 158 51Z" />
          <path d="M163 57Q158 61 163 66Q168 64 167 59Z" />
        </g>
      </defs>
      <g className="krishna-counter-halo" stroke={`url(#${gold})`}>
        <circle cx="257" cy="207" r="164" strokeWidth=".65" opacity=".3" />
        <circle cx="257" cy="207" r="153" strokeWidth=".5" strokeDasharray="1 8" opacity=".55" />
        {Array.from({ length: 18 }, (_, index) => <path key={index}
          d="M257 32L260 40L257 48L254 40Z" strokeWidth=".6"
          transform={`rotate(${index * 20} 257 207)`} opacity=".5" />)}
      </g>
      <ellipse cx="164" cy="61" rx="47" ry="50" fill={`url(#${feather})`} />
      <use href={`#${relief}`} stroke="#140c08" strokeWidth="5" transform="translate(2 3)" opacity=".9" />
      <use href={`#${relief}`} stroke="#88501b" strokeWidth="3.1" transform="translate(.8 1.1)" />
      <use href={`#${relief}`} stroke={`url(#${gold})`} strokeWidth="1.8" />
      <use href={`#${relief}`} stroke="#fff5d4" strokeWidth=".45" transform="translate(-.45 -.65)" opacity=".6" />
      <g fill="#ffeac1">
        <circle cx="116" cy="151" r="1.5" />
        <circle cx="373" cy="126" r="1.2" />
        <circle cx="397" cy="276" r="1.5" />
        <circle cx="128" cy="304" r="1" />
      </g>
    </svg>
  </div>;
}
