---
name: Machine Fault Investigator
description: Local AI diagnosis workspace with an honest, instrument-like interface.
colors:
  primary: "#0e6b5e"
  primary-deep: "#0a574c"
  selection: "#bfe3d9"
  ground: "#eef1ee"
  surface: "#ffffff"
  ink: "#161918"
  muted-ink: "#3f4442"
  faint-ink: "#5c6160"
  hairline: "#d9ddd9"
  warn-amber: "#b45309"
  danger: "#b3261e"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 5.2vw, 4.2rem)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 600
    letterSpacing: "-0.015em"
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    lineHeight: 1.55
  label:
    fontSize: "12.5px"
    fontWeight: 600
  data:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "12.5px"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  card: "20px 22px"
  view: "20px 22px 40px"
  container: "1320px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px 22px"
---

# Design System: Machine Fault Investigator

## Overview

**Creative North Star: "Calibration Lab"**

The interface reads as one honest instrument: a flat lab bench in warm
gray, near-black type, and a single deep-teal accent that marks the one
action that matters per view. The hero lets the artifact lead — the real
3D assembly orbiting beside a spec sheet of computed project figures —
and the app shell stays out of the way with quiet cards, hairline
borders, and pill navigation. Nothing glows, nothing lifts, nothing
pretends: restraint is the brand, because the product's promise is that
every number traces to evidence.

**Key Characteristics:**

- Flat surfaces separated by 1px hairlines; zero box-shadows.
- One accent (Instrument Teal); amber appears only for suspect/warn.
- Editorial display type (Archivo 800) over a system-ui body.
- Mono is reserved for measurements and data, never decoration.
- Motion is functional: 160ms view fades, one slow orbit, full
  reduced-motion support.

## Colors

A warm-gray bench with near-black ink and one deep-teal voice.

### Primary

