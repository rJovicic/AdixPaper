---
name: Adix Paper
description: Fault and maintenance log for a paper-converting plant — the press-sheet system.
colors:
  key: "#111316"
  key-raised: "#1D2025"
  sheet: "#FFFFFF"
  ground: "#F3F4F6"
  ink: "#111316"
  ink-secondary: "#4A505A"
  ink-tertiary: "#646B75"
  rule: "#E3E5E9"
  rule-strong: "#8A9099"
  on-key-quiet: "#A9AFB8"
  logo-blue: "#2A59A2"
  logo-blue-hover: "#224B8A"
  blue-wash: "#EAF0F9"
  process-cyan: "#00A3E0"
  cyan-text: "#006F99"
  cyan-wash: "#E3F5FC"
  process-magenta: "#E4007C"
  magenta-text: "#B3005F"
  magenta-wash: "#FDEEF5"
  process-yellow: "#FFE100"
  yellow-edge: "#C9AE00"
  yellow-text: "#6E5B00"
  yellow-wash: "#FFF8CC"
  green-spot: "#00A050"
  green-text: "#006B37"
  green-wash: "#E2F4EA"
typography:
  page-title:
    fontFamily: "Geist Variable, Geist, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  section-title:
    fontFamily: "Geist Variable, Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geist Variable, Geist, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "Geist Variable, Geist, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
  figure:
    fontFamily: "Geist Mono Variable, Geist Mono, ui-monospace, monospace"
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
  fault-number:
    fontFamily: "Geist Mono Variable, Geist Mono, ui-monospace, monospace"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
  numeral:
    fontFamily: "Geist Mono Variable, Geist Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
  field-label:
    fontFamily: "Geist Mono Variable, Geist Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.04em"
rounded:
  sm: "4px"
  md: "7px"
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
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.logo-blue-hover}"
  button-primary-active:
    backgroundColor: "{colors.key}"
  button-primary-large:
    backgroundColor: "{colors.logo-blue}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    height: "52px"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.magenta-text}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    height: "40px"
  filter-toggle-on:
    backgroundColor: "{colors.key}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    height: "32px"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "44px"
  surface:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.lg}"
  shell-rail:
    backgroundColor: "{colors.key}"
    textColor: "{colors.on-key-quiet}"
    width: "224px"
  nav-item-active:
    backgroundColor: "{colors.key-raised}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    height: "44px"
---

# Design System: Adix Paper

## Overview

**North star: the press sheet.** The plant converts paper into printed napkins and towels; every sheet that comes off its presses carries a colour bar, density steps and registration marks so the printer can see at a glance whether the ink is right. Adix Paper uses the same instruments for time: each fault's response window is ink laid down in twelve density steps — cyan while on time, yellow once 75 % of the window is used, magenta when overdue. The overview's counts read like the colour bar on a sheet's edge, between registration marks.

It is a working tool (Impeccable "Operate" mode). The world lends only type, palette, density and the one signature move; navigation, tables, forms, dialogs and menus are the standard web controls a lead or worker already knows.

Light theme only: workers use phones under bright production-floor lighting and leads use desktops in the workshop office.

**Key characteristics**
- A key-black shell (rail on desktop, top bar on phones) around white sheets on a cool grey ground.
- Process inks carry state; the logo blue carries action (buttons, links, focus). Nothing else is coloured.
- State is a solid 11 px ink chip + a word — never colour alone, never a pill.
- Numbers — fault numbers, times, counts, labels — are set in Geist Mono with tabular figures.
- Replaced the earlier "reel label" system (Archivo, deep-blue shell) on 2026-10-27; see decisions.md.

## Colors

### Primary
- **Logo Blue `#2A59A2`** — the action ink: primary buttons, links, focus rings, selection wash. Sampled from `adix-paper-logo.png`; the brand commitment in PRODUCT.md.
- **Key `#111316`** — the shell (rail, phone top bar, sign-in header), the "Normal" priority chip, the active filter toggle, assignee initials. Text on it is white or `on-key-quiet #A9AFB8` (8.4:1).

