# Country Facts

A static website with facts on 250 countries and territories: capitals, population, area, GDP, languages, currencies, flags, outline maps and neighbours. It also has region pages, five rankings and a flag quiz. Every page has ad slots ready for Google AdSense.

The finished site is plain HTML, CSS and JavaScript in `site/`. Nothing runs on a server.

## What's where

| Path | What it is |
| --- | --- |
| `site/` | The built website. This is what you deploy. |
| `site.config.json` | Site name, URL, contact email and **all ad settings**. |
| `src/assets/` | Stylesheet, scripts, favicon and flag images. |
| `scripts/build.mjs` | Generates `site/` from the data and `site.config.json`. |
| `scripts/prepare-data.mjs` | Refreshes `data/` from the open-data sources (rarely needed). |
| `data/` | Prepared country data and outline shapes. |

After changing `site.config.json` or anything in `src/`, rebuild:

```bash
npm run build
```

To look at the site locally:

```bash
npm run preview
```

Then open http://localhost:8080.

## Deploy on Cloudflare

Before the first deploy, set `siteUrl` in `site.config.json` to your real domain and rebuild. The sitemap, canonical links and `robots.txt` use it.

**Cloudflare Pages (connect the GitHub repo):** in the Cloudflare dashboard go to Workers & Pages, create a Pages project from this repository, and use:

- Build command: `npm run build`
- Build output directory: `site`

**Cloudflare Workers (from your computer):** `wrangler.jsonc` is already set up to serve `site/`.

```bash
npx wrangler deploy
```

`site/_headers` sets caching and basic security headers, and `site/404.html` is the not-found page. Both work on Pages and Workers.

## Ad slots

| Slot | Where | Config key |
| --- | --- | --- |
| Top banner | Under the header on every page | `adsense.slots.top` |
| Footer banner | Above the footer on every page | `adsense.slots.footer` |
| Left vertical banner (160 × 600) | Sticky, screens 1280px and wider | `adsense.slots.railLeft` |
| Right vertical banner (300 × 600) | Sticky, screens 1000px and wider | `adsense.slots.railRight` |
| Tile ads | Inside every country grid, one per 11 tiles | `adsense.slots.tile` (+ `tileLayoutKey` for in-feed units) |
| In-content ads | Country pages, region pages, between ranking rows | `adsense.slots.inContent` |
| Bottom-right video | Slides in after a few seconds; closable | `corner` |
| Full-screen ad | Between page views; closable | `popup` |

Until a slot has an ID, it shows a labelled "Ad space" box so you can see the layout. Set `showPlaceholders` to `false` to hide empty slots instead.

### Connecting AdSense

1. Add your site in AdSense and copy your publisher ID (`ca-pub-…`) into `adsense.client`.
2. Rebuild. This adds the AdSense script and the `google-adsense-account` meta tag to every page and writes your line into `site/ads.txt`, which AdSense checks.
3. Once approved, create a display ad unit in AdSense for each slot (and an in-feed unit for tiles if you like) and paste each unit's `data-ad-slot` number into `adsense.slots`. Rebuild and deploy.
4. In AdSense, under Privacy & messaging, turn on the consent message for European visitors. Google requires a certified consent tool for the EEA, UK and Switzerland, and the AdSense one is free.

### The video and full-screen slots

AdSense doesn't allow its ad code inside pop-ups or custom floating boxes, so these two slots never load AdSense units. They are for ads you sell directly or a video ad partner:

- **Bottom-right video:** set `corner.video.src` (an MP4 URL, plays muted) and `corner.video.clickUrl`, or paste a video partner's player tag into `corner.html`. It is hidden on phones unless `corner.showOnMobile` is `true`.
- **Full-screen ad:** with `popup.mode` set to `"custom"`, it appears when a visitor clicks to another page, once every `everyHours`, and only after `afterPageviews` pages. Set `popup.creative.image` and `clickUrl` for your ad. Visitors can close it straight away.
- **To use AdSense's own full-screen ads instead,** set `popup.mode` to `"adsense-vignette"` and turn on vignette ads in AdSense under Ads → Auto ads. Anchor and side-rail Auto ads are AdSense's version of sticky ads.

Keep ads behind the [Better Ads Standards](https://www.betterads.org/standards/): no countdowns before the close button, no sound on autoplay, and sticky ads no taller than 30% of the screen. Chrome blocks all ads on sites that repeatedly break them. The slots here are built to fit these rules, so check any creative you add against them.

## Data sources and licences

- Population and GDP: World Bank World Development Indicators (CC BY 4.0), via [datasets/population](https://github.com/datasets/population) and [datasets/gdp](https://github.com/datasets/gdp).
- Country details and outlines: [mledoze/countries](https://github.com/mledoze/countries), Open Database License (ODbL). The about page carries the required attribution; keep it.
- Flags: [flag-icons](https://github.com/lipis/flag-icons), MIT License (`src/assets/flags/LICENSE`).

To refresh the data, download those sources into one folder (see the header of `scripts/prepare-data.mjs` for the layout) and run:

```bash
node scripts/prepare-data.mjs /path/to/sources && npm run build
```
