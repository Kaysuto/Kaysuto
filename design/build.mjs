// Builds the profile images (../assets/*.svg). Run: npm run build
// Bento cards (big gradient figures, illustrated visuals, horizon header) dressed in the "café" style
// of kaysuto.fr: warm espresso, ivory text, sand accent, Geist for text and Geist Mono for labels,
// two-tone titles. Text is converted to outlines, so the images look the same everywhere.
// Fonts come from the geist npm package (node_modules/geist/dist/fonts), so CI builds with a plain npm ci.
import * as hb from 'harfbuzzjs';
import { readFileSync, writeFileSync } from 'node:fs';
import * as si from 'simple-icons';

// kaysuto.fr, html[data-palette="cafe"].dark, converted from oklch.
const C = {
  card: ['#120c09', '#0a0604'], tile: '#1e1510', border: '#33261f',
  text: '#f5f1ea', secondary: '#bfac98', tertiary: '#97836f', accent: '#d5b89c',
};
const G = {
  sand: ['#f6e6d2', '#c5a88d'],
  clover: ['#9be38f', '#52a96c'],
  jelly: ['#5eead4', '#38bdf8'],
  mirum: ['#ffd27a', '#deb516'],
  nohello: ['#9cc9ff', '#4f8fea'],
  portfolio: ['#f6e6d2', '#fba541'],
};
const GAP = 24, RADIUS = 17, PAD = 52; // shadcn/ui Mira, as on kaysuto.fr: cards rounded-lg (12 px), inner pieces rounded-md (8 px); 1 unit ≈ 0.7 px on GitHub
const M = GAP / 2; // each image carries half the gutter, so cards line up without CSS
const X = M + PAD;

const loadFont = name => {
  const dir = name.startsWith('GeistMono') ? 'geist-mono' : 'geist-sans';
  const face = new hb.Face(new hb.Blob(readFileSync(new URL(`./node_modules/geist/dist/fonts/${dir}/${name}.ttf`, import.meta.url))));
  return { hb: new hb.Font(face), upem: face.upem };
};
const F = { semi: loadFont('Geist-SemiBold'), medium: loadFont('Geist-Medium'), mono: loadFont('GeistMono-Medium') };
const r1 = n => Math.round(n * 10) / 10;

function shape(font, str, size, tracking) {
  const buf = new hb.Buffer();
  buf.addText(str);
  buf.guessSegmentProperties();
  hb.shape(font.hb, buf);
  const k = size / font.upem, pos = buf.getGlyphPositions();
  let pen = 0;
  const glyphs = buf.getGlyphInfos().map((g, i) => {
    if (g.codepoint === 0) throw new Error(`Missing glyph in "${str}"`);
    const glyph = { id: g.codepoint, x: pen + pos[i].xOffset * k, y: pos[i].yOffset * k };
    pen += pos[i].xAdvance * k + tracking * size;
    return glyph;
  });
  return { glyphs, k, width: pen - tracking * size };
}

const measure = (str, { size, font = F.medium, tracking = 0 }) => shape(font, str, size, tracking).width;

// One line of text → a single <path>, so a gradient spans the whole line.
function text(str, { x, y, size, font = F.medium, tracking = 0, anchor = 'start', fill = C.text, extra = '' }) {
  const { glyphs, k, width } = shape(font, str, size, tracking);
  const x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const d = glyphs.map(g => font.hb.glyphToPath(g.id)
    .replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, px, py) => `${r1(x0 + g.x + px * k)},${r1(y - g.y - py * k)}`)).join('');
  return `<path d="${d}" fill="${fill}"${extra}/>`;
}

// Two-tone line, as on kaysuto.fr: "Ce que je maîtrise", the last part in sand.
function twoTone(parts, { x, y, size, font = F.semi, tracking = -0.025, anchor = 'start' }) {
  const widths = parts.map(([str]) => measure(str, { size, font, tracking }) + tracking * size);
  const total = widths.reduce((a, b) => a + b, 0) - tracking * size;
  let pen = anchor === 'middle' ? x - total / 2 : anchor === 'end' ? x - total : x;
  return {
    width: total,
    svg: parts.map(([str, fill], i) => { const t = text(str, { x: pen, y, size, font, tracking, fill }); pen += widths[i]; return t; }).join('\n'),
  };
}