### Process inks (state only)
| Ink | Mark | Text | Wash | Means |
|---|---|---|---|---|
| Cyan | `#00A3E0` | `#006F99` (5.6:1) | `#E3F5FC` | New fault; due strip while on time; "reported" chart series |
| Yellow | `#FFE100` + `#C9AE00` edge | `#6E5B00` (6.7:1) | `#FFF8CC` | In progress; due strip once 75 % of the window is used |
| Magenta | `#E4007C` | `#B3005F` (6.8:1) | `#FDEEF5` | Urgent priority, overdue, errors, destructive actions, overdue count in the rail |
| Green spot | `#00A050` | `#006B37` (6.7:1) | `#E2F4EA` | Resolved; success; "resolved" chart series |
| Hollow key | 1.5 px `#646B75` inset | ink-secondary | — | On hold, low priority, inactive |

### Neutral
- **Ground `#F3F4F6`**, **Sheet `#FFFFFF`** for every surface.
- **Ink `#111316`** (18:1), **Ink Secondary `#4A505A`** (7.4:1 on ground), **Ink Tertiary `#646B75`** (4.9:1 on ground) for metadata, placeholders and field labels.
- **Rule `#E3E5E9`** hairlines; **Rule Strong `#8A9099`** (3.2:1) for control borders.

### Named Rules
- **Ink means state.** Cyan, yellow, magenta and green appear only to say what state something is in. The logo blue is never a state.
- **Shape-and-word Rule.** Every status, priority and machine state shows its chip *and* its word, so it survives greyscale and colour blindness. Cyan and yellow chips are below 3:1 on white by design — the word carries the meaning.

## Typography

Two faces of one family, self-hosted via `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (Latin + Latin Extended for Croatian diacritics).
- **Geist** for all prose and UI text.
- **Geist Mono** for anything counted or measured: fault numbers (padded to three digits, `#047`, the zeros in ink-tertiary), times left, counts, dates in the overview header, table headers and field labels (`.field-label`, uppercase, +0.04 em). Monospace here is measurement, never decoration.

### Hierarchy
| Role | Size / weight | Use |
|---|---|---|
| fault-number | 2.25 rem / 600 mono | Fault detail and worker fault headers |
| figure | 2.125 rem / 600 mono | Overview colour-bar counts |
| page-title | 1.5–1.75 rem / 600 | One `h1` per page |
| section-title | 1 rem / 600 | Panel and form section headings |
| body | 0.9375 rem / 400, 1.5 | Default. Form controls are 16 px on phones (no iOS zoom), 15 px from `sm` |
| meta | 0.8125 rem | Secondary lines, machine · component |
| numeral | 0.8125 rem mono | Times left, dates, counts in tables |
| field-label | 0.6875 rem / 500 mono uppercase | Field labels, table headers, colour-bar labels |

Headings use `text-wrap: balance`, paragraphs `pretty`.

## Layout

- **Spacing:** Tailwind's 4 px scale; groups 8–12 px, sections 20–24 px.
- **Shell:** desktop (≥ 1024 px) — fixed 224 px key-black rail: logo, search field (Ctrl/⌘ K), nav with the overdue count beside "Kvarovi", account menu at the foot. Below 1024 px — key-black top bar with menu (drawer), logo and search. Workers get their own top bar with the avatar account menu. Content max width 76 rem (lead) / 42 rem (worker).
- **Breakpoints:** `xs 420`, `sm 640`, `md 768`, `lg 1024`, `xl 1280`. Tables appear at `md`; below it lists are cards.
- **Overview (Pregled):** the colour bar (Open · Urgent · Overdue · In progress · Unassigned, each a link into the filtered list); "Needs attention" with All / Unassigned / Mine toggles and the due strip on every row; "My faults" panel beside it from `xl`, below it before. On phones the colour bar is two patches over three.
- **Fault detail:** main column + 18.5 rem status panel (sticky on desktop, first on phones).

## Elevation & Depth

Flat sheets on a ground; hairlines carry structure.
- `shadow-label` `0 1px 2px rgb(17 19 22/.06), 0 8px 20px -14px rgb(17 19 22/.25)` — every surface.
- `shadow-lift` — hovered cards, menus, toasts, comboboxes, the account panel.
- `shadow-dialog` — dialogs and the search palette; backdrop key at 45–50 %.

## Shapes

