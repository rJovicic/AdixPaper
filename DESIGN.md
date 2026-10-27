---
name: Adix Paper
description: Fault and maintenance log for a paper-converting plant — the reel-label system.
colors:
  reel-core: "#EDEFF2"
  label-stock: "#FFFFFF"
  ink: "#15181D"
  ink-secondary: "#474E59"
  ink-tertiary: "#636B77"
  rule: "#D6DAE0"
  rule-strong: "#858C97"
  logo-blue: "#2A59A2"
  logo-blue-hover: "#224B8A"
  shell-deep: "#152C52"
  blue-wash: "#E7EDF7"
  on-shell-quiet: "#B8C6DE"
  urgent: "#B42318"
  urgent-wash: "#FCEBE9"
  wordmark-grey: "#949597"
typography:
  reel-number:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
  figure:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
  page-title:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  section-title:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  table:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
  field-label:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "0.06em"
rounded:
  sm: "3px"
  md: "6px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.logo-blue}"
    textColor: "{colors.label-stock}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.logo-blue-hover}"
  button-primary-active:
    backgroundColor: "{colors.shell-deep}"
  button-primary-large:
    backgroundColor: "{colors.logo-blue}"
    textColor: "{colors.label-stock}"
    rounded: "{rounded.md}"
    height: "52px"
  button-secondary:
    backgroundColor: "{colors.label-stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.urgent}"
    textColor: "{colors.label-stock}"
    rounded: "{rounded.md}"
    height: "40px"
  input:
    backgroundColor: "{colors.label-stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "44px"
  surface:
    backgroundColor: "{colors.label-stock}"
    rounded: "{rounded.lg}"
  shell-rail:
    backgroundColor: "{colors.shell-deep}"
    textColor: "{colors.on-shell-quiet}"
    width: "256px"
  nav-item-active:
    backgroundColor: "{colors.label-stock}"
    textColor: "{colors.shell-deep}"
    rounded: "{rounded.md}"
    height: "44px"
---

# Design System: Adix Paper

## Overview

**North star: the reel label.** Every jumbo reel that leaves a paper machine carries a label — one unmistakable number, ruled fields, one ink. AdixPaper treats each fault the same way: a big condensed number, small uppercase field labels over values in hairline-ruled cells, and the logo blue as the only brand ink. It is a working tool (Impeccable "Operate" mode): the world contributes type, palette, density and one signature move; navigation, tables, forms and dialogs are standard web controls.

It replaces three competing looks (blue gradient login, black-and-amber admin, pastel badge pills) with one system, keeping the brand's confirmed asset — the Adix Paper logo and its blue.

Light theme only: workers use phones on a brightly lit production floor and leads use desktops in the workshop office.

**Key characteristics**
- One brand ink (`logo-blue`), a deep-blue shell, everything else neutral until a state needs colour.
- State is a solid 10 px square + a word — never colour alone, never a pastel pill.
- Numbers are set condensed and heavy, with tabular figures.
- Hairline rules group information; shadows are minimal and only lift surfaces.

## Colors

### Primary
- **Logo Blue `#2A59A2`** — primary buttons, links, focus rings, selection, active tab underline, the "resolved" chart series. Sampled from `adix-paper-logo.png`.
- **Shell Deep `#152C52`** — the navigation rail and the phone top bar. Text on it is white or `on-shell-quiet #B8C6DE` (8:1).
- **Blue Wash `#E7EDF7`** — selected radio cards, hovered rows, menu focus.

### Neutral
- **Reel Core `#EDEFF2`** — page ground. **Label Stock `#FFFFFF`** — every surface.
- **Ink `#15181D`** (17.8:1) for text and numerals; **Ink Secondary `#474E59`** (8.4:1) for supporting text; **Ink Tertiary `#636B77`** (5.4:1 on stock, 4.7:1 on ground) for metadata and placeholders.
- **Rule `#D6DAE0`** for hairlines; **Rule Strong `#858C97`** (3.4:1) for control borders — meets the 3:1 non-text contrast rule.

