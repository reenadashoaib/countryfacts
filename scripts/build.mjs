// Builds the static site into site/ from data/ and src/.
// Usage: npm run build   (no dependencies, no network)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(root, 'site');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const countries = JSON.parse(fs.readFileSync(path.join(root, 'data', 'countries.json'), 'utf8'));
const outlines = JSON.parse(fs.readFileSync(path.join(root, 'data', 'outlines.json'), 'utf8'));
// A flat projection can't draw the South Pole; Antarctica gets a blank map cell instead.
delete outlines.ATA;
const SITE = cfg.siteUrl.replace(/\/$/, '');
const BUILD_DATE = new Date().toISOString().slice(0, 10);

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('en-US');
const num = (n) => nf.format(n);
const fixed = (n, d = 1) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n);
function big(n) {
  if (n >= 1e12) return fixed(n / 1e12, 2) + ' trillion';
  if (n >= 1e9) return fixed(n / 1e9, 1) + ' billion';
  if (n >= 1e6) return fixed(n / 1e6, 1) + ' million';
  if (n >= 1e4) return fixed(n / 1e3, 0) + ' thousand';
  return num(n);
}
const usd = (n) => '$' + big(n);
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
const list = (arr) => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr.at(-1);
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    e.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}
const hash = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 8);

// ---------- regions ----------
const REGIONS = [
  { name: 'Africa', slug: 'africa', color: '#EAC25A' },
  { name: 'Americas', slug: 'americas', color: '#E79AA8' },
  { name: 'Asia', slug: 'asia', color: '#8CC79B' },
  { name: 'Europe', slug: 'europe', color: '#A797D6' },
  { name: 'Oceania', slug: 'oceania', color: '#6ABFC3' },
  { name: 'Antarctic', slug: 'antarctic', color: '#BFD0DA' },
];
const regionOf = Object.fromEntries(REGIONS.map((r) => [r.name, r]));
const byCode = Object.fromEntries(countries.map((c) => [c.cca3, c]));
const url = (c) => `/country/${c.slug}/`;

// ---------- derived stats ----------
function rankBy(key, getter) {
  const ranked = countries.filter((c) => getter(c) != null).sort((a, b) => getter(b) - getter(a));
  ranked.forEach((c, i) => ((c.rank ??= {})[key] = i + 1));
  return ranked;
}
for (const c of countries) {
  c.density = c.population && c.area ? c.population.value / c.area : null;
}
const RANK = {
  population: rankBy('population', (c) => c.population?.value),
  area: rankBy('area', (c) => c.area),
  density: rankBy('density', (c) => c.density),
  gdp: rankBy('gdp', (c) => c.gdp?.value),
  gdpPerCapita: rankBy('gdpPerCapita', (c) => c.gdpPerCapita),
};
const withBoth = countries.filter((c) => c.population && c.area);
const worldDensity = withBoth.reduce((s, c) => s + c.population.value, 0) / withBoth.reduce((s, c) => s + c.area, 0);
const currencyUsers = {};
for (const c of countries) for (const cur of c.currencies) (currencyUsers[cur.code] ??= []).push(c);

// ---------- assets ----------
fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(root, 'src', 'assets'), path.join(OUT, 'assets'));
const V = {
  css: hash(path.join(root, 'src/assets/css/style.css')),
  ads: hash(path.join(root, 'src/assets/js/ads.js')),
  app: hash(path.join(root, 'src/assets/js/app.js')),
};

// Country outline images (tinted per region) for grids.
for (const c of countries) {
  const d = outlines[c.cca3];
  if (!d) continue;
  const col = regionOf[c.region]?.color ?? '#BFD0DA';
  write(`assets/outlines/${c.cca3.toLowerCase()}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path d="${d}" fill="${col}" stroke="#173E63" stroke-width="1.2" stroke-linejoin="round" fill-rule="evenodd"/></svg>`);
}

