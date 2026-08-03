---
paths:
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
conformance:
  - "a11y-no-positive-tabindex :: absent :: **/*.{tsx,jsx,html,vue,svelte} :: tab[Ii]ndex=.?[1-9]"
  - "a11y-no-bare-outline-none :: absent :: **/*.css :: outline:\s*none"
---

# Accessibility: Build It In, Don't Bolt It On

Most of it costs nothing if you use the right elements from the start. Claude's
defaults (clickable divs, missing labels, removed focus rings) are exactly what
breaks screen readers and keyboards, and are expensive to retrofit.

## Semantic HTML first, ARIA last
The native element gives keyboard support, focus, the correct role, and screen-reader
semantics for free. The first rule of ARIA is do not use ARIA when a native element
does the job. Bad ARIA is worse than none.

## Use the real element, not a clickable div
`<button>` for actions, `<a href>` for navigation. A `<div onclick>` is not focusable,
does not fire on Enter/Space, and is announced as nothing. Same for `<nav>`, `<ul>`,
`<label>`, `<input>`.

## Every interactive thing needs an accessible name
- Images: descriptive `alt`, or `alt=""` for decorative. Never omit it (that reads the filename).
- Form fields: a real `<label>` tied to the input. A placeholder is not a label.
- Icon-only buttons: an `aria-label`. The single most common missing name.

## Keyboard and focus
- Never remove the focus ring (`outline: none`) without replacing it. Use `:focus-visible`.
- Manage focus on modals and route changes. Prefer native `<dialog>` with `showModal()`. In a SPA, move focus to the new view's heading on navigation.

## Structure
- One `<h1>` per page, then `<h2>`/`<h3>` in order, do not skip levels for visual size. Use real heading elements, not a styled span.
- Landmarks: `<header>`, `<nav>`, `<main>` (one per page), `<aside>`, `<footer>`, plus a skip-to-content link. `<article>` for self-contained items, `<section>` only with a heading.

## Do not lock people out
Contrast 4.5:1 (3:1 large), never convey meaning by color alone, never disable
zoom, respect `prefers-reduced-motion`, announce dynamic changes with `aria-live`.

## Third-party components: their rendered colours are yours
Importing a vendor stylesheet (an editor, date picker, chart, auth widget)
makes its rendered colours your problem. Theming a wrapper element is NOT
enough: vendor rules routinely set `color`, `fill`, and `stroke` on
descendants directly through hashed class names, so the parent's colour is
never inherited. Icon glyphs are the usual casualty, a themed button looks
correct while the glyphs inside it ship near-invisible.
- Force `fill: currentColor` and `stroke: currentColor` on the vendor's SVGs
  (`svg`, `svg *` inside the component's wrapper) so glyphs follow their
  control's state instead of needing a colour per state.
- A vendor-styled surface is verified RENDERED, in BOTH colour schemes.
  Reading the markup proves nothing, the colour is not in the markup, it is
  in node_modules.
- Disabled states still clear the text floor. "Quieter" is not "invisible".

## Contrast is verified rendered, never by a conformance spec
The 4.5:1 requirement above is enforced by the rendered contrast gate (build
Phase 7 scaffolds and runs `tests/a11y/contrast.spec.ts`, both colour
schemes, violations fail). Deliberately NO conformance spec exists for
contrast, do not add one: a spec that greps colour classes passes cleanly in
exactly the failing case (the colour lives in a vendor stylesheet, the
project wrote none), and a check that reports green while asserting nothing
about the failure mode is worse than no check. The only honest write-time
check here is presence, not ratio: a page importing a vendor stylesheet must
be listed in the contrast gate's ROUTES.

## Test it
A keyboard-only pass (Tab, Enter/Space/Escape, watch the focus ring) plus a real
screen reader on key flows, plus the rendered contrast gate in both colour
schemes. Automated static tools catch only a fraction; rendered checks catch
what they cannot. Neighbours of this failure shape, also only settleable
rendered or running: motion under prefers-reduced-motion, focus order, and
heading structure as actually announced.