### State: the logo's two colours, as shapes
The palette is only what the Adix Paper logo and website use: the logo blue, its deep shade, the wordmark grey `#949597`, white and ink. States are told apart by **shape** (owner's decision, 2026-10-27: no amber, green or other hues).

| State | Mark | Text |
|---|---|---|
| New | filled logo-blue square | ink |
| In progress | half-filled logo-blue square (`.mark-half`) | ink |
| On hold, low priority, inactive | hollow 1.5 px `#636B77` square | ink-secondary |
| Resolved | filled wordmark-grey square | ink |
| Machine in service | half-filled logo-blue | ink |
| Due soon, unsaved changes, success | — | deep blue `#152C52`, semibold |
| **Urgent, overdue, errors, destructive** | `#B42318` | `#B42318` (6.6:1), wash `#FCEBE9` |

Red is the one colour outside the logo, kept because "urgent" and "late" must stop the eye on a busy screen; it appears nowhere else.

### Named Rules
- **Logo Colours Only.** Logo blue, deep blue, wordmark grey, white and ink. Red only for urgent, overdue and errors. Never amber, green, cyan or other hues.
- **Shape-and-word Rule.** Every status/priority shows a marker *and* its word, so it survives greyscale and colour blindness.

## Typography

One family: **Archivo Variable** (self-hosted via `@fontsource-variable/archivo`, `wdth` + `wght` axes, Latin-Ext for Croatian diacritics). Normal width for UI; condensed (`wdth 72`, weight 800) for numerals via the `.numeral` class.

### Hierarchy
| Role | Size / weight | Use |
|---|---|---|
| reel-number | 2.75 rem / 800 condensed | Fault number on detail headers |
| figure | 2.5 rem / 800 condensed | Dashboard counts |
| page-title | 1.5–1.75 rem / 600 | One `h1` per page |
| section-title | 1–1.125 rem / 600 | Panel and form section headings |
| body | 1 rem / 400, 1.5 | Default; never below 16 px for prose or inputs |
| table | 0.9375 rem | Dense lead tables |
| meta | 0.8125 rem | Timestamps, secondary lines |
| field-label | 0.75 rem / 600, uppercase, +0.06 em | The label grid and table headers only |

Headings use `text-wrap: balance`, paragraphs `pretty`. Prose is capped at ~75 ch.

## Layout

- **Spacing:** Tailwind's 4 px scale; groups tight (8–12 px), sections generous (24–32 px). More space above a heading than below.
- **Shell:** desktop (≥ 1024 px) — fixed 256 px deep-blue rail with nav, language, notifications, account. Below 1024 px — sticky top bar + drawer (native `<dialog>`). Content max width 72 rem (lead) / 42 rem (worker).
- **Breakpoints:** `xs 420`, `sm 640`, `md 768`, `lg 1024`, `xl 1280`. Tables appear at `md`; below it, lists render as label cards.
- **Overview (Pregled):** a period switch (Today · 7 days · 30 days · This month; it only affects "Resolved"); six figures in one ruled strip — Open · Urgent · Overdue · Untaken · Waiting for parts · Resolved in period — each a link to a list that returns the same count; "Needs attention" (up to 10 open faults, most pressing reason first, then time left) with a **Why** column in words, All / Untaken / Mine toggles; beside it from `xl` "My faults" and "Team workload" (open faults per lead with hairline bars, untaken first, each row opens that person's list); "Recent activity" under the queue. Phones: figures, queue, my faults, workload, activity. Refreshes every minute while visible.
- **Analytics (Analize):** period switch (30 days · This month · 90 days · This year); one ruled strip of eight figures, each with the same figure for the preceding period ("prije: …"); "How these are calculated" lists every definition. Then machines (table ≥ md, cards below), faults by month, waiting by reason, recurring faults, reports by priority, spare parts used. Missing data shows "—", never 0.
- Charts load only on Analytics. Durations under 10 h show hours and minutes; longer ones show whole hours.
- **Fault detail:** main column (label block with machine · location, part, reporter, reported, taken by, response due, started, time open / resolved; description; photos) + 18.5 rem side column (status panel with actions and waiting reason, sticky on desktop and first on phones; machine history from `lg`). "Put on hold" opens a reason dialog (radio cards). A save refused as stale shows a red-ruled notice with "Load latest".
- **Phone navigation:** workers get a bottom tab bar (My faults · Report fault), hidden on the report form so it never rides above the keyboard; leads below 640 px get Overview · Faults (overdue count) · Machines · More (opens the drawer; active on screens without a tab). Fixed bars use `.pb-safe` for the home indicator.

## Elevation & Depth

Flat by default; hairlines carry structure.
- `shadow-label` `0 1px 2px rgb(20 23 28/.06), 0 1px 1px rgb(20 23 28/.04)` — every surface.
- `shadow-lift` — hovered cards, menus, toasts, comboboxes.
- `shadow-dialog` — dialogs; backdrop `ink` at 45 %.

## Shapes

Radii are small, like die-cut label corners: 3 px (markers, chips), 6 px (buttons, inputs), 10 px (surfaces, dialogs). Status markers are 10 px squares with a 2 px radius.

## Components

### Buttons
Primary (logo blue), secondary (white, rule-strong border), quiet (text), danger (urgent), icon (40 × 40, always with `aria-label`). Heights 40 px; `btn-lg` 52 px for the worker's main actions. Disabled at 55 % opacity with `not-allowed` cursor. Labels name the action ("Pošalji prijavu", "Označi riješenim"), never "OK".

### Inputs / Fields
`Field` wires label, hint and error to the control (`aria-describedby`, `aria-invalid`). 44 px minimum height, 16 px text (no iOS zoom), rule-strong border, blue focus border + 2 px ring; invalid → urgent border. Errors appear under the field with a red square marker and focus moves to the first invalid field on submit (`lib/focus.js` `focusFirstInvalid`, which waits for the error markers to render). Optional fields are marked "(neobavezno)" rather than required ones starred.

### Radio cards
For choices that need a sentence (urgency on the report form, role on the user form): 52 px rows, radio + marker + label + hint; selected = blue border on blue wash.

### Cards / Containers
`surface`: white stock, 1 px rule border, 10 px radius, `shadow-label`. Never nested.

### Navigation
Rail items 44 px tall; active = white chip with deep-blue text; `aria-current` from `NavLink`. The overdue count sits beside "Kvarovi" as a small red badge. Skip link to `#main` on every shell.

### Search (Ctrl/⌘ K)
The rail's search field (or Ctrl/⌘ K anywhere) opens a dialog: combobox + listbox, ↑ ↓ Enter Esc. Empty query lists open faults by risk; a number finds that fault; text matches title, machine and part, and machines.

### Account menu
A disclosure with name and role, HR/EN switch, push toggle (leads, when VAPID is set), change password and sign out. Rail row on desktop, initials button in the worker's top bar.

### Time left
`DueTag` (clock + time, red when overdue, deep blue when ≥ 75 % used) over a 3 px `DueBar` hairline showing the share of the response window used (logo blue, red when overdue). On overview rows and in "My faults".

### Attention reasons and waiting
`AttentionReasons` renders the server's reasons as marker + words, most pressing first: overdue and urgent in red (filled square), due soon in deep blue (half square), untaken in deep blue (hollow blue square), long wait in ink-secondary (hollow grey square). Overdue/due-soon times are recomputed from the clock. `WaitingTag` shows "Waiting: spare parts · 2 d" for faults on hold. Both follow the Shape-and-word Rule.

### Segmented control
`Segmented` for a few exclusive choices (periods): ruled white group, selected = logo-blue fill; fills the width on phones.

### Photos
`Photos`: 4:3 thumbnails in a 3–4 column grid, a secondary "Add photo" button, full view in a dialog with remove (confirmed). Fetched as blobs with the session token; never public URLs.

### Signature: the label block
`FaultNumber` (condensed numeral, grey `#`) + `LabelFields` (ruled 2- or 4-column `dl` with uppercase field labels). Used on fault detail headers and the worker fault view. Fault cards carry the number beside the title and a ruled STATUS | PRIORITY | DUE strip; an overdue card gets an urgent border and tinted strip. Tables and dashboard rows lead with the number.

The printed **machine QR label** (Machines → QR oznake) carries the same identity: logo-blue "ADIX PAPER" kicker, machine name in bold, type · location in ink-secondary, the call to action "Kvar? Skenirajte kod." in shell-deep, dashed cut lines. PDFs use Liberation Sans (metric twin of Helvetica) because reportlab cannot embed the WOFF2 Archivo.

### Feedback
- Toasts (`aria-live`): success 5 s, info with link 12 s, errors 9 s with `role="alert"`.
- Empty states say what will appear and offer the next action; error states name the problem and offer "Pokušaj ponovno".
- Destructive or hard-to-reverse actions use `ConfirmDialog` with a specific consequence sentence.
- Loading: skeleton rows with `aria-busy`.

## Do's and Don'ts

### Do:
- Lead with what needs action; put totals and charts after it.
- Pair every state colour with a marker shape and a word.
- Use the team's words: *mašina*, *kvar*, *Raspisano*.
- Translate every new string in both `src/i18n/hr.js` and `en.js`; `npm run check:i18n` enforces parity.
- Define components at module level (ESLint `react/no-unstable-nested-components`).

### Don't:
- Add eyebrows/kickers above headings, gradient text, glows, or coloured side borders.
- Use colour as the only signal, or pastel pill badges.
- Introduce a second typeface or a second accent colour.
- Use `alert()`/`confirm()`; use toasts and `ConfirmDialog`.

## Accessibility

Target WCAG 2.2 AA. Verified by axe-core in the e2e suite on every screen (0 serious/critical). All text ≥ 4.5:1, control borders ≥ 3:1, visible 2 px focus outline, keyboard-operable menus/combobox/dialogs (native `<dialog>` traps focus and closes on Escape), 44 px touch targets, `lang` attribute follows the language switch, reduced motion disables entrance animations and skeleton pulses.

## Motion

One motion vocabulary: `enter-rise` (260 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, 12 px rise) for dialogs, toasts and the login card; `enter-fade` (200 ms) for menus and the drawer. Colour/border transitions 150 ms. Everything is disabled under `prefers-reduced-motion`.