// Ad runtime config: everything the browser needs from site.config.json.
const adRuntime = {
  client: cfg.adsense.client,
  slots: cfg.adsense.slots,
  tileLayoutKey: cfg.adsense.tileLayoutKey,
  showPlaceholders: cfg.showPlaceholders,
  corner: cfg.corner,
  popup: cfg.popup,
};
write('assets/js/ads-config.js', `window.CF_ADS = ${JSON.stringify(adRuntime, null, 2)};\n`);
const V_cfg = crypto.createHash('sha1').update(JSON.stringify(adRuntime)).digest('hex').slice(0, 8);

// ---------- template ----------
const ad = (name, size, extra = '') =>
  `<div class="ad ad--${size}${extra}" data-ad="${name}" data-size="${size}"><span class="ad__label">Advertisement</span><div class="ad__slot"></div></div>`;

const NAV = [
  ['Countries', '/'],
  ...REGIONS.slice(0, 5).map((r) => [r.name, `/region/${r.slug}/`]),
  ['Rankings', '/rankings/'],
  ['Flag quiz', '/quiz/'],
];

const LOGO = `<svg class="logo__mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14.5" fill="#6ABFC3" stroke="#173E63" stroke-width="2"/><path d="M16 1.5v29M1.5 16h29M4 9h24M4 23h24M16 1.5c-6 7-6 22 0 29M16 1.5c6 7 6 22 0 29" fill="none" stroke="#173E63" stroke-width="1.4"/></svg>`;

