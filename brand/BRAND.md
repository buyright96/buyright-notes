# BuyRight Notes brand kit, v1 (September 23, 2026)

Open `index.html` on a phone to see everything below in place. Tokens live in `brand.css`; every storefront page imports it first.

## Idea

A note left by someone who measured. The mood is a lamplit room at night: deep espresso surfaces, bone-colored words, one ember light on the thing you should tap. Calm, warm, certain. Apple's restraint with a softer voice.

## Logo

- `logo-mark.svg`: a dog-eared note with a single check stroke that exits toward the fold. Use at 24 px and up.
- `logo-lockup.svg` (dark) and `logo-lockup-paper.svg` (light): mark plus "BuyRight *Notes*" in Fraunces. The wordmark uses a web font; for print or places that block fonts, open the SVG in a browser and export a PNG, or convert the text to outlines in Inkscape or Figma.
- `favicon.svg`: the mark inside a rounded ink square. Also the social avatar.
- Clear space equals the fold height. Do not rotate, add shadows, recolor to blue, or place on busy photos.

## Color

| Token | Hex | Job |
|---|---|---|
| ink-950 / 900 / 800 | #14100D / #1C1714 / #27201B | page, surface, card |
| bone / bone-2 / bone-3 | #F3E7D6 / #CDBBA6 / #8F7F6D | text, quiet text, faint |
| ember / ember-2 / ember-deep | #F0A458 / #FFC68A / #C9782E | the one button, glow and check, fold |
| blush / clay | #F3B8A0 / #C96A4A | warmth, hot-deal dot |
| sage | #A7BFA0 | a checked fact |
| paper / paper-ink | #F6EEE3 / #241C17 | light theme for graphics |

Rule: dark carries 90% of the screen, ember lights one action per view. Set `data-theme="paper"` on `<html>` for the light version.

## Type

- Display and headlines: **Fraunces** (variable; optical size and SOFT axis set per level).
- UI and body: **Bricolage Grotesque**.
- Reason-to-buy lines: Fraunces italic, in quotes, one sentence.
- Loaded from Google Fonts with `display=swap`. For the production storefront, self-host the two font files and preload the display weight to protect LCP.

## Components in brand.css

`.btn-primary` (Check today's price), `.btn-ghost` (Read the guide), `.btn-quiet` (Shuffle), `.chip` and `.chip-hot`, `.card` with `.card-media` and `.card-body`, `.disclosure`, `.reel` (scroll-snap, next card peeks), `.reveal` (scroll-driven rise, progressive), `.grain` (one film-grain overlay per page), and the hidden `.slot-price`, `.slot-rating`, `.slot-badge` that only render with `data-ready`, which the Creators API integration sets.

## Motion

- Slot settle: `--ease-settle` overshoot, 720 ms, played once per reel on first view and again on Shuffle. Reels never auto-advance.
- Reveals: CSS `animation-timeline: view()` where supported; static elsewhere.
- Everything collapses under `prefers-reduced-motion: reduce`.

## Voice

Short, specific, kind. Say what fits, who it is for, what was checked and when. Never invent a rating, quote a price, or promise a deal. Examples are in `index.html`, section 07.

## Rules that never bend

Disclosure near the first Amazon link. No Amazon images, prices, star ratings, review counts or badges unless served through the Creators API (Program Policies clause t and the pricing clause). Plain tagged links opened by a real tap, no redirects or shorteners. Every card has an original line and a guide link. Generated art never impersonates the exact product. Tagged links go live only after the site is on the Associates website list with its own tracking ID.
