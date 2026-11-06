// Merges the raw open-data sources into data/countries.json and data/outlines.json.
//
// Usage: node scripts/prepare-data.mjs <sources-dir>
//
// <sources-dir> must contain:
//   countries.json   mledoze/countries (ODbL)          github.com/mledoze/countries
//   population.csv   World Bank via datasets/population github.com/datasets/population
//   gdp.csv          World Bank via datasets/gdp        github.com/datasets/gdp
//   geo/<cca3>.geo.json   mledoze/countries data/*.geo.json
//   flags/<cca2>.svg      flag-icons (MIT) flags/4x3
//
// Run this only when you want to refresh the data. `npm run build` uses the
// prepared files in data/ and never needs the network.

import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/prepare-data.mjs <sources-dir>');
  process.exit(1);
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');

// World Bank uses XKX for Kosovo; mledoze uses UNK.
const WB_CODE = { UNK: 'XKX' };

function parseCsv(text) {
  const rows = {};
  const lines = text.trim().split(/\r?\n/).slice(1);
  for (const line of lines) {
    // "Country Name" may contain commas inside quotes; the last three fields never do.
    const parts = line.split(',');
    const value = parts.pop();
    const year = parts.pop();
    const code = parts.pop();
    if (!value) continue;
    (rows[code] ??= []).push({ year: Number(year), value: Number(value) });
  }
  for (const k in rows) rows[k].sort((a, b) => a.year - b.year);
  return rows;
}

const raw = JSON.parse(read('countries.json'));
const pop = parseCsv(read('population.csv'));
const gdp = parseCsv(read('gdp.csv'));

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const countries = raw.map((c) => {
  const wb = WB_CODE[c.cca3] ?? c.cca3;
  const popSeries = pop[wb] ?? [];
  const p = popSeries.at(-1);
  const g = (gdp[wb] ?? []).at(-1);
  const popAtGdpYear = g && popSeries.find((r) => r.year === g.year);
  const idd = c.idd?.root
    ? (c.idd.suffixes?.length === 1 ? c.idd.root + c.idd.suffixes[0] : c.idd.root)
    : null;
  const pop2000 = popSeries.find((r) => r.year === 2000);
  return {
    cca2: c.cca2,
    cca3: c.cca3,
    slug: slugify(c.name.common),
    name: c.name.common,
    official: c.name.official,
    native: [...new Set(Object.values(c.name.native ?? {}).map((n) => n.common))]
      .filter((n) => n !== c.name.common),
    capital: c.capital ?? [],
    region: c.region,
    subregion: c.subregion || null,
    languages: Object.values(c.languages ?? {}),
    currencies: Object.entries(c.currencies ?? {}).map(([code, v]) => ({ code, name: v.name, symbol: v.symbol ?? null })),
    borders: c.borders ?? [],
    area: c.area > 0 ? c.area : null,
    landlocked: !!c.landlocked,
    independent: !!c.independent,
    unMember: !!c.unMember,
    latlng: c.latlng,
    tld: c.tld ?? [],
    callingCode: idd,
    demonym: c.demonyms?.eng?.m ?? null,
    population: p ? { value: Math.round(p.value), year: p.year } : null,
    population2000: pop2000 ? Math.round(pop2000.value) : null,
    gdp: g ? { value: Math.round(g.value), year: g.year } : null,
    gdpPerCapita: g && popAtGdpYear ? Math.round(g.value / popAtGdpYear.value) : null,
  };
});

// Two countries can share a common name slug only in theory; guard anyway.
const seen = new Set();
for (const c of countries) {
  if (seen.has(c.slug)) c.slug += '-' + c.cca3.toLowerCase();
  seen.add(c.slug);
}

// ---------- outlines ----------

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

function simplify(points, tol) {
  if (points.length < 4) return points;
  const sq = tol * tol;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > max) { max = d; idx = i; }
    }
    if (max > sq && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function outline(cca3) {
  const file = path.join(src, 'geo', cca3.toLowerCase() + '.geo.json');
  if (!fs.existsSync(file)) return null;
  const gj = JSON.parse(fs.readFileSync(file, 'utf8'));
  let polys = [];
  for (const f of gj.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
  }
  if (!polys.length) return null;

  // Countries that straddle the antimeridian (Russia, Fiji, USA, Kiribati...).
  let minLon = Infinity, maxLon = -Infinity;
  for (const poly of polys) for (const [lon] of poly[0]) { minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); }
  const wrap = maxLon - minLon > 180;
  const lonOf = (lon) => (wrap && lon < 0 ? lon + 360 : lon);

  let minLat = Infinity, maxLat = -Infinity;
  for (const poly of polys) for (const [, lat] of poly[0]) { minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); }
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180) || 0.2;
  const proj = (ring) => ring.map(([lon, lat]) => [lonOf(lon) * Math.max(k, 0.2), -lat]);

  let projected = polys.map((poly) => poly.map(proj));
  const areas = projected.map((p) => ringArea(p[0]));
  const maxArea = Math.max(...areas);
  // Drop specks so the shape reads; keep at most 60 pieces.
  projected = projected
    .map((p, i) => ({ p, a: areas[i] }))
    .filter((x) => x.a >= maxArea * 0.004)
    .sort((x, y) => y.a - x.a)
    .slice(0, 60)
    .map((x) => x.p);

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of projected) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const SIZE = 200, PAD = 8;
  const scale = (SIZE - PAD * 2) / Math.max(x1 - x0, y1 - y0);
  const ox = (SIZE - (x1 - x0) * scale) / 2, oy = (SIZE - (y1 - y0) * scale) / 2;
  const fit = ([x, y]) => [(x - x0) * scale + ox, (y - y0) * scale + oy];

  let d = '';
  for (const poly of projected) {
    for (const ring of poly) {
      const pts = simplify(ring.map(fit), 0.35);
      if (pts.length < 3) continue;
      d += 'M' + pts.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join('L') + 'Z';
    }
  }
  return d;
}

const outlines = {};
for (const c of countries) {
  const d = outline(c.cca3);
  if (d) outlines[c.cca3] = d;
}

// ---------- flags ----------
const flagOut = path.join(root, 'src', 'assets', 'flags');
fs.mkdirSync(flagOut, { recursive: true });
for (const c of countries) {
  const f = path.join(src, 'flags', c.cca2.toLowerCase() + '.svg');
  if (fs.existsSync(f)) fs.copyFileSync(f, path.join(flagOut, c.cca2.toLowerCase() + '.svg'));
}

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
countries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
fs.writeFileSync(path.join(root, 'data', 'countries.json'), JSON.stringify(countries, null, 1));
fs.writeFileSync(path.join(root, 'data', 'outlines.json'), JSON.stringify(outlines));
console.log(`Prepared ${countries.length} countries, ${Object.keys(outlines).length} outlines.`);