function page({ title, description, pathName, body, current = '', noindex = false, wide = false }) {
  const canonical = SITE + pathName;
  const client = cfg.adsense.client;
  const adsenseHead = client
    ? `<meta name="google-adsense-account" content="${esc(client)}">\n<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(client)}" crossorigin="anonymous"></script>`
    : '';
  const nav = NAV.map(([label, href]) =>
    `<a href="${href}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.siteName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta name="theme-color" content="#173E63">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&display=swap">
<link rel="stylesheet" href="/assets/css/style.css?v=${V.css}">
${adsenseHead}
<script src="/assets/js/ads-config.js?v=${V_cfg}"></script>
<script defer src="/assets/js/ads.js?v=${V.ads}"></script>
<script defer src="/assets/js/app.js?v=${V.app}"></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <div class="masthead__inner">
    <a class="logo" href="/">${LOGO}<span>${esc(cfg.siteName)}</span></a>
    <nav class="nav" aria-label="Main">${nav}</nav>
    <a class="random" href="/" data-random>Random country</a>
  </div>
</header>
<div class="topband">${ad('top', 'leaderboard')}</div>
<div class="frame${wide ? ' frame--wide' : ''}">
  <aside class="rail rail--left" aria-label="Advertisement">${ad('railLeft', 'skyscraper')}</aside>
  <main id="main" class="main">
${body}
  </main>
  <aside class="rail rail--right" aria-label="Advertisement">${ad('railRight', 'halfpage')}</aside>
</div>
<div class="footband">${ad('footer', 'leaderboard')}</div>
<footer class="footer">
  <div class="footer__inner">
    <p class="footer__brand">${LOGO}<span>${esc(cfg.siteName)}</span></p>
    <nav class="footer__nav" aria-label="Site">
      <a href="/about/">About</a><a href="/privacy/">Privacy policy</a><a href="/terms/">Terms of use</a><a href="/contact/">Contact</a><a href="/sitemap.xml">Sitemap</a>
    </nav>
    <p class="footer__note">Population and GDP figures come from the World Bank. Country details come from the mledoze/countries dataset (ODbL). <a href="/about/#sources">Read about our sources</a>.</p>
  </div>
</footer>
</body>
</html>
`;
}

// ---------- shared fragments ----------
const flag = (c, w = 40) =>
  `<img class="flag" src="/assets/flags/${c.cca2.toLowerCase()}.svg" width="${w}" height="${Math.round(w * 0.75)}" alt="Flag of ${esc(c.name)}" loading="lazy" decoding="async">`;

function tile(c) {
  const r = regionOf[c.region];
  const shape = outlines[c.cca3]
    ? `<img class="tile__shape" src="/assets/outlines/${c.cca3.toLowerCase()}.svg" width="200" height="200" alt="" loading="lazy" decoding="async">`
    : `<span class="tile__shape tile__shape--none"></span>`;
  const search = [c.name, c.official, ...c.native, ...c.capital, c.cca2, c.cca3].join(' ').toLowerCase();
  const pop = c.population ? `${big(c.population.value)} people` : 'Population not published';
  return `<a class="tile" href="${url(c)}" data-search="${esc(search)}" data-region="${esc(c.region)}" style="--region:${r?.color}">
${shape}<span class="tile__flag">${flag(c, 28)}</span><span class="tile__name">${esc(c.name)}</span><span class="tile__meta">${c.capital.length ? esc(c.capital[0]) : 'No capital'}</span><span class="tile__meta">${pop}</span></a>`;
}
const adTile = () => ad('tile', 'tile', ' tile tile--ad');

function grid(items, every = 11) {
  let out = '', n = 0;
  for (const c of items) {
    out += tile(c);
    if (++n % every === 0 && n < items.length) out += adTile();
  }
  if (items.length < every) out += adTile();
  return `<div class="grid">${out}</div>`;
}

const GRATICULE = `<defs><pattern id="grat" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#CBD8E0" stroke-width="0.6"/></pattern></defs><rect width="200" height="200" fill="url(#grat)"/>`;
function coord([lat, lng]) {
  const la = `${Math.abs(Math.round(lat))}°${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(Math.round(lng))}°${lng >= 0 ? 'E' : 'W'}`;
  return `${la} ${lo}`;
}

// ---------- country pages ----------
function nearestBySize(c) {
  if (!c.area) return null;
  let best = null;
  for (const o of countries) {
    if (o === c || !o.area) continue;
    const d = Math.abs(Math.log(o.area / c.area));
    if (!best || d < best.d) best = { o, d };
  }
  return best?.o;
}

function story(c) {
  const p = [];
  const N = (k) => RANK[k].length;
  const name = esc(c.name);
  if (c.area && c.rank?.population) {
    p.push(`${name} is the ${ordinal(c.rank.area)} largest of the ${N('area')} countries and territories on this site by area, and the ${ordinal(c.rank.population)} largest by population.`);
  } else if (c.area) {
    p.push(`${name} is the ${ordinal(c.rank.area)} largest of the ${N('area')} countries and territories on this site by area. The World Bank does not publish a population figure for it.`);
  }
  if (c.density) {
    const ratio = c.density / worldDensity;
    const cmp = ratio >= 1.15 ? `about ${fixed(ratio, 1)} times the world average of ${fixed(worldDensity, 0)}`
      : ratio <= 0.85 ? `well below the world average of ${fixed(worldDensity, 0)}`
      : `close to the world average of ${fixed(worldDensity, 0)}`;
    p.push(`It has roughly ${fixed(c.density, c.density < 10 ? 1 : 0)} people per square kilometre, ${cmp}.`);
  }
  if (c.population && c.population2000) {
    const ch = (c.population.value / c.population2000 - 1) * 100;
    if (Math.abs(ch) < 1) p.push(`Its population is almost the same as in 2000.`);
    else p.push(`Since 2000 its population has ${ch > 0 ? 'grown' : 'fallen'} by ${fixed(Math.abs(ch), 1)}%, from ${big(c.population2000)} to ${big(c.population.value)} in ${c.population.year}.`);
  }
  const twin = nearestBySize(c);
  if (twin) p.push(`The country closest to it in size is <a href="${url(twin)}">${esc(twin.name)}</a>, at ${num(Math.round(twin.area))} km².`);
  if (c.borders.length) {
    const ns = c.borders.map((b) => byCode[b]).filter(Boolean).map((n) => `<a href="${url(n)}">${esc(n.name)}</a>`);
    p.push(`${c.landlocked ? `${name} is landlocked and` : 'It'} shares land borders with ${plural(ns.length, 'country', 'countries')}: ${list(ns)}.`);
  } else if (c.landlocked) {
    p.push(`${name} is landlocked.`);
  } else {
    p.push(`${name} has no land borders with other countries.`);
  }
  for (const cur of c.currencies) {
    const others = (currencyUsers[cur.code] ?? []).filter((o) => o !== c).length;
    if (others) p.push(`The ${esc(cur.name)} is also used in ${plural(others, 'other country or territory', 'other countries and territories')} listed here.`);
  }
  if (c.gdpPerCapita && c.rank?.gdpPerCapita) {
    p.push(`Its economic output was about ${usd(c.gdp.value)} in ${c.gdp.year}, or ${'$' + num(c.gdpPerCapita)} per person. That ranks ${ordinal(c.rank.gdpPerCapita)} of ${N('gdpPerCapita')} by GDP per person.`);
  }
  return p.map((s) => `<p>${s}</p>`).join('\n');
}

function factRow(label, value, note = '') {
  return `<div class="fact"><dt>${label}</dt><dd>${value}${note ? `<span class="fact__note">${note}</span>` : ''}</dd></div>`;
}

function countryPage(c) {
  const r = regionOf[c.region];
  const d = outlines[c.cca3];
  const figures = [
    factRow(c.capital.length > 1 ? 'Capitals' : 'Capital', c.capital.length ? esc(c.capital.join(', ')) : 'None'),
    factRow('Population', c.population ? num(c.population.value) : 'Not published', c.population ? `World Bank, ${c.population.year}` : ''),
    factRow('Area', c.area ? `${num(Math.round(c.area))} km²` : 'Not available', c.area ? `${num(Math.round(c.area * 0.386102))} sq mi` : ''),
    factRow('People per km²', c.density ? fixed(c.density, c.density < 10 ? 1 : 0) : 'Not available'),
    factRow('GDP', c.gdp ? usd(c.gdp.value) : 'Not published', c.gdp ? `Current US$, ${c.gdp.year}` : ''),
    factRow('GDP per person', c.gdpPerCapita ? '$' + num(c.gdpPerCapita) : 'Not published'),
    factRow(c.languages.length > 1 ? 'Languages' : 'Language', c.languages.length ? esc(list(c.languages)) : 'None listed'),
    factRow(c.currencies.length > 1 ? 'Currencies' : 'Currency', c.currencies.length ? c.currencies.map((x) => `${esc(x.name)} (${esc(x.code)}${x.symbol ? ', ' + esc(x.symbol) : ''})`).join('<br>') : 'None'),
    factRow('Calling code', c.callingCode ? esc(c.callingCode) : 'None'),
    factRow('Internet domain', c.tld.length ? esc(c.tld.join(', ')) : 'None'),
    factRow('People are called', c.demonym ? esc(c.demonym) : 'Not listed'),
    factRow('Region', `<a href="/region/${r.slug}/">${esc(c.region)}</a>${c.subregion ? `<br>${esc(c.subregion)}` : ''}`),
    factRow('UN member', c.unMember ? 'Yes' : 'No'),
    factRow('Sovereign state', c.independent ? 'Yes' : 'No, a dependent territory or disputed'),
  ].join('');

  const neighbours = c.borders.map((b) => byCode[b]).filter(Boolean);
  const same = countries.filter((o) => o !== c && o.subregion && o.subregion === c.subregion && !c.borders.includes(o.cca3)).slice(0, 7);

  const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Countries</a><span aria-hidden="true">/</span><a href="/region/${r.slug}/">${esc(c.region)}</a>${c.subregion ? `<span aria-hidden="true">/</span><span>${esc(c.subregion)}</span>` : ''}</nav>
<section class="plate" style="--region:${r.color}">
  <figure class="plate__map">
    <svg viewBox="0 0 200 200" role="img" aria-label="Outline map of ${esc(c.name)}">${GRATICULE}${d ? `<path class="plate__shape" d="${d}" fill-rule="evenodd"/>` : ''}</svg>
    ${c.latlng ? `<figcaption>Centre near ${coord(c.latlng)}</figcaption>` : ''}
  </figure>
  <div class="plate__title">
    ${flag(c, 72).replace('loading="lazy"', 'loading="eager"')}
    <h1>${esc(c.name)}</h1>
    ${c.official !== c.name ? `<p class="plate__official">${esc(c.official)}</p>` : ''}
    ${c.native.length ? `<p class="plate__native" lang="">${c.native.map(esc).join(' / ')}</p>` : ''}
  </div>
</section>

<section aria-labelledby="facts-h">
  <h2 id="facts-h" class="sr-only">Key facts</h2>
  <dl class="facts">${figures}</dl>
</section>

${ad('inContent', 'rectangle', ' ad--center')}

<section class="story" aria-labelledby="story-h">
  <h2 id="story-h">${esc(c.name)} in numbers</h2>
  ${story(c)}
</section>

${neighbours.length ? `<section aria-labelledby="nb-h"><h2 id="nb-h">Neighbouring countries</h2>${grid(neighbours, 7)}</section>` : ''}
${same.length ? `<section aria-labelledby="sr-h"><h2 id="sr-h">More of ${esc(c.subregion)}</h2>${grid(same, 7)}</section>` : ''}
`;
  const desc = `${c.name} facts: capital ${c.capital[0] ?? 'none'}, population ${c.population ? big(c.population.value) : 'n/a'}, area ${c.area ? num(Math.round(c.area)) + ' km²' : 'n/a'}, languages, currency, flag and neighbours.`;
  write(`country/${c.slug}/index.html`, page({
    title: `${c.name}: capital, population, flag and facts | ${cfg.siteName}`,
    description: desc, pathName: url(c), body,
  }));
}

// ---------- home ----------
function home() {
  const chips = REGIONS.map((r) =>
    `<button type="button" class="chip" data-filter="${r.name}" aria-pressed="false" style="--region:${r.color}">${r.name}</button>`).join('');
  const body = `
<section class="hero">
  <div class="hero__text"><h1>Facts on every country, from Afghanistan to Zimbabwe</h1>
  <p class="hero__lede">${countries.length} countries and territories, with capitals, populations, flags, languages, currencies and neighbours.</p></div>
  <form class="finder" role="search" onsubmit="return false">
    <label for="q" class="sr-only">Search countries</label>
    <input id="q" type="search" placeholder="Search by country or capital" autocomplete="off" data-finder>
    <div class="chips" role="group" aria-label="Filter by region"><button type="button" class="chip" data-filter="" aria-pressed="true">All</button>${chips}</div>
    <p class="finder__count" aria-live="polite" data-count>Showing all ${countries.length}</p>
  </form>
</section>
<h2 class="sr-only">All countries</h2>
${grid(countries)}
<p class="empty" data-empty hidden></p>
`;
  write('index.html', page({
    title: `${cfg.siteName}: capitals, populations and flags of ${countries.length} countries`,
    description: `Look up any country: capital, population, area, flag, languages, currency, GDP and neighbours for ${countries.length} countries and territories.`,
    pathName: '/', body, current: '/',
  }));
}

// ---------- regions ----------
function regionPage(r) {
  const members = countries.filter((c) => c.region === r.name);
  if (!members.length) return;
  const pop = members.reduce((s, c) => s + (c.population?.value ?? 0), 0);
  const area = members.reduce((s, c) => s + (c.area ?? 0), 0);
  const largest = [...members].sort((a, b) => (b.area ?? 0) - (a.area ?? 0))[0];
  const popular = [...members].sort((a, b) => (b.population?.value ?? 0) - (a.population?.value ?? 0))[0];
  const subs = [...new Set(members.map((c) => c.subregion || r.name))].sort();
  const sections = subs.map((s) => {
    const m = members.filter((c) => (c.subregion || r.name) === s);
    return `<section aria-labelledby="sub-${s.replace(/\W/g, '')}"><h2 id="sub-${s.replace(/\W/g, '')}">${esc(s)} <span class="count">${m.length}</span></h2>${grid(m)}</section>`;
  }).join(ad('inContent', 'leaderboard', ' ad--center'));
  const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Countries</a><span aria-hidden="true">/</span><span>${r.name}</span></nav>
<section class="region-head" style="--region:${r.color}">
  <h1>Countries of ${r.name}</h1>
  <dl class="facts facts--compact">
    ${factRow('Countries and territories', members.length)}
    ${pop ? factRow('Combined population', big(pop)) : ''}
    ${factRow('Combined area', `${num(Math.round(area))} km²`)}
    ${factRow('Largest by area', `<a href="${url(largest)}">${esc(largest.name)}</a>`)}
    ${popular.population ? factRow('Most people', `<a href="${url(popular)}">${esc(popular.name)}</a>`) : ''}
  </dl>
</section>
${sections}`;
  write(`region/${r.slug}/index.html`, page({
    title: `Countries of ${r.name}: list with capitals and populations | ${cfg.siteName}`,
    description: `All ${members.length} countries and territories of ${r.name}, grouped by subregion, with capitals, populations and flags.`,
    pathName: `/region/${r.slug}/`, body, current: `/region/${r.slug}/`,
  }));
}

// ---------- rankings ----------
const RANKINGS = [
  { slug: 'population', title: 'Countries by population', key: 'population', head: 'Population', val: (c) => num(c.population.value), raw: (c) => c.population.value, note: 'World Bank estimates, latest year available.' },
  { slug: 'area', title: 'Countries by area', key: 'area', head: 'Area (km²)', val: (c) => num(Math.round(c.area)), raw: (c) => c.area, note: 'Total area including inland water.' },
  { slug: 'density', title: 'Countries by population density', key: 'density', head: 'People per km²', val: (c) => fixed(c.density, 1), raw: (c) => c.density, note: 'Population divided by total area.' },
  { slug: 'gdp', title: 'Countries by GDP', key: 'gdp', head: 'GDP (US$)', val: (c) => usd(c.gdp.value), raw: (c) => c.gdp.value, note: 'World Bank, current US dollars, latest year available.' },
  { slug: 'gdp-per-person', title: 'Countries by GDP per person', key: 'gdpPerCapita', head: 'GDP per person (US$)', val: (c) => '$' + num(c.gdpPerCapita), raw: (c) => c.gdpPerCapita, note: 'GDP divided by population for the same year.' },
];

function rankingPage(R) {
  const rows = RANK[R.key];
  const max = R.raw(rows[0]);
  let tr = '';
  rows.forEach((c, i) => {
    const w = Math.max(0.5, (R.raw(c) / max) * 100);
    tr += `<tr style="--region:${regionOf[c.region].color}"><td class="num">${i + 1}</td><td><a href="${url(c)}">${flag(c, 24)}<span>${esc(c.name)}</span></a></td><td class="region">${esc(c.region)}</td><td class="num">${R.val(c)}</td><td class="bar" aria-hidden="true"><span style="width:${w.toFixed(1)}%"></span></td></tr>\n`;
    if ((i + 1) % 30 === 0 && i + 1 < rows.length) tr += `<tr class="ad-row"><td colspan="5">${ad('inContent', 'leaderboard', ' ad--center')}</td></tr>\n`;
  });
  const others = RANKINGS.filter((x) => x !== R).map((x) => `<a href="/rankings/${x.slug}/">${x.title}</a>`).join('');
  const body = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="/rankings/">Rankings</a><span aria-hidden="true">/</span><span>${R.title}</span></nav>
<h1>${R.title}</h1>
<p class="lede">${rows.length} countries and territories, ranked. ${R.note}</p>
<div class="table-wrap"><table class="rank">
<thead><tr><th scope="col" class="num">Rank</th><th scope="col">Country</th><th scope="col">Region</th><th scope="col" class="num">${R.head}</th><th scope="col"><span class="sr-only">Relative size</span></th></tr></thead>
<tbody>
${tr}</tbody></table></div>
<nav class="see-also" aria-label="Other rankings"><h2>Other rankings</h2>${others}</nav>`;
  write(`rankings/${R.slug}/index.html`, page({
    title: `${R.title} (${rows.length} ranked) | ${cfg.siteName}`,
    description: `${R.title}: a ranked list of ${rows.length} countries and territories. ${R.note}`,
    pathName: `/rankings/${R.slug}/`, body, current: '/rankings/',
  }));
}

function rankingsIndex() {
  const items = RANKINGS.map((R) => {
    const top = RANK[R.key].slice(0, 3).map((c) => `<a href="${url(c)}">${esc(c.name)}</a>`);
    return `<li><a class="rank-link" href="/rankings/${R.slug}/">${R.title}</a><p>Top three: ${list(top)}.</p></li>`;
  }).join('');
  const body = `<h1>Country rankings</h1><p class="lede">See how countries compare on size, people and economy.</p><ul class="rank-list">${items}</ul>${ad('inContent', 'rectangle', ' ad--center')}`;
  write('rankings/index.html', page({
    title: `Country rankings | ${cfg.siteName}`,
    description: 'Rank the world’s countries by population, area, density, GDP and GDP per person.',
    pathName: '/rankings/', body, current: '/rankings/',
  }));
}

// ---------- quiz ----------
function quiz() {
  const pool = countries.filter((c) => c.independent).map((c) => ({ n: c.name, f: c.cca2.toLowerCase(), u: url(c), r: c.region }));
  write('assets/data/quiz.json', JSON.stringify(pool));
  const body = `
<h1>Flag quiz</h1>
<p class="lede">Name the country from its flag. ${pool.length} sovereign states, picked at random.</p>
<section class="quiz" data-quiz aria-live="polite">
  <div class="quiz__flag"><img data-quiz-flag alt="Flag to identify" width="320" height="240"></div>
  <div class="quiz__options" data-quiz-options></div>
  <p class="quiz__result" data-quiz-result></p>
  <div class="quiz__bar"><p class="quiz__score" data-quiz-score>Score 0 of 0</p><button type="button" class="button" data-quiz-next>Next flag</button></div>
  <noscript><p>The quiz needs JavaScript. You can still <a href="/">browse every country</a>.</p></noscript>
</section>
${ad('inContent', 'leaderboard', ' ad--center')}`;
  write('quiz/index.html', page({
    title: `Flag quiz: guess the country | ${cfg.siteName}`,
    description: `Test yourself on the flags of ${pool.length} countries. Pick the right country from four choices.`,
    pathName: '/quiz/', body, current: '/quiz/',
  }));
}

// ---------- static pages ----------
function prose(slug, title, description, html) {
  write(`${slug}/index.html`, page({ title: `${title} | ${cfg.siteName}`, description, pathName: `/${slug}/`, body: `<article class="prose"><h1>${title}</h1>${html}</article>` }));
}

function staticPages() {
  const email = esc(cfg.contactEmail);
  prose('about', 'About this site', `About ${cfg.siteName} and where its data comes from.`, `
<p>${esc(cfg.siteName)} is a quick reference for ${countries.length} countries and territories. Each page lists the capital, population, area, languages, currency, calling code and neighbours, with a short summary of how the country compares with others.</p>
<h2 id="sources">Where the data comes from</h2>
<ul>
<li><strong>Population and GDP:</strong> the World Bank's World Development Indicators (licensed CC BY 4.0), via the <a href="https://github.com/datasets/population">datasets/population</a> and <a href="https://github.com/datasets/gdp">datasets/gdp</a> packages. Figures are for the latest year the World Bank has published. Some territories, such as Taiwan and Vatican City, have no World Bank figures, so we show them as not published.</li>
<li><strong>Names, capitals, languages, currencies, borders and area:</strong> the <a href="https://github.com/mledoze/countries">mledoze/countries</a> dataset, made available under the <a href="https://opendatacommons.org/licenses/odbl/1-0/">Open Database License</a>. Country outlines are drawn from the same project's boundary files.</li>
<li><strong>Flags:</strong> <a href="https://github.com/lipis/flag-icons">flag-icons</a> by Panayiotis Lipiridis (MIT License).</li>
</ul>
<p>Rankings and comparisons are calculated from these sources. Borders and names follow the dataset and are not a statement on any territorial dispute. Pages were last rebuilt on ${BUILD_DATE}.</p>
<p>Spotted a mistake? <a href="/contact/">Tell us</a>.</p>`);

  prose('privacy', 'Privacy policy', `How ${cfg.siteName} uses cookies and data, including for advertising.`, `
<p>Last updated ${BUILD_DATE}.</p>
<p>${esc(cfg.siteName)} does not ask you to create an account and does not collect your name or email address unless you write to us.</p>
<h2>Advertising and cookies</h2>
<p>This site shows ads. Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this website or other websites. Google's use of advertising cookies enables it and its partners to serve ads to you based on your visit to this site and/or other sites on the internet.</p>
<p>You can opt out of personalised advertising by visiting <a href="https://www.google.com/settings/ads">Google Ads Settings</a>, or opt out of some third-party vendors' use of cookies for personalised advertising at <a href="https://www.aboutads.info/choices/">www.aboutads.info</a>. Read <a href="https://policies.google.com/technologies/partner-sites">how Google uses information from sites that use its services</a>.</p>
<p>If you are in the European Economic Area, the UK or Switzerland, we ask for your consent before personalised ads are shown, and you can change your choice at any time from the privacy message link.</p>
<h2>Information stored in your browser</h2>
<p>We store a small counter of pages viewed and the time an ad was last shown in your browser's local storage, so full-screen ads are not shown too often. This never leaves your device.</p>
<h2>Server logs</h2>
<p>Our hosting provider, Cloudflare, processes standard request data such as IP address and browser type to deliver and protect the site.</p>
<h2>Contact</h2>
<p>Questions about privacy: <a href="mailto:${email}">${email}</a>.</p>`);

  prose('terms', 'Terms of use', `Terms for using ${cfg.siteName}.`, `
<p>Last updated ${BUILD_DATE}.</p>
<p>The information on this site is provided for general reference. We work to keep it accurate but cannot guarantee it is complete or current, so check official sources before relying on it for decisions.</p>
<p>Data on this site is derived from sources listed on the <a href="/about/">about page</a> and remains subject to their licences. Links to other websites are provided for convenience; we are not responsible for their content.</p>`);

  prose('contact', 'Contact', `Get in touch with ${cfg.siteName}.`, `
<p>For corrections, suggestions or advertising enquiries, email <a href="mailto:${email}">${email}</a>.</p>
<p>When reporting a correction, include the country and a link to a source, and we will update the page.</p>`);

  write('404.html', page({
    title: `Page not found | ${cfg.siteName}`, description: 'This page does not exist.', pathName: '/404.html', noindex: true,
    body: `<article class="prose"><h1>This page is not on the map</h1><p>The address may be mistyped, or the page has moved. Search for a country from the <a href="/">home page</a>, or try a <a href="/" data-random>random country</a>.</p></article>`,
  }));
}

// ---------- site files ----------
function siteFiles() {
  const urls = ['/', '/rankings/', '/quiz/', '/about/', '/privacy/', '/terms/', '/contact/',
    ...REGIONS.filter((r) => countries.some((c) => c.region === r.name)).map((r) => `/region/${r.slug}/`),
    ...RANKINGS.map((R) => `/rankings/${R.slug}/`),
    ...countries.map(url)];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE}${u}</loc><lastmod>${BUILD_DATE}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  const pub = cfg.adsense.client.replace(/^ca-/, '');
  write('ads.txt', pub
    ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`
    : `# Add your AdSense publisher ID to site.config.json (adsense.client) and rebuild.\n`);
  write('_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN

/assets/css/*
  Cache-Control: public, max-age=31536000, immutable

/assets/js/*
  Cache-Control: public, max-age=31536000, immutable

/assets/flags/*
  Cache-Control: public, max-age=2592000

/assets/outlines/*
  Cache-Control: public, max-age=2592000

/assets/data/*
  Cache-Control: public, max-age=86400
`);
  // Random-country list for the header button.
  write('assets/data/slugs.json', JSON.stringify(countries.map((c) => c.slug)));
}

home();
REGIONS.forEach(regionPage);
countries.forEach(countryPage);
RANKINGS.forEach(rankingPage);
rankingsIndex();
quiz();
staticPages();
siteFiles();
console.log(`Built ${countries.length} country pages into site/`);
