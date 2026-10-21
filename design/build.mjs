// Builds the profile images (../assets/*.svg). Run: npm run build
// Style: the "café" palette of kaysuto.fr (warm espresso, ivory text, sand accent), Geist for text,
// Geist Mono for labels and figures, two-tone headlines, hairline borders, dot grid and grain.
// Text is converted to outlines, so the images look the same everywhere, with no font installed.
// Fonts in design/fonts are copied from node_modules/geist/dist/fonts: Geist-SemiBold, Geist-Medium, GeistMono-Medium.
import * as hb from 'harfbuzzjs';
import { readFileSync, writeFileSync } from 'node:fs';
import * as si from 'simple-icons';

// kaysuto.fr, html[data-palette="cafe"].dark, converted from oklch.
const C = {
  bg: ['#1f1510', '#170f0b'], panel: '#241913', border: '#46352c',
  text: '#f5f1ea', muted: '#bfac98', dim: '#97836f', accent: '#d5b89c',
  green: '#52a96c', gold: '#deb516', orange: '#fba541', jelly: '#3ab0a4',
};
const GAP = 24, RADIUS = 22, PAD = 48;
const M = GAP / 2; // each image carries half the gutter, so cards line up without CSS
const X = M + PAD;

const loadFont = name => {
  const face = new hb.Face(new hb.Blob(readFileSync(new URL(`./fonts/${name}.ttf`, import.meta.url))));
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

// One line of text → a single <path>.
function text(str, { x, y, size, font = F.medium, tracking = 0, anchor = 'start', fill = C.text, extra = '' }) {
  const { glyphs, k, width } = shape(font, str, size, tracking);
  const x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const d = glyphs.map(g => font.hb.glyphToPath(g.id)
    .replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, px, py) => `${r1(x0 + g.x + px * k)},${r1(y - g.y - py * k)}`)).join('');
  return `<path d="${d}" fill="${fill}"${extra}/>`;
}

// Two-tone line, as on kaysuto.fr: "Ma stack", the last word in sand.
function twoTone(parts, { x, y, size, font = F.semi, tracking = -0.03, anchor = 'start' }) {
  const widths = parts.map(([str]) => measure(str, { size, font, tracking }) + tracking * size);
  const total = widths.reduce((a, b) => a + b, 0) - tracking * size;
  let pen = anchor === 'middle' ? x - total / 2 : anchor === 'end' ? x - total : x;
  return {
    width: total,
    svg: parts.map(([str, fill], i) => { const t = text(str, { x: pen, y, size, font, tracking, fill }); pen += widths[i]; return t; }).join('\n'),
  };
}

const mono = (str, opts) => text(str, { size: 14, font: F.mono, tracking: 0.14, fill: C.dim, ...opts });
const linear = (id, stops, [x1, y1, x2, y2] = [0, 0, 1, 0]) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) =>
    `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`;
const radial = (id, cx, cy, r, stops) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">${stops.map(([o, c, a]) =>
    `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;

// Dark brand colours fade into the panel: black logos turn white, deep colours get tinted towards white.
function onDark(hex) {
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  const l = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  if (l < 60) return C.text;
  if (l >= 120) return `#${hex}`;
  return `rgb(${rgb.map(c => Math.round(c + (255 - c) * 0.45)).join(',')})`;
}
const logo = (icon, x, y, size) =>
  `<path transform="translate(${x} ${y}) scale(${size / 24})" d="${icon.path}" fill="${onDark(icon.hex)}"/>`;
const webp = file => `data:image/webp;base64,${readFileSync(new URL(`./images/${file}`, import.meta.url)).toString('base64')}`;

// Outlined pill (tags, tools, status). Returns its width so rows can be laid out.
function pill(label, x, y, { icon, dot, h = 34, size = 15, font = F.medium, color = C.muted, fill = C.panel, tracking = 0 } = {}) {
  const pad = 14, gap = icon || dot ? (icon ? 24 : 16) : 0, w = pad * 2 + gap + measure(label, { size, font, tracking });
  const cy = y + h / 2;
  return {
    width: w,
    svg: `<rect x="${x}" y="${y}" width="${r1(w)}" height="${h}" rx="${h / 2 > 12 ? 10 : h / 2}" fill="${fill}" stroke="${C.border}"/>
${icon ? logo(icon, x + pad, cy - 8, 16) : ''}${dot ? `<circle cx="${x + pad + 4}" cy="${cy}" r="4" fill="${dot}"/>` : ''}
${text(label, { x: x + pad + gap, y: cy + size * 0.36, size, font, tracking, fill: color })}`,
  };
}
const pillRow = (items, x, y, opts) => {
  let pen = x;
  return items.map(([label, icon]) => { const p = pill(label, pen, y, { ...opts, icon }); pen += p.width + 10; return p.svg; }).join('\n');
};