- **Instrument Teal** (#0e6b5e): the single primary action per view
  (Investigate, Send, Start, Open live workspace), links that act,
  run-step numerals, focus rings. Deepens to #0a574c on hover.

### Neutral

- **Bench Ground** (#eef1ee): whole-page ground; the 3D scene (#f2f4f2)
  sits on it as a deliberate inset panel.
- **Card Surface** (#ffffff): cards, inputs, nav bar.
- **Ink** (#161918): body text, dark CTA, active nav pill, tool badges.
- **Muted Ink** (#3f4442): secondary text, captions that must pass
  contrast, card descriptions.
- **Faint Ink** (#5c6160): tertiary captions, paths, quotes. Lightest
  text allowed anywhere.
- **Hairline** (#d9ddd9): every border and divider.

### Named Rules

**The Amber Reserve Rule.** Amber (#b45309) appears only for the 3D
suspect highlight and warn-grade findings. It is never a button, link,
or decoration.
**The One Voice Rule.** Instrument Teal marks the single primary action
per view. If two teal buttons appear side by side, one is wrong.

## Typography

**Display Font:** Archivo (self-hosted woff2, weights 600/800) with
system-ui fallback.
**Body Font:** system-ui stack.
**Label/Mono Font:** JetBrains Mono (self-hosted woff2, 400/500).

**Character:** Archivo's tight grotesque headlines carry conviction;
the neutral body stays invisible; JetBrains Mono makes numbers feel
measured rather than designed.

### Hierarchy

- **Display** (800, clamp(2.6rem, 5.2vw, 4.2rem), 1.02): the hero
  headline only. Stays under six words.
- **Headline** (600, 1.45rem): card titles and section heads.
- **Title** (600, 0.95rem): small group labels (Components, Draft
  order), set in muted ink.
- **Body** (400, 15px, 1.55): prose, capped near 80ch in reports and
  replies.
- **Label** (600, 12.5px): form labels, muted.
- **Data** (JetBrains Mono, 12.5px, tabular-nums): spec values,
  run-step numerals, tool badges, measurements.

### Named Rules

**The Mono Is Data Rule.** Monospace appears only where a value is
measured, counted, or identified (spec figures, step numerals, tool
badges). Never for kickers, buttons, or mood.
**The Short Display Rule.** Display headlines stay short enough to
balance on two lines; the hero headline is six words.

## Layout

One centered container (1320px) for hero and app alike. Hero is an
editorial 5/7 split (copy left, live 3D right) collapsing to one column
under 960px. Investigation pairs evidence and steps in a two-column
grid that also collapses at 960px. Cards breathe with 20/22px padding;
views carry 20/22/40px. Density is calm: one idea per card, hairlines
between sections, no nested cards.

## Elevation & Depth

The system uses no shadows at all. Depth is conveyed only by tonal
layering (white cards on the gray bench) and 1px hairline borders. The
sticky app nav separates by border, not shadow. Focus is a 2px teal
outline with 2px offset.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest and stay flat
on hover. No element gains a shadow in any state.

## Shapes

Corners follow a strict scale: inputs and small elements at 6px,
buttons at 10px, cards at 14px, and full pills (999px) only for small
controls — nav items, tabs, component chips, badges. Borders are always
1px hairlines; the 3D canvases sit in bordered, rounded wells.

## Components

### Buttons

Restrained rectangles that change border or fill, never lift.

- **Shape:** 10px radius, 8px/16px padding, 13.5px semibold text.
- **Primary:** Instrument Teal fill, white text; deepens on hover.
- **Dark:** Ink fill for the workspace CTA; near-black on hover.
- **Ghost:** Transparent with hairline border; border darkens to ink.
- **Hover / Focus:** 120ms border/fill transition; 2px teal
  focus-visible ring. Disabled state is 45% opacity.
- **Secondary / Tertiary:** not used. One primary plus ghosts per view.

### Chips

- **Style:** full-pill outline chips, 12–12.5px medium text.
- **State:** tabs and component chips invert (ink or teal fill, white
  text) at aria-pressed true; evidence chips tint teal when active.

### Cards / Containers

- **Corner Style:** 14px radius.
- **Background:** white on the gray bench.
- **Shadow Strategy:** none, per the Flat-By-Default Rule.
- **Border:** 1px hairline.
- **Internal Padding:** 20px/22px; heads get a title plus one muted
  description line.

### Inputs / Fields

- **Style:** white fill, 1px hairline stroke, 6px radius, 8px/10px
  padding, 13.5px text.
- **Focus:** 2px teal outline with 2px offset.
- **Error / Disabled:** errors surface in the page alert, not inline;
  disabled controls dim to 45%.

### Navigation

- **Style:** text links (13.5px semibold, muted) in both site and app
  navs; app links live in pills.
- **Default/hover/active:** hover darkens (app: gray pill fill);
  aria-current page inverts to an ink pill with white text.
- **Mobile treatment:** site links hide under 960px, leaving wordmark
  plus CTA; app pills wrap.

### Spec Sheet

The hero's proof strip: a two-column definition list (muted label,
right-aligned mono value, tabular numerals) with hairline row
dividers. Values come from the computed stats endpoint, never copy.

## Do's and Don'ts

### Do:

- **Do** keep one primary action per view in Instrument Teal.
- **Do** let flat cards and hairlines separate content; reach for
  spacing before decoration.
- **Do** set measurements, counts, and identifiers in JetBrains Mono
  with tabular numerals.
- **Do** honor reduced-motion: view fades, orbit, and shimmer all
  switch off under the media query.
- **Do** write empty states as plain guidance
  ("No evidence yet — import a recording and investigate.").

### Don't:

- **Don't** add shadows, gradients, glows, or glassmorphism to any
  surface.
- **Don't** use amber for anything except suspect/warn states.
- **Don't** set body copy in gray lighter than Faint Ink (#5c6160).
- **Don't** lift, scale, or tilt cards on hover; borders may darken.
- **Don't** put kickers or eyebrows above headlines, or all-caps
  microcopy anywhere.
- **Don't** use emoji as icons or purple/indigo anywhere in the UI.