const mono = (str, opts) => text(str, { size: 15, font: F.mono, tracking: 0.14, fill: C.tertiary, ...opts });
const linear = (id, stops, [x1, y1, x2, y2] = [0, 0, 1, 0]) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map((c, i) =>
    `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const radial = (id, cx, cy, r, stops) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">${stops.map(([o, c, a]) =>
    `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;
const blur = (id, s) => `<filter id="${id}" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${s}"/></filter>`;

const svgInner = path => {
  const svg = readFileSync(new URL(path, import.meta.url), 'utf8');
  return svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
};
const lucide = (name, x, y, size, color) =>
  `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgInner(`./node_modules/lucide-static/icons/${name}.svg`)}</g>`;
// Dark brand colours fade into the tile: black logos turn ivory, deep colours get tinted towards white.
function onDark(hex) {
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  if (l < 60) return C.text;
  if (l >= 120) return `#${hex}`;
  return `rgb(${rgb.map(c => Math.round(c + (255 - c) * 0.45)).join(',')})`;
}
const logo = (icon, cx, cy, size) =>
  `<path transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 24})" d="${icon.path}" fill="${onDark(icon.hex)}"/>`;
const png = path => `data:image/png;base64,${readFileSync(new URL(path, import.meta.url)).toString('base64')}`;

// App icons: the project's own mark where it has one, otherwise a Lucide glyph on its colour.
const MARKS = {
  // Jelly: 160 × 160 viewBox, ids prefixed so they cannot clash with the card's own.
  jelly: { tile: '#0b1b1f', inner: s => `<g transform="scale(${r1(s / 160 * 1e4) / 1e4})">${svgInner('./logos/jelly.svg').replace(/id="([\w-]+)"/g, 'id="jl-$1"').replace(/url\(#([\w-]+)\)/g, 'url(#jl-$1)')}</g>`, scale: 34 / 44 },
  // Official Clover Games icon on its own dark background (Assets/Icônes/Icône officiel.png, centre cropped to 128 × 128).
  clover: { tile: '#0f0c0a', inner: s => `<image width="${s}" height="${s}" href="${png('./logos/clover.png')}"/>`, scale: 1 },
  portfolio: { tile: '#2a1a0c', glyph: ['briefcase', G.portfolio[1]] },
  mirum: { tile: '#2a1d05', glyph: ['swords', G.mirum[0]] },
  nohello: { tile: '#0b1a2e', glyph: ['message-circle-off', G.nohello[0]] },
};
function appIcon(name, x, y, size = 44) {
  const { tile, inner, scale = 1, glyph } = MARKS[name];
  const s = size * scale, inset = (size - s) / 2;
  const mark = glyph ? lucide(glyph[0], x + size / 2 - 12, y + size / 2 - 12, 24, glyph[1])
    : `<clipPath id="ic-${name}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size / 4}"/></clipPath><g clip-path="url(#ic-${name})"><g transform="translate(${r1(x + inset)} ${r1(y + inset)})">${inner(s)}</g></g>`;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size / 4}" fill="${tile}"/>
${mark}
<rect x="${x + 0.5}" y="${y + 0.5}" width="${size - 1}" height="${size - 1}" rx="${size / 4 - 0.5}" fill="none" stroke="#fff" stroke-opacity=".12"/>`;
}

// Motion: slow ambient loops whose first frame is the finished design. Images can be shown with a
// frozen timeline (hidden tabs, previews), so no animation may start from a hidden state.
const motion = rules => `${rules}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

// Card: espresso background, hairline border, faint highlight on the top edge.
function card(w, h, body, { defs = '', style = '' } = {}) {
  const cw = w - 2 * M, ch = h - 2 * M, r = RADIUS;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<clipPath id="clip"><rect x="${M}" y="${M}" width="${cw}" height="${ch}" rx="${r}"/></clipPath>
${linear('fill', C.card, [0, 0, 0, 1])}
${defs}
</defs>${style && `\n<style>${style}</style>`}
<g clip-path="url(#clip)">
<rect x="${M}" y="${M}" width="${cw}" height="${ch}" fill="url(#fill)"/>
${body}
<rect x="${M + r}" y="${M}" width="${cw - 2 * r}" height="1" fill="#fff" fill-opacity=".07"/>
</g>
<rect x="${M + 0.5}" y="${M + 0.5}" width="${cw - 1}" height="${ch - 1}" rx="${r - 0.5}" fill="none" stroke="${C.text}" stroke-opacity=".1"/>
</svg>
`;
}

// The kaysuto.fr backdrop: a dot grid fading out from a point, and film grain.
const backdrop = (w, h, cx, cy, r) => ({
  defs: `<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#fff" fill-opacity=".09"/></pattern>
${radial('fade', cx, cy, r, [[0, '#fff', 1], [1, '#fff', 0]])}
<mask id="dotmask"><rect width="${w}" height="${h}" fill="url(#fade)"/></mask>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`,
  body: `<rect width="${w}" height="${h}" fill="url(#dots)" mask="url(#dotmask)"/>
<rect width="${w}" height="${h}" filter="url(#grain)" opacity=".05"/>`,
});

// The line under the name: short like Solaire's, the values of the original profile README.
const TAGLINE = [['Des projets ', C.secondary], ['simples, utiles et solides.', C.text]];

// Seeded random, so stars and city lights land in the same place on every build.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Header: sunrise seen from orbit, the sun rising behind the Earth's limb, then the name and one line.
function hero() {
  const w = 1200, h = 640, cx = w / 2, hy = 476, R = 1600, sy = hy + 7; // the sun sits just behind the limb, only its top and its glow show
  const planet = extra => `<circle cx="${cx}" cy="${hy + R}" r="${R}"${extra}/>`;
  const rand = rng(7);
  // Starfield in three depths: faint dust, ordinary stars in their real colours (blue-white to amber),
  // and a few bright ones with a soft halo that twinkle at their own pace. All of them stay above the
  // limb and fade in the sun's glare.
  const srand = rng(21), TINTS = ['#ffffff', '#fff6ea', '#ffe4c2', '#ffd3a0', '#dfe8ff', '#cfdcff'];
  const place = () => {
    for (;;) {
      const x = 16 + srand() * (w - 32), y = 18 + srand() * (hy - 20), dx = x - cx;
      if (y > hy + R - Math.sqrt(R * R - dx * dx) - 8) continue;
      return { x, y, dim: Math.min(1, Math.hypot(dx, (y - sy) * 1.7) / 420) };
    }
  };
  const dust = Array.from({ length: 240 }, () => {
    const { x, y, dim } = place();
    return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(0.3 + srand() * 0.35)}" fill="#fff6ea" opacity="${r1((0.08 + srand() * 0.25) * dim)}"/>`;
  }).join('');
  const normal = Array.from({ length: 90 }, () => {
    const { x, y, dim } = place(), tint = TINTS[Math.floor(srand() * TINTS.length)];
    return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(0.6 + srand() ** 2 * 0.8)}" fill="${tint}" opacity="${r1((0.35 + srand() * 0.5) * dim)}"/>`;
  }).join('');
  const bright = Array.from({ length: 11 }, () => {
    const { x, y, dim } = place(), tint = TINTS[Math.floor(srand() * TINTS.length)];
    const anim = `animation-duration:${r1(2.5 + srand() * 3)}s;animation-delay:-${r1(srand() * 5)}s`;
    return `<g class="tw" style="${anim}" opacity="${r1(0.55 + 0.45 * dim)}"><circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(4 + srand() * 3)}" fill="${tint}" opacity=".24" filter="url(#sm)"/><circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(1.3 + srand() * 0.7)}" fill="${tint}"/></g>`;
  }).join('');
  const stars = `<rect width="${w}" height="${hy}" filter="url(#milky)" mask="url(#milkyway)" opacity=".2"/>${dust}${normal}${bright}`;
  // City lights on the night side, away from the sunlit arc.
  const cities = Array.from({ length: 160 }, () => {
    const x = 40 + rand() * (w - 80), dx = x - cx, y = hy + R - Math.sqrt(R * R - dx * dx) + 10 + rand() ** 1.6 * 140;
    if (Math.abs(dx) < 170 + rand() * 120) return '';
    return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(0.5 + rand() * 0.9)}" fill="#ffc97a" opacity="${r1(0.25 + rand() * 0.55)}"/>`;
  }).join('');
  // Lens flare: ghosts along the line from the sun through the frame's centre.
  const flare = [[0.4, 9, '#ffd59a', 0.18], [0.75, 24, '#9fd8ff', 0.07], [1.0, 5, '#fff1dc', 0.25]]
    .map(([t, r, c, o]) => `<circle cx="${r1(cx + (cx + 140 - cx) * t)}" cy="${r1(sy + (h / 2 - 120 - sy) * t)}" r="${r}" fill="${c}" opacity="${o}"/>`).join('');
  const line = twoTone(TAGLINE, { x: cx - 8, y: 372, size: 36, font: F.medium, tracking: -0.015, anchor: 'middle' });
  const caretX = cx - 8 + line.width / 2 + 9;
  const defs = [
    `<clipPath id="earth">${planet('')}</clipPath>`,
    // A faint Milky Way: stretched noise kept to a tilted band across the sky.
    `<filter id="milky" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".014 .035" numOctaves="5" seed="5"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .94  0 0 0 0 .86  1.5 0 0 0 -.62"/></filter>`,
    `<linearGradient id="mw" x1="0" y1="0" x2="0" y2="${hy}" gradientUnits="userSpaceOnUse" gradientTransform="rotate(-16 ${cx} ${hy / 2})"><stop offset="0" stop-color="#000"/><stop offset=".14" stop-color="#fff"/><stop offset=".22" stop-color="#fff"/><stop offset=".4" stop-color="#000"/></linearGradient>`,
    `<mask id="milkyway"><rect width="${w}" height="${hy}" fill="url(#mw)"/></mask>`,
    `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`,
    // Clouds: stretched noise (the limb is seen edge-on), kept as soft white wisps.
    `<filter id="clouds" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".0045 .03" numOctaves="4" seed="11"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .93  0 0 0 0 .85  1.8 0 0 0 -.78"/></filter>`,
    // Daylight on the planet: only the arc under the sun is lit, fading into the night side.
    `<radialGradient id="day" cx="${cx}" cy="${hy}" r="560" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 ${hy}) scale(1 .3) translate(0 ${-hy})"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
    `<mask id="daymask"><rect width="${w}" height="${h}" fill="url(#day)"/></mask>`,
    `<radialGradient id="ground" cx="${cx}" cy="${hy}" r="620" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 ${hy}) scale(1 .35) translate(0 ${-hy})"><stop offset="0" stop-color="#3a2617"/><stop offset=".35" stop-color="#160e09"/><stop offset="1" stop-color="#060403"/></radialGradient>`,
    // Atmosphere: blue at the edges, warming to gold and white where the sun crosses it.
    `<linearGradient id="air" x1="0" y1="0" x2="${w}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5b8fc7" stop-opacity="0"/><stop offset=".2" stop-color="#5b8fc7" stop-opacity=".55"/><stop offset=".4" stop-color="#ffb35c" stop-opacity=".9"/><stop offset=".5" stop-color="#fff4e2"/><stop offset=".6" stop-color="#ffb35c" stop-opacity=".9"/><stop offset=".8" stop-color="#5b8fc7" stop-opacity=".55"/><stop offset="1" stop-color="#5b8fc7" stop-opacity="0"/></linearGradient>`,
    `<linearGradient id="hot" x1="0" y1="0" x2="${w}" y2="0" gradientUnits="userSpaceOnUse"><stop offset=".08" stop-color="#fff3e3" stop-opacity="0"/><stop offset=".3" stop-color="#fff3e3" stop-opacity=".9"/><stop offset=".5" stop-color="#fffaf2"/><stop offset=".7" stop-color="#ffe0b8" stop-opacity=".9"/><stop offset=".92" stop-color="#ffe0b8" stop-opacity="0"/></linearGradient>`,
    `<radialGradient id="haze" cx="${cx}" cy="${sy}" r="560" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffcf8a" stop-opacity=".32"/><stop offset=".25" stop-color="#fba541" stop-opacity=".1"/><stop offset=".6" stop-color="#c5a88d" stop-opacity=".02"/><stop offset="1" stop-color="#c5a88d" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="corona" cx="${cx}" cy="${sy}" r="140" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset=".14" stop-color="#fffaf0" stop-opacity=".8"/><stop offset=".4" stop-color="#ffd59a" stop-opacity=".2"/><stop offset="1" stop-color="#ffb35c" stop-opacity="0"/></radialGradient>`,
    linear('title', G.sand, [0, 0, 0, 1]),
    blur('md', 10), blur('sm', 2.5), blur('lg', 22),
    // The animated beam is blurred within the horizon band only, so each frame stays cheap.
    `<filter id="band" filterUnits="userSpaceOnUse" x="0" y="${hy - 60}" width="${w}" height="${h - hy + 60}"><feGaussianBlur stdDeviation="7"/></filter>`,
  ].join('\n');
  // A beam of light runs along the horizon. A circle's outline starts at its rightmost point and runs
  // clockwise, so the top of the planet sits at 3/4 of the circumference: the dash enters left, leaves right.
  const Cf = 2 * Math.PI * R, top = 0.75 * Cf, from = r1(-(top - 900)), to = r1(-(top + 640));
  const beam = extra => planet(` class="beam" fill="none" stroke="url(#hot)" stroke-linecap="round" stroke-dasharray="260 ${r1(Cf)}" stroke-dashoffset="${from}"${extra}`);
  const body = `<g class="stars">${stars}</g>
<rect class="atmo" width="${w}" height="${h}" fill="url(#haze)"/>
<g class="sun">
<ellipse cx="${cx}" cy="${sy}" rx="560" ry="2.4" fill="#fff4e2" opacity=".4" filter="url(#sm)"/>
<ellipse cx="${cx}" cy="${sy}" rx="340" ry="12" fill="#ffcf8a" opacity=".14" filter="url(#md)"/>
<circle cx="${cx}" cy="${sy}" r="140" fill="url(#corona)"/>
<circle cx="${cx}" cy="${sy}" r="15" fill="#fff"/>
</g>
${planet(' fill="url(#ground)"')}
<g clip-path="url(#earth)"><rect y="${hy - 10}" width="${w}" height="${h - hy + 10}" filter="url(#clouds)" mask="url(#daymask)" opacity=".85"/>${cities}</g>
${planet(' fill="none" stroke="url(#air)" stroke-width="34" filter="url(#lg)" opacity=".7"')}
${planet(' fill="none" stroke="url(#air)" stroke-width="9" filter="url(#md)"')}
${planet(' fill="none" stroke="url(#air)" stroke-width="1.6"')}
${beam(' stroke-width="12" opacity=".7" filter="url(#band)"')}
${beam(' stroke-width="2"')}
<g class="flare">${flare}</g>
<rect width="${w}" height="${h}" filter="url(#grain)" opacity=".05"/>
${text('Kimiya', { x: cx, y: 300, size: 168, font: F.semi, tracking: -0.045, anchor: 'middle', fill: 'url(#title)' })}
${line.svg}
<rect class="caret" x="${r1(caretX)}" y="344" width="3" height="36" rx="1.5" fill="${C.accent}"/>`;
  // The haze breathes, the sun pulses, a beam sweeps the horizon every 9 s,
  // a few stars twinkle and the caret blinks like the typewriter of kaysuto.fr.
  const style = motion(`.atmo{animation:pulse 8s ease-in-out infinite}
.sun{transform-origin:${cx}px ${sy}px;animation:twinkle 5s ease-in-out infinite}
.flare{animation:pulse 8s ease-in-out infinite}
.beam{animation:beam 9s ease-in-out infinite}
.tw{animation:pulse 3s ease-in-out infinite}
.caret{animation:blink 1.1s steps(1) infinite}
@keyframes pulse{50%{opacity:.45}}
@keyframes twinkle{50%{transform:scale(.92)}}
@keyframes beam{50%,100%{stroke-dashoffset:${to}}}
@keyframes blink{50%{opacity:0}}`);
  return card(w, h, body, { defs, style });
}

