# Design notes

The site is styled as an atlas: each country is a plate showing its outline on a latitude/longitude grid. That plate is the one bold element; everything else stays plain.

## Tokens

| Role | Value |
| --- | --- |
| Paper (background) | `#F1F5F7`, a cool chart-paper white |
| Ink (text, header) | `#173E63`, ocean blue |
| Grid lines | `#CBD8E0` |
| Links and focus | `#2F6E9E` |
| Region fills | Africa `#EAC25A`, Americas `#E79AA8`, Asia `#8CC79B`, Europe `#A797D6`, Oceania `#6ABFC3`, Antarctic `#BFD0DA` |

Region colours follow political-map pastels and always appear with the region's name (chips, ranking tables, breadcrumbs), never on their own.

Type: Bricolage Grotesque, condensed and heavy, for country names and figures; Atkinson Hyperlegible for body text and data. The scale is a 1.25 ratio from 17px.

## Rules

- Country grids are one continuous index sheet with shared grid lines, not separate floating cards.
- No all-caps labels, no eyebrow text above headings, no decorative gradients or drop shadows (the corner ad's shadow is the only one, to lift it off the page).
- No motion on page load. The only animation is the corner ad sliding in, and it is turned off for people who prefer reduced motion.
- Ad slots reserve their size up front so the page does not jump when ads load, and every ad carries an "Advertisement" label.

## Checks done

Reviewed against the `frontend-design` and `ui-ux-pro-max` skills, then audited in a browser at 375px and 1440px: text contrast at least 4.5:1, no text under 12px, tap targets at least 24px, no sideways scrolling, alt text on every image, keyboard focus visible and kept inside the full-screen ad, and Escape closes it.

`ui-ux-pro-max` suggested a blue-and-purple palette with Garamond fonts. They were not used: both are the generic default for knowledge sites, which `frontend-design` says to avoid.