// Motion: slow loops whose first frame is the finished design (images may be shown frozen).
const motion = rules => `${rules}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

// Card: espresso background, hairline border, faint highlight on the top edge.
function card(w, h, body, { defs = '', style = '' } = {}) {
  const cw = w - 2 * M, ch = h - 2 * M;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<clipPath id="clip"><rect x="${M}" y="${M}" width="${cw}" height="${ch}" rx="${RADIUS}"/></clipPath>
${linear('fill', [[0, C.bg[0]], [1, C.bg[1]]], [0, 0, 0, 1])}
${defs}
</defs>${style && `\n<style>${style}</style>`}
<g clip-path="url(#clip)">
<rect x="${M}" y="${M}" width="${cw}" height="${ch}" fill="url(#fill)"/>
${body}
<rect x="${M + RADIUS}" y="${M}" width="${cw - 2 * RADIUS}" height="1" fill="#fff" fill-opacity=".06"/>
</g>
<rect x="${M + 0.5}" y="${M + 0.5}" width="${cw - 1}" height="${ch - 1}" rx="${RADIUS - 0.5}" fill="none" stroke="${C.border}"/>
</svg>
`;
}

// The kaysuto.fr backdrop: a dot grid fading out from the centre, a sand halo and film grain.
function backdrop(w, h, { cx = w / 2, cy = 0, r = 560 } = {}) {
  return {
    defs: `<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.1" fill="#fff" fill-opacity=".09"/></pattern>
${radial('fade', w / 2, h / 2, Math.max(w, h) * 0.55, [[0, '#fff', 1], [1, '#fff', 0]])}
<mask id="dotmask"><rect width="${w}" height="${h}" fill="url(#fade)"/></mask>
${radial('halo', cx, cy, r, [[0, C.accent, 0.16], [1, C.accent, 0]])}
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`,
    body: `<rect width="${w}" height="${h}" fill="url(#dots)" mask="url(#dotmask)"/>
<rect class="halo" width="${w}" height="${h}" fill="url(#halo)"/>
<rect width="${w}" height="${h}" filter="url(#grain)" opacity=".05"/>`,
  };
}

// Figures from kaysuto.fr.
const STATS = [['24', 'ANS'], ['13', 'ANS DE CODE EN AUTODIDACTE'], ['3', 'ANS EN DATACENTER']];

function hero() {
  const w = 1200, h = 640, cx = w / 2, bd = backdrop(w, h);
  const name = 'Kimiya', nameOpts = { size: 150, font: F.semi, tracking: -0.045 };
  const nw = measure(name, nameOpts);
  const line = twoTone([['Passionné par le ', C.muted], ['code & les pixels', C.text]], { x: cx - 8, y: 430, size: 38, font: F.medium, tracking: -0.015, anchor: 'middle' });
  const caretX = cx - 8 + line.width / 2 + 8;
  const stats = STATS.map(([n, label], i) => {
    const x = cx + (i - 1) * 330;
    return `${text(n, { x, y: 532, size: 54, font: F.mono, tracking: -0.02, anchor: 'middle' })}
${mono(label, { x, y: 570, size: 15, anchor: 'middle' })}`;
  }).join('\n');
  const body = `${bd.body}
${text('Kimiya', { x: X, y: 76, size: 22, font: F.semi, tracking: -0.01 })}
${mono('PRODUCT BUILDER · FRANCE', { x: w - X, y: 75, anchor: 'end' })}
${text('Salut, je suis', { x: cx, y: 206, size: 40, font: F.medium, tracking: -0.015, anchor: 'middle', fill: C.muted })}
${text(name, { x: cx, y: 336, ...nameOpts, anchor: 'middle', fill: C.accent })}
<rect x="${r1(cx - nw / 2)}" y="358" width="${r1(nw)}" height="5" rx="2.5" fill="${C.accent}" fill-opacity=".4"/>
${line.svg}
<rect class="caret" x="${r1(caretX)}" y="400" width="3" height="40" rx="1.5" fill="${C.accent}"/>
<rect x="${cx - 420}" y="474" width="840" height="1" fill="${C.border}"/>
${stats}`;
  // The halo breathes and the caret blinks, as on the typewriter of kaysuto.fr.
  const style = motion(`.halo{animation:halo 8s ease-in-out infinite}
.caret{animation:blink 1.1s steps(1) infinite}
@keyframes halo{50%{opacity:.6}}
@keyframes blink{50%{opacity:0}}`);
  return card(w, h, body, { defs: bd.defs, style });
}