// Shared copy of the big project cards: app icon and eyebrow, two-tone title, link, then the key figure.
function projectCopy({ icon, eyebrow, title, link, linkColor, stat, caption }) {
  return [
    appIcon(icon, X, 64),
    mono(eyebrow, { x: X + 60, y: 92 }),
    ...title.map((line, i) => text(line, { x: X, y: 178 + i * 56, size: 50, font: F.semi, tracking: -0.03, fill: i === title.length - 1 ? C.accent : C.text })),
    text(link, { x: X, y: 178 + title.length * 56 + 2, size: 22, font: F.medium, fill: linkColor }),
    text(stat, { x: X - 5, y: 488, size: 168, font: F.semi, tracking: -0.05, fill: 'url(#stat)' }),
    text(caption, { x: X, y: 536, size: 22, font: F.medium, fill: C.secondary }),
  ].join('\n');
}

// From the Clover Games wiki (2026-10-21): the modes open today (the lobby is not one), the next one,
// and what was built around the server.
const MODES = [['Practice', 'swords'], ['PvPSoup', 'soup'], ['SkyPvP', 'cloudy'], ['BedWars', 'bed-double'], ['Créatif', 'palette']];
const NEXT_MODE = ['Survie', 'trees'];
const CLOVER_PARTS = [['puzzle', 'Plugin'], ['monitor-down', 'Launcher'], ['globe', 'Site web'], ['bot', 'Bot Discord']];

