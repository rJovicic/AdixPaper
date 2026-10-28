---
name: Adix Paper
description: Fault and maintenance log for a paper-converting plant — the plant-floor console system.
colors:
  ground: "#F4F6FA"
  card: "#FFFFFF"
  ink: "#0F172A"
  ink-secondary: "#475569"
  ink-tertiary: "#5B6779"
  rule: "#E4E8F0"
  rule-strong: "#8691A3"
  action-blue: "#1F56D0"
  action-blue-hover: "#1847B3"
  navy: "#10265A"
  blue-wash: "#E8EFFC"
  on-navy-quiet: "#B9C7E6"
  urgent: "#B42318"
  urgent-mark: "#D92D20"
  urgent-wash: "#FEF1F0"
  warning: "#A64900"
  warning-mark: "#F5A623"
  warning-wash: "#FFF7E6"
  success: "#067647"
  success-mark: "#16A36A"
  success-wash: "#EAFAF1"
  new: "#5925DC"
  new-mark: "#7A5AF8"
  new-wash: "#F4F2FF"
  neutral: "#475467"
  neutral-mark: "#98A2B3"
  neutral-wash: "#F1F4F8"
  info-wash: "#EEF3FE"
typography:
  greeting:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  figure:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1
  card-title:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  table:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
  pill:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  sm: "6px"
  md: "8px"
  icon-tile: "10px"
  card: "14px"
  xl: "18px"
  pill: "9999px"
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
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.card}"
    rounded: "{rounded.md}"
    height: "44px"
  button-primary-large:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.card}"
    rounded: "{rounded.md}"
    height: "52px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
  rail:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.on-navy-quiet}"
    width: "248px"
  nav-item-active:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.card}"
    rounded: "{rounded.md}"
    height: "46px"
  fab:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.card}"
    rounded: "{rounded.pill}"
    size: "56px"
---

# Design System: Adix Paper

## Overview

**North star: the plant-floor console.** A deep navy frame (the rail on desktop, the header bar on phones) holds a cool, light working surface. White cards carry the work, and one saturated action blue says "do this". State lives in pale pills, each with a dot and a word. The owner's five-screen reference of 2026-10-28 is the visual authority. It covers the desktop admin dashboard, mobile home, mobile fault list, the stepped report flow and mobile fault detail. This system is that reference, extended to every other screen.

Operate mode: people come here to finish a task, so familiar patterns win over expression. Brand shows up in the navy frame, the white Adix Paper mark on it, and the precision of the figures.

Light theme only. Workers use phones on a brightly lit production floor, and leads use desktops in the workshop office.

**Key characteristics**
- The navy frame is the only dark surface. Everything inside it is light.
- One action colour (`action-blue`). A solid blue button is always the next step.
- KPI cards lead with a solid icon tile in their state colour, a bold figure, and an honest change against a stated reference.
- Fault rows lead with a round priority marker, then the machine and number, what is wrong, the pills and when it was reported.
- Phones get a bottom tab bar with a raised round "+" in the centre: reporting a fault is always one thumb away.

## Colors

All tokens live in `frontend/src/index.css :root` as RGB channels and reach Tailwind through `tailwind.config.js` (`ground`, `stock`, `ink`, `rule`, `brand`, `urgent`, `warn`, `ok`, `new`, `slate`, `info`).

### Frame and action
- **Navy `#10265A`** (`brand-deep`): the rail, the phone header, the theme colour and the iOS status bar (`black-translucent`, so headers pad by `env(safe-area-inset-top)` through `.pt-safe`). Quiet text on it is `#B9C7E6`, at 8.6:1.
- **Action blue `#1F56D0`** (`brand`): primary buttons, the active rail item, the FAB, selected pill tabs and chips, links, focus rings, the "in progress" state. White on it is 6.4:1, and on blue wash it is 5.5:1.
- **Blue wash `#E8EFFC`**: hovered rows, selected list rows and menu focus.

### Neutral
- **Ground `#F4F6FA`** is the page. **Card `#FFFFFF`** is every surface.
- **Ink `#0F172A`** is for text and figures. **Ink secondary `#475569`** (7.6:1) is for supporting text. **Ink tertiary `#5B6779`** (5.7:1 on white, 5.3:1 on ground) is for metadata, column heads and placeholders.
- **Rule `#E4E8F0`** is for hairlines. **Rule strong `#8691A3`** (3.2:1) is for control borders.