// Project cards, as on the portfolio: screenshot, status pill, title, two lines, tags, figure and link.
const PROJECTS = {
  jelly: {
    image: 'jelly.webp', zoom: 2, focus: 0.36, status: ['BETA', C.accent], title: 'Jelly',
    desc: ['Plateforme de streaming gratuite, sans pub,', 'à latence ultra-basse.'],
    tags: [['React', si.siReact], ['TypeScript', si.siTypescript], ['Supabase', si.siSupabase]],
    stat: '748', link: 'beta.playjelly.fr ↗',
  },
  clover: {
    image: 'clover-games.webp', status: ['EN DÉVELOPPEMENT', C.gold], title: 'Clover Games',
    desc: ['Serveur multiplateforme de mini-jeux Minecraft,', 'avec son launcher et son site.'],
    tags: [['Next.js', si.siNextdotjs], ['Java · Paper', si.siOpenjdk], ['Rust · Tauri', si.siTauri]],
    stat: '374', link: 'clovergames.fr ↗',
  },
  mirum: {
    image: 'mirum-orbis.webp', zoom: 2.2, focus: 0.36, status: ['EN PRODUCTION', C.green], title: 'Mirum Orbis',
    desc: ['MMORPG 2D immersif dans l’univers', 'fantastique d’Ereda.'],
    tags: [['Next.js', si.siNextdotjs], ['TypeScript', si.siTypescript], ['Supabase', si.siSupabase]],
    stat: '464', link: 'mirum-orbis.com ↗',
  },
  nohello: {
    image: 'no-hello.webp', zoom: 2, focus: 0.42, status: ['OPEN SOURCE', C.accent], title: 'NoHello',
    desc: ['L’étiquette d’un chat productif : poser', 'sa question dès le premier message.'],
    tags: [['Next.js', si.siNextdotjs], ['TypeScript', si.siTypescript], ['Tailwind CSS', si.siTailwindcss]],
    stat: '35', link: 'github.com/Kaysuto/no-hello ↗',
  },
};

const project = key => () => {
  const p = PROJECTS[key], w = 600, h = 620, iw = w - 2 * M, ih = 300;
  const z = p.zoom ?? 1, fy = p.focus ?? 0.5; // the portfolio shots are small screens on a wide canvas: zoom on them
  const defs = [
    `<clipPath id="shot"><rect x="${M}" y="${M}" width="${iw}" height="${ih}"/></clipPath>`,
    linear('veil', [[0, C.bg[0], 0], [1, C.bg[0], 1]], [0, 0, 0, 1]),
  ].join('\n');
  const status = pill(p.status[0], M + 20, M + 20, { dot: p.status[1], h: 30, size: 12, font: F.mono, tracking: 0.12, color: C.text, fill: '#1a110d' });
  const stat = twoTone([[p.stat, C.text], [' COMMITS', C.dim]], { x: X, y: 572, size: 16, font: F.mono, tracking: 0.12 });
  const body = `<g clip-path="url(#shot)"><image class="kb" x="${r1(M + iw / 2 - iw * z / 2)}" y="${r1(M + ih / 2 - ih * z * fy)}" width="${r1(iw * z)}" height="${r1(ih * z)}" preserveAspectRatio="xMidYMid slice" href="${webp(p.image)}"/></g>
<rect x="${M}" y="${M + ih - 110}" width="${iw}" height="111" fill="url(#veil)"/>
<rect x="${M}" y="${M + ih}" width="${iw}" height="1" fill="${C.border}"/>
${status.svg}
${text(p.title, { x: X, y: 372, size: 34, font: F.semi, tracking: -0.025 })}
${p.desc.map((l, i) => text(l, { x: X, y: 410 + i * 27, size: 19, fill: C.muted })).join('\n')}
${pillRow(p.tags, X, 466, { h: 32, size: 14 })}
<rect x="${X}" y="530" width="${w - 2 * X}" height="1" fill="${C.border}"/>
${stat.svg}
${mono(p.link, { x: w - X, y: 572, size: 16, tracking: 0.02, fill: C.accent, anchor: 'end' })}`;
  // Slow drift on the screenshot.
  const style = motion(`.kb{transform-origin:300px ${M + ih / 2}px;animation:kb 30s ease-in-out infinite alternate}
@keyframes kb{to{transform:scale(1.06)}}`);
  return card(w, h, body, { defs, style });
};