// One tile of the Clover visual: icon on a tinted square, then the label.
function cloverTile(x, y, w, h, icon, label, { color, dim = false, delay = 0 } = {}) {
  const box = h - 24;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.tile}" fill-opacity="${dim ? 0.3 : 0.7}"/>
<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="11.5" fill="none" stroke="${C.border}"${dim ? ' stroke-dasharray="5 5"' : ''}/>
<rect${dim ? '' : ' class="pip"'} x="${x + 12}" y="${y + 12}" width="${box}" height="${box}" rx="8" fill="${color}" fill-opacity="${dim ? 0.06 : 0.14}" style="animation-delay:${delay}s"/>
${lucide(icon, x + 12 + box / 2 - 10, y + 12 + box / 2 - 10, 20, dim ? C.tertiary : color)}
${text(label, { x: x + 24 + box, y: y + h / 2 + 6.5, size: 18, font: F.semi, fill: dim ? C.tertiary : C.text })}`;
}

function clover() {
  const [a, b] = G.clover, sx = 430, cw = 167, gap = 12;
  const defs = [linear('stat', G.clover), radial('glow', 760, 600, 420, [[0, b, 0.18], [1, b, 0]])].join('\n');
  const col = i => sx + (i % 2) * (cw + gap);
  // Section 1, aligned with the eyebrow: the modes, then the next one with a dashed outline.
  const modes = [...MODES, NEXT_MODE].map(([name, icon], i) =>
    cloverTile(col(i), 112 + Math.floor(i / 2) * 70, cw, 58, icon, name, { color: a, dim: i === MODES.length, delay: i * 0.5 })).join('\n');
  // Section 2, ending on the shared caption baseline: what was built around the server.
  const parts = CLOVER_PARTS.map(([icon, name], i) =>
    cloverTile(col(i), 414 + Math.floor(i / 2) * 70, cw, 52, icon, name, { color: G.sand[1], delay: 3 + i * 0.5 })).join('\n');
  const body = `<rect width="800" height="600" fill="url(#glow)"/>
