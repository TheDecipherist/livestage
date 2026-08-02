---
paths:
  - "**/*.html"
  - "**/*.css"
  - "**/*.tsx"
  - "**/*.jsx"
---

# CSS Structure: Where Styles Live

Styles belong in a `.css` file, not poured into HTML as a big `<style>` block or
scattered `style="..."` attributes.

## Default: an external stylesheet, linked
In a project with a file structure, put CSS in its own file and link it. Reusable,
cached separately, keeps markup readable, lets the cascade and media queries work.
This is the default to reach for, not the thing to do only when asked.

## Avoid scattered inline style attributes
- They cannot be responsive or interactive: no media queries, no `:hover`/`:focus`, no `::before`, no keyframes. An inline-styled element literally cannot be made responsive.
- They have the highest specificity short of `!important`, so overriding later starts a specificity war.
- No reuse, no caching, noisy markup.

## A single `<style>` block is fine for a single-file deliverable
A standalone demo, a self-contained artifact, a quick reproduction. Email HTML is
the opposite special case, mail clients strip `<style>` so email requires inline
attributes. The rule is about defaults: once there is a project with folders, move
CSS into a file.

## When inline is actually correct
- Runtime values: a width/transform/color computed from state. Set a CSS custom property inline and consume it in the stylesheet, so only the value is inline: `<div class="bar" style="--progress: 73%">`.
- Critical CSS: deliberately inlining above-the-fold styles in `<head>` for first paint (see web-performance).

## In React/JSX
Same split: dynamic values through `style={{}}` or a CSS variable, everything static
in CSS Modules, a stylesheet, or utility classes. A large hand-written inline style
object on every element is the JSX version of the same anti-pattern.