// Ma stack, ranked by depth like on kaysuto.fr: read from the projects' package.json / pom.xml.
const LAYERS = [
  ['L1', 'Front-end', [['TypeScript', si.siTypescript], ['React', si.siReact], ['Next.js', si.siNextdotjs], ['Tailwind CSS', si.siTailwindcss], ['Vite', si.siVite], ['shadcn/ui', si.siShadcnui]]],
  ['L2', 'Backend & données', [['Node.js', si.siNodedotjs], ['Supabase', si.siSupabase], ['PostgreSQL', si.siPostgresql], ['MySQL', si.siMysql], ['Drizzle ORM', si.siDrizzle], ['Stripe', si.siStripe], ['Better Auth', si.siBetterauth]]],
  ['L3', 'Infrastructure & DevOps', [['Linux', si.siLinux], ['Docker', si.siDocker], ['Nginx', si.siNginx], ['Proxmox', si.siProxmox], ['Pterodactyl', si.siPterodactyl], ['Cloudflare', si.siCloudflare]]],
  ['L4', 'Jeu & apps', [['Java · Paper', si.siOpenjdk], ['Rust · Tauri', si.siTauri], ['Discord.js', si.siDiscorddotjs]]],
];
const STACK_SUB = 'Rangée par profondeur, de l’interface aux serveurs qui la font tourner.';

function stack() {
  const w = 1200, lh = 116, lg = 14, top = 212, h = top + LAYERS.length * lh + (LAYERS.length - 1) * lg + PAD + M;
  const count = LAYERS.reduce((n, [, , tools]) => n + tools.length, 0);
  const bd = backdrop(w, h, { cx: w, cy: 0, r: 640 });
  const title = twoTone([['Ma ', C.text], ['stack', C.accent]], { x: X, y: 120, size: 56 });
  const layers = LAYERS.map(([id, name, tools], i) => {
    const y = top + i * (lh + lg), pw = w - 2 * X;
    return `<rect x="${X}" y="${y}" width="${pw}" height="${lh}" rx="16" fill="${C.panel}" fill-opacity=".85" stroke="${C.border}"/>
${mono(id, { x: X + 24, y: y + 38, size: 15, fill: C.accent })}
${text(name, { x: X + 64, y: y + 39, size: 20, font: F.semi, tracking: -0.01 })}
${mono(String(tools.length), { x: X + pw - 24, y: y + 38, size: 15, anchor: 'end' })}
${pillRow(tools, X + 24, y + 60, { h: 34, size: 15, fill: '#1c130f' })}`;
  }).join('\n');
  const body = `${bd.body}
${title.svg}
${mono(`${count} TECHNOLOGIES · ${LAYERS.length} STRATES`, { x: w - X, y: 118, anchor: 'end' })}
${text(STACK_SUB, { x: X, y: 162, size: 20, fill: C.muted })}
${layers}`;
  return card(w, h, body, { defs: bd.defs });
}

const ABOUT = [
  ['Otaku', 'Trop de temps sur les animés et les mangas.'],
  ['Builder', 'Des trucs simples, utiles et faciles à prendre en main.'],
  ['Partage', 'Des docs claires pour aider les autres.'],
  ['Énergie', 'Une Monster bien fraîche et ma femme.'],
];

function about() {
  const w = 600, h = 560;
  const title = twoTone([['À propos de ', C.text], ['moi', C.accent]], { x: X, y: 112, size: 40 });
  const rows = ABOUT.map(([name, desc], i) => {
    const y = 160 + i * 92;
    return `<rect x="${X}" y="${y}" width="${w - 2 * X}" height="1" fill="${C.border}"/>
${mono(String(i + 1).padStart(2, '0'), { x: X, y: y + 42, size: 15, fill: C.accent })}
${text(name, { x: X + 48, y: y + 42, size: 21, font: F.semi, tracking: -0.01 })}
${text(desc, { x: X + 48, y: y + 70, size: 17, fill: C.muted })}`;
  }).join('\n');
  const body = `${title.svg}
${mono('ANILIST ↗', { x: w - X, y: 110, fill: C.accent, anchor: 'end' })}
${rows}`;
  return card(w, h, body);
}