### State: semantic colour, always with a dot or icon and a word
| Tone | Text on white / wash | Mark (dots, tiles, badges) | Used for |
|---|---|---|---|
| danger | `#B42318` / 6.0:1 on `#FEF1F0` | `#D92D20` (4.8:1 with white) | Urgent priority, overdue, count badges, errors, sign out |
| warning | `#A64900` / 5.5:1 on `#FFF7E6` | `#F5A623` | Normal priority, on hold, due soon |
| info | `#1F56D0` / 5.7:1 on `#EEF3FE` | action blue | In progress |
| new | `#5925DC` / 7.0:1 on `#F4F2FF` | `#7A5AF8` | New, untaken |
| success | `#067647` / 5.3:1 on `#EAFAF1` | `#16A36A` | Resolved, good change |
| neutral | `#475467` / 7.0:1 on `#F1F4F8` | `#98A2B3` (hollow dot for low) | Low priority, inactive |

Icon tiles in amber and green carry white icons below 3:1. That is allowed only because the tile is decorative (`aria-hidden`) and its label sits beside it.

### Named rules
- **Shape-and-word rule.** Every status and priority shows a marker and its word, so it survives greyscale and colour blindness.
- **Honest change rule.** A KPI shows its change only when there is a real reference, and it names that reference: "od prošlog tjedna" (open, urgent and on-hold counts as they stood seven days ago, replayed from the status and priority history) or "od jučer" (resolved today vs. yesterday, plant time). The direction is coloured by whether it is good news, and screen readers hear it in words: "2 manje od prošlog tjedna". Worker figures have no reference, so they show no change.

## Typography

There is one family: **Archivo Variable**, self-hosted, at normal width. Figures use `.numeral` (weight 700, tabular, lining).

| Role | Size / weight | Use |
|---|---|---|
| greeting / page title | 1.5 rem on phones, 1.75 rem wider / 600 | The one `h1`: "Dobar dan, Robert" on home screens, the section name elsewhere |
| figure | 1.5 rem on phones, 1.75 rem wider / 700 | KPI values |
| card title | 1 rem / 600 | Card headers ("Prioritetni kvarovi", "Aktivnost uživo") |
| body | 1 rem / 400 | Default text. Inputs are never below 16 px, so iOS does not zoom |
| table | 0.875 rem | Lead tables |
| meta | 0.8125 rem | Times, secondary lines, field labels (sentence case, ink tertiary) |
| pill | 0.75 rem / 600 | Status and priority pills inside rows |

## Layout

