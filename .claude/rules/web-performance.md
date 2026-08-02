---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
  - "**/*.html"
  - "**/pages/**"
  - "**/components/**"
conformance:
  - "wp-no-lazy-loading-everywhere :: absent :: **/{index.html,root.tsx,layout.tsx} :: fetchpriority=.?low[^>]*hero|hero[^>]*loading=.?lazy"
---

# Web Performance: Decide It Up Front

Performance is an architecture decision made at the start, not a cleanup pass at the
end. First question for anything user-facing: what does the user need to see and
interact with first, and what can wait. Build to that split.

## Split first paint from later
- Critical (above the fold): in the initial HTML, inline the critical CSS, preload the largest image and the one critical font.
- Later: defer it. Lazy-load below-fold images and iframes with `loading="lazy"`, `defer`/`async` non-critical scripts, dynamic-import offscreen components, load analytics late.

## Don't let CSS or JS block first paint
CSS is render-blocking. Inline the above-the-fold slice, load the rest without
blocking. A `<script>` in `<head>` without `defer` blocks parsing.

## The LCP element gets priority and is never lazy-loaded
Preload the hero image, mark it `fetchpriority="high"`, serve it sized and
compressed. Do NOT put `loading="lazy"` on it, that delays the very thing LCP
measures.

## Reserve space so nothing shifts (CLS)
Always give images a `width` and `height` so the browser reserves the box before a
byte arrives, paired with `img { max-width: 100%; height: auto; }`. For backgrounds
use `aspect-ratio`. Use `font-display` with a size-adjusted fallback. CLS is mostly
"you did not reserve the space."

## Images and fonts are usually the biggest wins
- Convert images to WebP or AVIF (25 to 35 percent smaller than JPEG), served through `<picture>` with a fallback. Provide a `srcset` of widths plus `sizes` so the browser downloads only the size that fits. Vector art stays SVG, animated GIFs become video. Actually compress, a full-resolution PNG hero is the most common single perf bug.
- Fonts: self-host or preconnect, subset, preload the one critical face, do not pull four weights when you use two.

## Ship less JavaScript
JS is the most expensive byte (download, parse, run on the main thread). Prefer
built-ins and small deps, code-split so a route loads only its own code, never block
first paint or interaction on analytics. Less JavaScript beats faster JavaScript.

## Measure against a budget set at the start
Target Core Web Vitals (LCP, CLS, INP). Lighthouse for the lab number, field data
for the truth.