${mono('MODES DE JEU', { x: sx, y: 92, size: 14, tracking: 0.1 })}
${modes}
${mono('AUTOUR DU SERVEUR', { x: sx, y: 396, size: 14, tracking: 0.1 })}
${parts}
${projectCopy({ icon: 'clover', eyebrow: 'CLOVER GAMES', title: ['Serveur', 'Minecraft.'], link: 'play.clovergames.fr ›', linkColor: a, stat: String(MODES.length), caption: 'modes, Java & Bedrock' })}`;
  // The icon squares pulse softly in turn, like status lights.
  const style = motion(`.pip{animation:pip 3s ease-in-out infinite}
@keyframes pip{50%{fill-opacity:.3}}`);
  return card(800, 600, body, { defs, style });
}

function jelly() {
  const [a] = G.jelly, sx = 470, sy = 72, sw = 440, sh = 416, mid = (sx + 788) / 2; // 788: visible right edge of the card
  const defs = [
    linear('stat', G.jelly),
    linear('bar', G.jelly),
    radial('glow', 760, 600, 420, [[0, a, 0.16], [1, a, 0]]),
    linear('sky', ['#0f4a47', '#08202b'], [0, 0, 0, 1]),
    '<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></linearGradient>',
    `<clipPath id="screen"><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="12"/></clipPath>`,
    blur('moon', 14),
  ].join('\n');
  // A stylised film still: sky, moon, two mountain ranges, a subtitle and the progress bar.
  const screen = `<g clip-path="url(#screen)">
<g class="kb"><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="url(#sky)"/>
<circle cx="${sx + 250}" cy="${sy + 70}" r="40" fill="#a7f3e8" opacity=".55" filter="url(#moon)"/>
<circle cx="${sx + 250}" cy="${sy + 70}" r="22" fill="#e6fffb"/>
<path d="M${sx} ${sy + 236}L${sx + 70} ${sy + 186}L${sx + 130} ${sy + 218}L${sx + 210} ${sy + 156}L${sx + 300} ${sy + 226}L${sx + 370} ${sy + 186}L${sx + sw} ${sy + 232}V${sy + sh}H${sx}Z" fill="#0d3d3c"/>
<path d="M${sx} ${sy + 290}L${sx + 90} ${sy + 246}L${sx + 170} ${sy + 278}L${sx + 260} ${sy + 236}L${sx + 350} ${sy + 284}L${sx + sw} ${sy + 260}V${sy + sh}H${sx}Z" fill="#06211f"/></g>
<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="url(#shade)"/>
<rect x="${sx + 22}" y="${sy + 22}" width="62" height="26" rx="13" fill="#fff" fill-opacity=".16"/>
${text('1080p', { x: sx + 53, y: sy + 40, size: 13, font: F.semi, anchor: 'middle', fill: '#fff' })}
<circle cx="${mid}" cy="${sy + 168}" r="31" fill="#fff" fill-opacity=".92"/>
<path d="M${mid - 8} ${sy + 153}v30l25-15z" fill="#0b0b0d"/>
<rect x="${mid - 80}" y="${sy + sh - 116}" width="160" height="30" rx="8" fill="#000" fill-opacity=".55"/>
${text('Toujours là ?', { x: mid, y: sy + sh - 96, size: 15, font: F.semi, anchor: 'middle', fill: '#fff' })}
${text('42:17', { x: sx + 24, y: sy + sh - 44, size: 14, font: F.mono, fill: '#fff', extra: ' fill-opacity=".8"' })}
<rect x="${sx + 24}" y="${sy + sh - 32}" width="${sw}" height="5" rx="2.5" fill="#fff" fill-opacity=".22"/>
<rect class="p" x="${sx + 24}" y="${sy + sh - 32}" width="150" height="5" rx="2.5" fill="url(#bar)"/>
<circle class="k" cx="${sx + 174}" cy="${sy + sh - 29.5}" r="8" fill="#fff"/>
</g>
<rect x="${sx + 0.5}" y="${sy + 0.5}" width="${sw - 1}" height="${sh - 1}" rx="11.5" fill="none" stroke="#fff" stroke-opacity=".14"/>`;
  const body = `<rect width="800" height="600" fill="url(#glow)"/>