// Commits authored on GitHub, by project (2026-10-21; the BySolaire/playjelly mirror is not counted twice).
const COMMITS = [['Jelly', 748, C.jelly], ['Mirum Orbis', 464, C.gold], ['Clover Games', 374, C.green], ['Guides & outils', 260, C.accent], ['Portfolio', 162, C.orange]];

function commits() {
  const w = 600, h = 560, total = COMMITS.reduce((n, [, c]) => n + c, 0), width = w - 2 * X, by = 168;
  let cursor = X;
  const bar = COMMITS.map(([, count, color], i) => {
    const sw = count / total * width, gap = i < COMMITS.length - 1 ? 3 : 0;
    const seg = `<rect x="${r1(cursor)}" y="${by}" width="${r1(sw - gap)}" height="10" fill="${color}"/>`;
    cursor += sw;
    return seg;
  }).join('');
  const defs = `<clipPath id="bar"><rect x="${X}" y="${by}" width="${width}" height="10" rx="5"/></clipPath>
${linear('shine', [[0, '#fff', 0], [0.5, '#fff', 0.5], [1, '#fff', 0]])}`;
  const rows = COMMITS.map(([name, count, color], i) => {
    const y = 212 + i * 62;
    return `<rect x="${X}" y="${y}" width="${width}" height="1" fill="${C.border}"/>
<rect x="${X}" y="${y + 25}" width="12" height="12" rx="3" fill="${color}"/>
${text(name, { x: X + 28, y: y + 38, size: 19, font: F.semi, tracking: -0.01 })}
${text(String(count), { x: w - X, y: y + 38, size: 18, font: F.mono, anchor: 'end', fill: C.muted })}`;
  }).join('\n');
  const body = `${twoTone([['Mes ', C.text], ['commits', C.accent]], { x: X, y: 112, size: 40 }).svg}
${mono(`${total.toLocaleString('fr-FR').replace(/\s/g, ' ')} SUR GITHUB`, { x: w - X, y: 110, anchor: 'end' })}
<g clip-path="url(#bar)">${bar}<rect class="shine" x="${X - 90}" y="${by}" width="60" height="10" fill="url(#shine)"/></g>
${rows}`;
  const style = motion(`.shine{animation:shine 6s ease-in-out infinite}
@keyframes shine{45%,100%{transform:translateX(${width + 120}px)}}`);
  return card(w, h, body, { defs, style });
}

const out = new URL('../assets/', import.meta.url);
const CARDS = { hero, jelly: project('jelly'), clover: project('clover'), mirum: project('mirum'), nohello: project('nohello'), stack, about, commits };
for (const [name, make] of Object.entries(CARDS)) writeFileSync(new URL(`${name}.svg`, out), make());

// Layout guards: copy must stay inside its card.
let over = 0;
const fits = (label, right, limit) => { if (right > limit) { over++; console.log(`OVER ${label}: ${Math.round(right)} / ${limit}`); } };
for (const p of Object.values(PROJECTS)) {
  for (const l of p.desc) fits(l, X + measure(l, { size: 19 }), 600 - X);
  const tags = p.tags.reduce((n, [l]) => n + 28 + 24 + measure(l, { size: 14 }) + 10, 0);
  fits(`${p.title} tags`, X + tags, 600 - X);
  fits(`${p.title} footer`, X + measure(`${p.stat} COMMITS`, { size: 16, font: F.mono, tracking: 0.12 }) + 24 + measure(p.link, { size: 16, font: F.mono, tracking: 0.02 }), 600 - X);
}
for (const [, name, tools] of LAYERS) fits(name, X + 24 + tools.reduce((n, [l]) => n + 28 + 24 + measure(l, { size: 15 }) + 10, 0), 1200 - X - 24);
for (const [, desc] of ABOUT) fits(desc, X + 48 + measure(desc, { size: 17 }), 600 - X);
fits('hero line', 600 + measure('Passionné par le code & les pixels', { size: 38 }) / 2 + 12, 1200 - X);
console.log(over ? `${over} overflow(s)` : 'all copy fits');
if (over) process.exitCode = 1;