4 px (chips, kbd hints), 7 px (buttons, inputs, nav items, initials), 10 px (surfaces, dialogs, menus). State chips are 11 px squares with a 2 px radius. Assignee initials are 24–32 px rounded squares, key with white mono letters (a hollow square when unassigned).

## Components

### Buttons
Primary (logo blue), secondary (white, `#D2D6DC` border), quiet (text), danger (magenta), icon (40 × 40, always with `aria-label`). Heights 40 px; `btn-lg` 52 px for the worker's main actions. Filter toggles (overview tabs) are 32 px bordered buttons with `aria-pressed`; on = key fill. Labels name the action ("Pošalji prijavu", "Označi riješenim").

### Inputs / Fields
`Field` wires label, hint and error to the control (`aria-describedby`, `aria-invalid`). 44 px minimum, rule-strong border, blue focus border + ring; invalid → magenta border. Errors appear under the field with a magenta square and focus moves to the first invalid field on submit (`lib/focus.js`). Optional fields are marked "(neobavezno)".

### Navigation
Rail items 44 px; active = key-raised fill with a hairline inner ring, `aria-current` from `NavLink`. The overdue count is a magenta mono badge with visually hidden text ("kasni"). Skip link to `#main` on every shell.

### Search palette
Ctrl/⌘ K or the rail field opens a native `<dialog>`: combobox + listbox, ↑ ↓ Enter Esc, `aria-activedescendant`. Empty query lists open faults by risk; a number finds that fault; text matches title, machine and part, and machines.

### Account menu
A disclosure (not an ARIA menu, because it mixes a language switch with actions): name and role, HR/EN switch, push toggle (leads, when VAPID is set), change password, sign out. Rail row on desktop (opens upward), avatar button in the worker bar.

### Signature: the due strip
`DueStrip` (12 steps, 8 px tall, 2 px gaps): steps fill with the share of the response window used, opacity rising 35 % → 100 % across the first six steps like a density scale; ink cyan → yellow (≥ 75 %) → magenta (overdue). Decorative (`aria-hidden`); the mono time text beside it carries the information. Used on overview and list rows (`Due` = time over strip), across the top edge of every phone fault card, under fault headers, and in "My faults".

### The colour bar
Five patches between registration marks: a 14 px solid ink column, mono label, mono figure. Overdue is magenta laid in a 45° screen so it reads apart from urgent. Each patch links to the matching filtered list.

### Feedback
Toasts (`aria-live`): success 5 s, info with link 12 s, errors 9 s with `role="alert"`. Empty states say what will appear; error states name the problem and offer "Pokušaj ponovno". Destructive actions use `ConfirmDialog`. Loading: skeleton rows with `aria-busy`.

## Do's and Don'ts

### Do:
- Lead with what needs action; totals and charts come after.
- Pair every ink chip with its word.
- Set numbers, times and counts in Geist Mono with tabular figures.
- Use the team's words: *mašina*, *kvar*, *Raspisano*.
- Translate every new string in `src/i18n/hr.js` and `en.js`; `npm run check:i18n` enforces parity.
- Define components at module level (ESLint `react/no-unstable-nested-components`).

### Don't:
- Use cyan, yellow, magenta or green for anything that is not a state.
- Use the logo blue as a state colour, or a second action colour.
- Add eyebrows above headings, gradient text, glows, hard offset shadows, or coloured side borders.
- Add printing ornament beyond the colour bar, registration marks and the due strip — on a working screen more world is a costume.
- Use `alert()`/`confirm()`; use toasts and `ConfirmDialog`.

## Accessibility

Target WCAG 2.2 AA, verified by axe-core in the e2e suite on every screen, with the search palette and account menu open (0 serious/critical). Text ≥ 4.5:1, control borders ≥ 3:1, 2 px blue focus outline, keyboard-operable menus, combobox, palette and dialogs (native `<dialog>`), 44 px touch targets, `lang` follows the language switch, reduced motion disables entrance animations and skeleton pulses.

## Motion

`enter-rise` (260 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, 12 px rise) for dialogs, the search palette, toasts and the login card; `enter-fade` (200 ms) for menus, the account panel and the drawer. Colour/border transitions 150 ms. All disabled under `prefers-reduced-motion`.