${screen}
${projectCopy({ icon: 'jelly', eyebrow: 'JELLY · BETA', title: ['Streaming', 'sans pub.'], link: 'beta.playjelly.fr ›', linkColor: a, stat: '748+', caption: 'commits sur Jelly' })}`;
  // Slow zoom on the film still; playback keeps going: the fill (150 wide) grows 1.8× in a minute and the knob follows.
  const style = motion(`.kb{transform-origin:${sx + sw / 2}px ${sy + sh / 2}px;animation:kb 24s ease-in-out infinite alternate}
.p{transform-origin:${sx + 24}px 0;animation:play 60s linear infinite}
.k{animation:knob 60s linear infinite}
@keyframes kb{to{transform:scale(1.08)}}
@keyframes play{to{transform:scaleX(1.8)}}
@keyframes knob{to{transform:translateX(120px)}}`);
  return card(800, 600, body, { defs, style });
}

// Commits authored on GitHub, by project (2026-10-21; the BySolaire/playjelly mirror is not counted twice).
const COMMITS = [
  ['Jelly', 748, 'play', G.jelly],
  ['Mirum Orbis', 464, 'swords', G.mirum],
  ['Clover Games', 374, 'clover', G.clover],
  ['Guides & outils', 260, 'book-open-text', G.sand],
  ['Portfolio', 162, 'user-round', G.portfolio],
];

// Breakdown in the style of iPhone storage: one segmented bar, then one row per project.
function commits() {
  const total = COMMITS.reduce((n, [, count]) => n + count, 0), width = 400 - 2 * X, by = 212;
  let cursor = X;
  const bar = COMMITS.map(([, count, , [, color]], i) => {
    const w = count / total * width, gap = i < COMMITS.length - 1 ? 3 : 0;
    const seg = `<rect x="${r1(cursor)}" y="${by}" width="${r1(w - gap)}" height="12" fill="${color}"/>`;
    cursor += w;
    return seg;
  }).join('');
  const defs = [
    `<clipPath id="bar"><rect x="${X}" y="${by}" width="${width}" height="12" rx="6"/></clipPath>`,
    ...COMMITS.map(([, , , c], i) => linear(`t${i}`, c, [0, 0, 0, 1])),
    '<linearGradient id="shine"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>',
  ].join('\n');
  const rows = COMMITS.map(([label, count, icon], i) => {
    const base = 304 + i * 58, y = base - 24; // the last row lands on the shared caption baseline (536)
    return `<rect x="${X}" y="${y}" width="34" height="34" rx="9" fill="url(#t${i})"/>
<rect x="${X + 0.5}" y="${y + 0.5}" width="33" height="33" rx="8.5" fill="none" stroke="#fff" stroke-opacity=".22"/>
${lucide(icon, X + 8, y + 8, 18, '#1a110d')}
${text(label, { x: X + 48, y: base, size: 19, font: F.semi })}
${text(String(count), { x: 400 - X, y: base, size: 18, font: F.mono, anchor: 'end', fill: C.secondary })}`;
  }).join('\n');
  const body = `${twoTone([['Mes ', C.text], ['commits.', C.accent]], { x: X, y: 114, size: 40 }).svg}
${mono(`${total.toLocaleString('fr-FR').replace(/\s/g, ' ')} SUR GITHUB`, { x: X, y: 150, size: 14 })}
<g clip-path="url(#bar)">${bar}<rect class="shine" x="${X - 90}" y="${by}" width="60" height="12" fill="url(#shine)"/></g>
${rows}`;
  // A soft highlight sweeps across the bar every 6 s, starting outside it.
  const style = motion(`.shine{animation:shine 6s ease-in-out infinite}
@keyframes shine{45%,100%{transform:translateX(${width + 120}px)}}`);
  return card(400, 600, body, { defs, style });
}

// The essentials of the stack: five domains, four tools each, picked from kaysuto.fr, the original
// profile README and the projects. A string is a Lucide glyph, for tools Simple Icons lacks.
const SKILLS = [
  ['FRONT-END', [[si.siTypescript, 'TypeScript'], [si.siReact, 'React'], [si.siNextdotjs, 'Next.js'], [si.siTailwindcss, 'Tailwind CSS']]],
  ['BACK & DONNÉES', [[si.siNodedotjs, 'Node.js'], [si.siSupabase, 'Supabase'], [si.siPostgresql, 'PostgreSQL'], [si.siRedis, 'Redis']]],
  ['INFRA & RÉSEAU', [[si.siDocker, 'Docker'], [si.siProxmox, 'Proxmox'], [si.siNginx, 'Nginx'], ['network', 'NetBird']]],
  ['SUPERVISION', [[si.siGrafana, 'Grafana'], [si.siPrometheus, 'Prometheus'], ['shield-ban', 'Fail2Ban'], [si.siCloudflare, 'Cloudflare']]],
  ['JEU & APPS', [[si.siOpenjdk, 'Java · Paper'], [si.siTauri, 'Rust · Tauri'], [si.siDiscorddotjs, 'Discord.js'], [si.siPterodactyl, 'Pterodactyl']]],
];
const SKILLS_SUB = 'Testés au quotidien sur mes propres projets.';

// Full-width card: one column per domain, each a list of logo tiles.
function skills() {
  const w = 1200, h = 560, col = (w - 2 * X) / SKILLS.length, bd = backdrop(w, h, w - 120, 0, 620);
  const defs = `${bd.defs}