- **Shell, desktop (≥ 1024 px):** a 248 px navy rail with the white lockup, nav items (Početna, Kvarovi with a red count of overdue faults, Mašine, Rezervni dijelovi, Korisnici [admin only], Analize, Postavke) and the account row at the foot. A 68 px white top bar holds search (opens the Ctrl/⌘ K palette), the bell, the HR/EN switch and the avatar, which opens Profile. Content is at most 80 rem wide, with 32 px gutters.
- **Shell, phones and tablets (< 1024 px):** a navy header with the white mark and "ADIX PAPER", then QR scan (where a camera exists), search, the bell and the avatar. A white bottom bar holds Početna · Kvarovi · (+) · Mašine · Profil for leads, and Početna · Kvarovi · (+) · Skeniraj · Profil for workers. The "+" is a 56 px raised blue circle that opens the report flow. The bar hides on the report form and the scanner, so it never rides above the keyboard or the camera. The worker app uses the same bar at every width.
- **Dashboard (lead home):** the greeting and "Evo pregleda trenutnog stanja na lokaciji.", with "Prijavi kvar" at the right (full width on phones). Four KPI cards come next: Otvoreni kvarovi (blue wrench), Hitni (red warning), Na čekanju (amber pause), Riješeno danas (green check). They sit in a 2 × 2 grid on phones and a single row from 1024 px, and each opens the list behind its number. Below them, "Prioritetni kvarovi" shows the five most pressing open faults. From 768 px it is a table (machine with #number and title, priority, status, reported "Danas 08:42", owner, chevron); on phones it is a list of fault rows. Beside it from 1280 px, or under it on narrower screens, sits "Aktivnost uživo": time, a dot in the event's state colour, the event, machine · #number, and the person. It is marked "U stvarnom vremenu" while the live connection is up.
- **Worker home:** the greeting, a full-width "Prijavi kvar", and four figures (open, in progress, on hold, resolved in 7 days) computed from the worker's own faults. "Moji kvarovi" shows the five newest active ones, with "Pogledaj sve".
- **Fault lists (lead Kvarovi, worker Kvarovi):** pill tabs Aktivni (n) / Riješeni (n). On phones they are followed by search, a Filters sheet, and priority chips (Svi · Hitno · Normalno · Nisko). Lists use fault rows on phones and a table from 768 px.
- **Report flow (three steps and a confirmation):** a stepper (1 Mašina · 2 Opis · 3 Prioritet). Step 1 is a searchable list of large machine rows (radios), the part when the machine has parts, and the "already reported" notice. Step 2 is what is wrong, details, and up to five photos. Step 3 is the priority, as radio cards with a sentence each. A sticky "Dalje" or "Pošalji prijavu" bar sits at the foot. The confirmation shows a green check, the number, machine and priority, then "Pogledaj kvar", "Novi kvar" and the push card. A scanned machine with no parts starts on step 2. The draft and its step survive a reload, and the idempotency key prevents duplicates.
- **Fault detail:** an identity card (priority marker, machine and #number, title, pills, time left, "Prijavljeno: Danas 14:40", attention reasons). On phones, tabs follow it: Detalji (fields, description, status panel with actions) · Aktivnost (timeline) · Fotografije · Radovi (the resolution form). From 1024 px every section is shown, with the status panel and machine history in an 18.5 rem side column.
- **Profile (Postavke):** who is signed in, then this device (language, notifications, install), then More (lead screens not on the tab bar), then account (change password, sign out).
- **Breakpoints:** `xs 420`, `sm 640`, `md 768`, `lg 1024`, `xl 1280`. Verified without horizontal scrolling at 360, 390, 430, 768, 1024 and 1440 px.

## Elevation and depth

- `shadow-label` — every card: a 1 px contact shadow plus a soft 14 px navy-tinted shadow.
- `shadow-lift` — hovered cards, menus, toasts.
- `shadow-dialog` — dialogs and the bell panel.
- `shadow-fab` — the raised "+", tinted with the action blue.

## Shapes

Cards 14 px, icon tiles 10 px, buttons and inputs 8 px, chips and pills fully round, avatars round. Priority markers are 40 px circles with a white icon: red warning for urgent, amber wrench for normal, slate arrow for low.

## Components

- **Buttons:** primary (blue), secondary (white, light border), quiet, danger, icon (always labelled). Standard height is 44 px; `btn-lg` is 52 px for the main action on phones.
- **Pill tabs** (`.pill-track` + `.pill-tab`): a tinted track. The selected tab is filled blue with white text, and the count follows in brackets.
- **Chips** (`.chip`): pale and round. When pressed they turn blue (`aria-pressed`).
- **Kpi** (`components/ui/Kpi.jsx`): icon tile, label, figure, `Delta` and reference. On phones the icon and label share the top line and the figure sits under them.
- **FaultRow** (`components/FaultRow.jsx`): the one fault row, used on dashboard phones, both fault lists and worker home.
- **BottomNav** (`components/BottomNav.jsx`): four tabs and the FAB, with an optional count badge (red, 4.8:1).
- **Avatar** (`components/ui/Avatar.jsx`): initials. Navy on light surfaces, outlined white on navy.
- **Badge / StatusMark / PriorityMark / PriorityTile** (`components/ui/Marks.jsx`): see the state table above.
- **Fields, dialogs, toasts, empty and error states, search palette, account menu, photos, timeline:** unchanged in behaviour and restyled through the tokens. Dialogs become full-screen sheets on phones.

## Do's and Don'ts

### Do
- Put the next action in solid blue, and only one solid blue button per area.
- Name the reference for every change, and compute it from real history.
- Use the team's words: *mašina*, *kvar*, *preuzeti*.
- Add every string to both `src/i18n/hr.js` and `en.js`. `npm run check:i18n` enforces parity and flags unused keys.

### Don't
- Add a second dark surface, gradients, glows or a second accent colour.
- Use colour as the only signal, or invent a number to fill a card.
- Put a bar above the phone keyboard on a form.

## Accessibility

The target is WCAG 2.2 AA. The e2e suite runs axe-core on every screen, including the new home screens, profile and the report steps. Text is at least 4.5:1, control borders at least 3:1, and every screen has a visible 2 px focus ring. Touch targets are at least 44 px, and the tab bar items are 56 px tall. The report stepper is an ordered list with `aria-current="step"`, and each step's heading takes focus. The machine list is a native radio group. Fault-detail tabs are a `tablist` on phones. Reduced motion disables entrance animations and pulses.

## Motion

`enter-rise` (260 ms) is for dialogs, toasts and the confirmation screen. `enter-fade` (200 ms) is for menus and the bell. Colour transitions take 150 ms. All motion is off under `prefers-reduced-motion`.
