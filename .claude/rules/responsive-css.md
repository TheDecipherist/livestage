---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
conformance:
  - "rcss-viewport-meta :: some-contains :: **/{index.html,root.tsx,layout.tsx,_document.tsx,app.html} :: width=device-width"
---

# Responsive CSS: Mobile and Desktop at Once

Design for the small screen first and the usual failures disappear. Authoring
guidance, design-review evaluates the result.

## Clickable means cursor: pointer, always

Anything the user can click shows `cursor: pointer` on hover. No exceptions,
this is the affordance that tells a mouse user "this does something".
- Native `<a href>` gets it free; an `<a>` WITHOUT href does not, which is one
  more reason a link always carries its href.
- Buttons do NOT get it from the browser (the default is the arrow). Put
  `button { cursor: pointer }` in the base stylesheet, plus
  `button:disabled { cursor: not-allowed }`.
- Any custom clickable (a component with onClick, a `[role="button"]`, a
  clickable card or row) sets `cursor: pointer` explicitly, and a broad
  `[onclick], [role="button"], [role="link"] { cursor: pointer }` in the base
  stylesheet catches the strays.
- A CSS reset that normalizes cursors is checked before adoption: several
  popular ones set `button { cursor: default }` on purpose, which is the
  opposite of this rule.
- The inverse holds too: `cursor: pointer` on something that does nothing is
  a lie. Pointer means clickable, clickable means pointer.

- Set the viewport meta tag on every page: `<meta name="viewport" content="width=device-width, initial-scale=1" />`. Add `html { -webkit-text-size-adjust: 100%; }`.
- The flex/grid `min-width: 0` rule fixes most mysterious horizontal scroll. Flex and grid children default to `min-width: auto` and refuse to shrink below their content, so one long line or a `<pre>` pushes the layout wider than the screen. Set `min-width: 0` on the child. If you fix nothing else, fix this.
- Code blocks scroll, they do not overflow: `pre { overflow-x: auto; max-width: 100%; }` and `pre code { white-space: pre; }`. Prose breaks instead: `overflow-wrap: break-word`.
- Fluid type with `clamp()`, not fixed desktop sizes: `h1 { font-size: clamp(1.75rem, 4vw + 1rem, 3rem); }`.
- Mobile-first: base styles small, `@media (min-width: ...)` to enhance up. Desktop-first with max-width patches is how a layout works on desktop and falls apart on mobile.
- `box-sizing: border-box` globally, or `width: 100%` plus padding overflows.
- No fixed pixel widths wider than a phone. Use `max-width`, `%`, or `min(800px, 100%)`.
- `width: 100%`, not `100vw` (100vw includes the scrollbar and overflows sideways).
- Cap media: `img, video, svg { max-width: 100%; height: auto; }`, and set intrinsic width/height on every img.
- iOS: `overscroll-behavior: contain` on scroll regions to stop scroll chaining, `height: 100dvh` (not 100vh) to avoid the toolbar jump, and `font-size: 16px` on inputs so focus does not auto-zoom. Never disable pinch-zoom.