${radial('glow', w - 120, 0, 560, [[0, C.accent, 0.07], [1, C.accent, 0]])}`;
  const cols = SKILLS.map(([eyebrow, tools], c) => {
    const x = X + c * col;
    return [mono(eyebrow, { x, y: 236 }),
      ...tools.map(([icon, label], i) => {
        const y = 260 + i * 62; // the last tile ends on the bottom padding (496)
        const mark = typeof icon === 'string' ? lucide(icon, x + 12, y + 12, 24, C.secondary) : logo(icon, x + 24, y + 24, 24);
        return `<rect x="${x}" y="${y}" width="48" height="48" rx="12" fill="${C.tile}"/>
<rect x="${x + 0.5}" y="${y + 0.5}" width="47" height="47" rx="11.5" fill="none" stroke="${C.border}"/>
${mark}
${text(label, { x: x + 64, y: y + 31, size: 19, font: F.semi })}`;
      })].join('\n');
  }).join('\n');
  const body = `${bd.body}
<rect width="${w}" height="${h}" fill="url(#glow)"/>
${twoTone([['Ce que je ', C.text], ['maîtrise.', C.accent]], { x: X, y: 120, size: 50, tracking: -0.03 }).svg}
${text(SKILLS_SUB, { x: X, y: 160, size: 22, font: F.medium, fill: C.secondary })}
${cols}`;
  return card(w, h, body, { defs });
}

// GitHub activity, refreshed by stats.mjs (data/github.json) every few hours by the stats workflow.
const GH = JSON.parse(readFileSync(new URL('./data/github.json', import.meta.url), 'utf8'));
const HEAT = [C.tile, '#4d3a2c', '#7d6046', '#b8916b', '#ecd2b0']; // café ramp, empty to busiest
const nb = n => n.toLocaleString('fr-FR').replace(/\s/g, ' ');

// Full-width card: four figures, then the last year of contributions as a heatmap.
function activity() {
  const w = 1200, h = 534, col = (w - 2 * X) / 4, cell = 16, step = 20, hy = 300;
  const year = GH.updated.slice(0, 4), [, m, d] = GH.updated.split('-');
  const figures = [
    [nb(GH.total), `CONTRIBUTIONS DEPUIS ${GH.since}`, C.text],
    [`${GH.current} j`, 'SÉRIE EN COURS', 'url(#hot)'],
    [`${GH.longest} j`, 'MEILLEURE SÉRIE', C.text],
    [nb(GH.commitsThisYear), `COMMITS EN ${year}`, C.text],
  ].map(([value, label, fill], i) => `${text(value, { x: X + i * col, y: 238, size: 52, font: F.semi, tracking: -0.03, fill })}
${mono(label, { x: X + i * col, y: 268, size: 13, tracking: 0.12 })}`).join('\n');
  // Levels follow the quartiles of the active days, like GitHub's own calendar.
  const active = GH.weeks.flat().filter(Boolean).sort((a, b) => a - b);
  const q = [0.25, 0.5, 0.75].map(f => active[Math.floor(f * (active.length - 1))] ?? 0);
  const level = n => !n ? 0 : n <= q[0] ? 1 : n <= q[1] ? 2 : n <= q[2] ? 3 : 4;
  const ox = X + (w - 2 * X - (GH.weeks.length * step - (step - cell))) / 2;
  let last = null;
  const cells = GH.weeks.map((week, c) => week.map((n, r) => {
    const x = ox + c * step, y = hy + r * step;
    if (n) last = [x, y];
    return `<rect x="${r1(x)}" y="${y}" width="${cell}" height="${cell}" rx="4" fill="${HEAT[level(n)]}"/>`;
  }).join('')).join('\n');
  const legend = HEAT.map((c, i) => `<rect x="${w - X - 52 - (HEAT.length - i) * 20}" y="${h - M - PAD - 13}" width="${cell}" height="${cell}" rx="4" fill="${c}"/>`).join('');
  const defs = `${linear('hot', ['#ffd27a', '#fba541'])}\n${radial('glow', 120, 0, 560, [[0, C.accent, 0.07], [1, C.accent, 0]])}`;
  const body = `<rect width="${w}" height="${h}" fill="url(#glow)"/>
${twoTone([['Mon ', C.text], ['activité.', C.accent]], { x: X, y: 120, size: 50, tracking: -0.03 }).svg}
${mono(`MIS À JOUR LE ${d}.${m}.${year}`, { x: w - X, y: 118, size: 13, tracking: 0.12, anchor: 'end' })}
${figures}
${cells}
${last ? `<rect class="now" x="${r1(last[0] - 3)}" y="${last[1] - 3}" width="${cell + 6}" height="${cell + 6}" rx="6" fill="none" stroke="${C.accent}" stroke-width="1.5"/>` : ''}
${mono('12 DERNIERS MOIS', { x: X, y: h - M - PAD, size: 13, tracking: 0.12 })}
${mono('MOINS', { x: w - X - 52 - HEAT.length * 20 - 10, y: h - M - PAD, size: 13, tracking: 0.12, anchor: 'end' })}
${legend}
${mono('PLUS', { x: w - X, y: h - M - PAD, size: 13, tracking: 0.12, anchor: 'end' })}`;
  // The latest active day is outlined and breathes softly.
  const style = motion(`.now{animation:now 2.4s ease-in-out infinite}
@keyframes now{50%{opacity:.25}}`);
  return card(w, h, body, { defs, style });
}

// À propos, in the style of an iPhone settings list: one coloured icon per row.
const ABOUT = [
  ['Otaku', 'trop d’animés et de mangas', 'tv', ['#f7a8bb', '#d9607c']],
  ['Builder', 'web, devops, hosting, gaming', 'hammer', ['#ffd0a0', '#e0894f']],
  ['Partage', 'des docs claires pour aider', 'book-open-text', ['#d5c2f5', '#9b7fd6']],
  ['Énergie', 'une Monster et ma femme', 'zap', G.clover],
];

function about() {
  const defs = ABOUT.map(([, , , c], i) => linear(`t${i}`, c, [0, 0, 0, 1])).join('\n');
  const rows = ABOUT.map(([label, sub, icon], i) => {
    const base = 536 - (ABOUT.length - 1 - i) * 80, y = base - 38; // the last row lands on the shared caption baseline (536)
    return `<rect x="${X}" y="${y}" width="40" height="40" rx="10" fill="url(#t${i})"/>
<rect x="${X + 0.5}" y="${y + 0.5}" width="39" height="39" rx="9.5" fill="none" stroke="#fff" stroke-opacity=".22"/>
${lucide(icon, X + 10, y + 10, 20, '#1a110d')}
${text(label, { x: X + 54, y: base - 20, size: 19, font: F.semi })}
${text(sub, { x: X + 54, y: base, size: 15, font: F.medium, fill: C.secondary })}`;
  }).join('\n');
  const body = `${twoTone([['À ', C.text], ['propos.', C.accent]], { x: X, y: 114, size: 40 }).svg}
${text('24 ans, je fabrique des trucs.', { x: X, y: 150, size: 17, font: F.medium, fill: C.secondary })}
${mono('ANILIST ›', { x: X, y: 188, size: 14, fill: '#f7a8bb' })}
${rows}`;
  return card(400, 600, body, { defs });
}

// Small project cards: icon, mono eyebrow, two-tone title, link on the bottom baseline.
const SMALL = {
  mirum: { eyebrow: 'MIRUM ORBIS', title: ['MMORPG 2D,', 'l’univers d’Ereda.'], link: 'mirum-orbis.com ›', color: G.mirum },
  nohello: { eyebrow: 'NOHELLO', title: ['L’étiquette du', 'chat productif.'], link: 'Kaysuto/no-hello ›', color: G.nohello },
  portfolio: { eyebrow: 'PORTFOLIO', title: ['Mes réalisations', 'et contact pro.'], link: 'kaysuto.fr ›', color: G.portfolio },
};
const smallCard = name => () => {
  const { eyebrow, title, link, color } = SMALL[name], h = 360;
  const defs = radial('glow', 360, h, 300, [[0, color[1], 0.16], [1, color[1], 0]]);
  const body = `<rect width="400" height="${h}" fill="url(#glow)"/>
${appIcon(name, X, 64)}
${mono(eyebrow, { x: X + 60, y: 92 })}
${title.map((line, i) => text(line, { x: X, y: 180 + i * 40, size: 32, font: F.semi, tracking: -0.025, fill: i === title.length - 1 ? C.accent : C.text })).join('\n')}
${text(link, { x: X, y: h - M - PAD, size: 20, font: F.medium, fill: color[0] })}`;
  return card(400, h, body, { defs });
};

const out = new URL('../assets/', import.meta.url);
const CARDS = { hero, clover, commits, activity, skills, about, jelly, mirum: smallCard('mirum'), nohello: smallCard('nohello'), portfolio: smallCard('portfolio') };
for (const [name, make] of Object.entries(CARDS)) writeFileSync(new URL(`${name}.svg`, out), make());

// Layout guards: titles must stay clear of the visuals, narrow-card copy must fit its card.
let over = 0;
const fits = (label, right, limit) => { if (right > limit) { over++; console.log(`OVER ${label}: ${Math.round(right)} / ${limit}`); } };
for (const line of ['Serveur', 'Minecraft.', 'Streaming', 'sans pub.']) fits(line, X + measure(line, { size: 50, font: F.semi, tracking: -0.03 }), 420);
fits('748+', X - 5 + measure('748+', { size: 168, font: F.semi, tracking: -0.05 }), 460);
fits('clover caption', X + measure('modes, Java & Bedrock', { size: 22 }), 420);
fits('Mes commits.', X + measure('Mes commits.', { size: 40, font: F.semi, tracking: -0.025 }), 400 - X);
for (const [label] of COMMITS) fits(label, X + 48 + measure(label, { size: 19, font: F.semi }), 400 - X - 44);
fits(SKILLS_SUB, X + measure(SKILLS_SUB, { size: 22 }), 1200 - X);
for (const [eyebrow, tools] of SKILLS) {
  const col = (1200 - 2 * X) / SKILLS.length;
  fits(eyebrow, measure(eyebrow, { size: 15, font: F.mono, tracking: 0.14 }), col - 16);
  for (const [, label] of tools) fits(label, 64 + measure(label, { size: 19, font: F.semi }), col - 16);
}
for (const [label, sub] of ABOUT) fits(sub, X + 54 + measure(sub, { size: 15 }), 400 - X), fits(label, X + 54 + measure(label, { size: 19, font: F.semi }), 400 - X);
for (const { title, link, eyebrow } of Object.values(SMALL)) {
  for (const line of title) fits(line, X + measure(line, { size: 32, font: F.semi, tracking: -0.025 }), 400 - X);
  fits(link, X + measure(link, { size: 20 }), 400 - X);
  fits(eyebrow, X + 60 + measure(eyebrow, { size: 15, font: F.mono, tracking: 0.14 }), 400 - X);
}
for (const [name] of [...MODES, NEXT_MODE]) fits(name, 58 + measure(name, { size: 18, font: F.semi }), 167 - 12);
for (const [, name] of CLOVER_PARTS) fits(name, 52 + measure(name, { size: 18, font: F.semi }), 167 - 12);
fits('hero line', 600 + measure(TAGLINE.map(([t]) => t).join(''), { size: 36, tracking: -0.015 }) / 2 + 14, 1200 - X);
console.log(over ? `${over} overflow(s)` : 'all copy fits');
if (over) process.exitCode = 1;
