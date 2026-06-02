# Design System

## Purpose

Define the visual language, design tokens, component strategy, and interaction patterns for DocFlow. This file is the single source of truth for how the product **looks and feels**. If [ui.md](./ui.md) describes _what_ each screen contains, this file describes _how_ it's built.

Implementation is in the app (Tailwind config, React components). This spec is the contract the app honors.

## Responsibilities

- Pin every design token (color, type, spacing, radii, motion).
- Choose the component library and list components used.
- Specify per-component visuals and behavior.
- Define interaction patterns that cut across screens (tables, command palette, status pills, avatars).
- Enforce the "no shadows, no gradients" rule codified at every level.

## Principles

These are **absolute**. Every component, every screen. No exceptions.

1. **No shadows.** Elevation is expressed with borders + layering. Modals use `border + backdrop-blur`. Popovers use `border` alone.
2. **No gradients.** Anywhere. Ever.
3. **No saturated colors.** Backgrounds max `/10` opacity of the source color. Text colors never at full saturation except black `#1A1A1A`.
4. **Monochrome base.** Color is reserved for **status** and **identity** (avatars). Never decorative.
5. **Borders define elevation.** `1px solid var(--border)` is the hero effect.
6. **Density over spaciousness.** B2B operators scan. Rows are 32–36px. Padding is miserly.
7. **Table-first.** Inbox and Processed are data grids, not card lists.
8. **Keyboard-first.** `⌘K`, arrow keys, `Enter` to commit, `Esc` to cancel. Every primary action has a shortcut.
9. **Sharp-ish corners.** `4px` on controls, `6px` on surfaces, `0px` or `pill` on specific patterns only.
10. **1 typeface family.** Inter for UI, Geist Mono for numbers/IDs/code.

## Influence map

Where each aesthetic decision comes from, with weights:

- **Attio 65%** — primary reference. Tables, record-detail layout, status pills with subtle tints, ⌘K centrality, avatar identity.
- **Vercel 25%** — rigor. Monochrome discipline, black primary button, no shadows, flat surfaces.
- **Linear 5%** — motion (120–180ms, subtle), keyboard primacy, command palette polish.
- **Resend 3%** — form/settings breathing room.
- **Tailscale 2%** — admin hierarchy, quiet status dots.

## Tokens

### Color — neutral

```
--bg            #FAFAF9    page background (warm white, not pure)
--surface       #FFFFFF    cards, modals, dialogs, inputs
--surface-mute  #F5F5F4    subtle row hover, disabled surfaces
--border        #E4E4E3    all dividers, input borders, card borders
--border-hv     #A8A8A6    hover state on interactive borders
--fg            #1A1A1A    primary text, primary button bg
--fg-mute       #6B6B6B    secondary text, table header, helpers
--fg-subtle     #9B9B99    placeholders, disabled text
--overlay       rgba(10,10,10,0.4)    modal scrim (with backdrop-blur)
```

### Color — accent palette (Attio-style, 8 tints)

Used for **status pills**, **avatars**, **property icons**, **category chips**. Never for decoration. All pre-muted — saturation stays low.

```
slate     #64748B
sand      #A8A29E
amber     #B45309
teal      #0F766E
rose      #E11D48
pink      #DB2777
violet    #7C3AED
blue      #2563EB
```

Applied as **4 variants** per color:

| Variant     | Use                             | Formula                           |
| ----------- | ------------------------------- | --------------------------------- |
| `bg`        | Pill / chip / avatar background | `{color} at 10% alpha`            |
| `bg-strong` | Avatar background (solid tint)  | `{color} at 100% with text white` |
| `fg`        | Pill / chip text                | `{color}` darkened 15% if needed  |
| `border`    | Pill / chip border              | `{color} at 20% alpha`            |

### Color — semantic aliases

For things that mean something (not decoration):

```
--info      blue        (processing states, neutral info)
--warning   amber       (needs attention — not errors)
--danger    rose        (errors, destructive actions)
--success   teal        (completed, synced)
--neutral   slate       (rejected, archived, inactive)
```

### CSS variables (root)

```css
:root {
  /* neutral */
  --bg: #fafaf9;
  --surface: #ffffff;
  --surface-mute: #f5f5f4;
  --border: #e4e4e3;
  --border-hv: #a8a8a6;
  --fg: #1a1a1a;
  --fg-mute: #6b6b6b;
  --fg-subtle: #9b9b99;
  --overlay: rgba(10, 10, 10, 0.4);

  /* accents — hex; Tailwind generates /10, /20 automatically */
  --slate: #64748b;
  --sand: #a8a29e;
  --amber: #b45309;
  --teal: #0f766e;
  --rose: #e11d48;
  --pink: #db2777;
  --violet: #7c3aed;
  --blue: #2563eb;

  /* radii */
  --radius-sm: 4px;
  --radius-md: 6px;

  /* motion */
  --ease: cubic-bezier(0.2, 0, 0, 1);
  --dur-fast: 120ms;
  --dur-med: 180ms;
}
```

### Tailwind config (reference shape)

```ts
// tailwind.config.ts
export default {
  content: [...],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-mute': 'var(--surface-mute)',
        border: 'var(--border)',
        'border-hv': 'var(--border-hv)',
        fg: 'var(--fg)',
        'fg-mute': 'var(--fg-mute)',
        'fg-subtle': 'var(--fg-subtle)',
        slate:  'var(--slate)',
        sand:   'var(--sand)',
        amber:  'var(--amber)',
        teal:   'var(--teal)',
        rose:   'var(--rose)',
        pink:   'var(--pink)',
        violet: 'var(--violet)',
        blue:   'var(--blue)',
      },
      borderRadius: { sm: '4px', md: '6px' },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs:   ['12px', { lineHeight: '16px' }],
        sm:   ['13px', { lineHeight: '20px' }],
        base: ['14px', { lineHeight: '20px' }],
        md:   ['16px', { lineHeight: '24px' }],
        lg:   ['20px', { lineHeight: '28px' }],
        xl:   ['24px', { lineHeight: '32px' }],
      },
      boxShadow: { none: 'none' },  // explicit: we do not use shadows
      transitionDuration: { fast: '120ms', med: '180ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.2, 0, 0, 1)' },
    },
  },
  plugins: [],
}
```

### Typography

- **Inter** for all UI text. Loaded via `next/font/google` with weights `400, 500, 600`.
- **Geist Mono** for PO numbers, IDs, SKUs, timestamps, code. Loaded via `next/font`.
- `font-feature-settings: "tnum" 1, "ss01" 1;` globally — tabular numbers + the Inter stylistic set that renders `i` without a dot (cleaner look).
- Weight usage:
  - `font-normal (400)` → body text
  - `font-medium (500)` → emphasis, table headers, button labels, nav
  - `font-semibold (600)` → page titles (sparingly)
  - **Never `bold (700)` or heavier** — too loud for this aesthetic.
- Line heights are tight (see scale above). Don't override.
- Letter spacing: `tracking-normal` everywhere except `tracking-wide` on table headers in `uppercase text-xs`.

### Spacing scale

```
0   0        4   16       10  40
1   4px      5   20       12  48
2   8        6   24       16  64
3   12       8   32       20  80
```

Use only these. No `padding: 10px`. If it's not on the scale, the designer picked wrong.

### Radii

- `rounded-sm` (4px) → inputs, buttons, badges
- `rounded-md` (6px) → cards, dialogs, popovers, dropdown menus, command palette
- `rounded-full` → avatars, status dots only
- **Never `rounded-lg` or `rounded-xl`** — not in this product.

### Borders

- Default weight: `1px`
- Color: `var(--border)` at rest, `var(--border-hv)` on hover for interactive things
- Radius applied to outer element
- Never double-border (parent + child both with border). Pick one.

### Motion

- Timing function: `cubic-bezier(0.2, 0, 0, 1)` (ease-out, subtle)
- Durations:
  - **Hovers**: `120ms` (fast)
  - **Layout transitions** (dialog open, drawer slide): `180ms` (med)
- Animations:
  - ✅ `opacity`, `translateY(2px)`, `scale(0.98 → 1)` subtle
  - ❌ No spring, no bounce, no parallax, no shimmer, no letter-by-letter reveals
- Reduced motion: respect `prefers-reduced-motion` — fades only, no transforms.

## Component library strategy

**Foundation**: [shadcn/ui](https://ui.shadcn.com) on Radix primitives + Tailwind. Copy-paste into the app, own the code.

**Why shadcn/ui**:

- Headless by default — the tokens above actually apply.
- Radix under the hood → accessibility is solid.
- Not a black box — we edit freely.
- Matches the "Vercel/Attio" visual vocabulary out of the gate with minimal overrides.

**Command palette**: [`cmdk`](https://cmdk.paco.me) (Paco Coursey's, same as Vercel/Linear/Raycast).

**PDF viewer**: [`react-pdf`](https://github.com/wojtekmaj/react-pdf). Minimal chrome, our own controls.

**Icons**: [`lucide-react`](https://lucide.dev). Stroke weight `1.5`, size `16px` as default, `20px` for larger affordances. No Phosphor, no Heroicons.

**Tables**: [`@tanstack/react-table`](https://tanstack.com/table). Headless — we bring our own markup.

**Forms**: `react-hook-form` + `zod`.

**Toast**: [`sonner`](https://sonner.emilkowal.ski) — matches our aesthetic with minimal tweaking.

### Components we install from shadcn

```
button        input         textarea      select
checkbox      switch        radio-group   label
dialog        alert-dialog  drawer        sheet
dropdown-menu popover       tooltip       context-menu
tabs          separator     badge         avatar
skeleton      command       (cmdk wrapper)
toast         (sonner wrapper)
table         (styled wrapper around @tanstack/react-table)
form          (react-hook-form wrapper)
```

**Do not install**: accordion (not used in Phase 1), carousel, progress (use skeleton), calendar (use native date input for now — revisit in Phase 2).

## Component specs

### Button

Three variants. Sizes `sm` (28px) and `md` (32px — default).

| Variant     | Background  | Border      | Text   | Hover                           |
| ----------- | ----------- | ----------- | ------ | ------------------------------- |
| `primary`   | `fg`        | `fg`        | white  | `bg-fg-mute`                    |
| `secondary` | `surface`   | `border`    | `fg`   | `border-border-hv`              |
| `ghost`     | transparent | transparent | `fg`   | `bg-surface-mute`               |
| `danger`    | `rose/10`   | `rose/20`   | `rose` | `bg-rose/15` + `border-rose/30` |

Sizing:

- `sm`: `h-7 px-2.5 text-xs`
- `md`: `h-8 px-3 text-sm`
- Icon-only: square, `h-8 w-8`, icon centered.

Focus: `outline-none` + `ring-2 ring-fg/20 ring-offset-1 ring-offset-bg`.

Disabled: `opacity-50 cursor-not-allowed`. No hover change.

Loading: swap label for `<Spinner />` (small animated dots, not a spinner wheel), keep size stable.

### Input / Textarea / Select

```
h-8 px-2.5 text-sm
bg-surface text-fg
border border-border rounded-sm
placeholder: text-fg-subtle
focus: border-fg outline-none     // no ring — just darker border
disabled: bg-surface-mute text-fg-subtle
```

- Never a colored focus ring. Border color shift is the signal.
- Invalid: `border-rose` with inline `<p class="text-xs text-rose mt-1">{error}</p>`.
- Label above: `text-xs text-fg-mute font-medium mb-1`.
- Helper text below: `text-xs text-fg-subtle mt-1`.

### Badge (status pill)

Base:

```
inline-flex items-center gap-1.5
h-5 px-1.5 rounded-sm
text-xs font-medium
border
```

With status dot:

```
<Badge color="blue">
  <span class="h-1.5 w-1.5 rounded-full bg-blue" />
  Needs review
</Badge>
```

Per color (`{c}`):

```
bg-{c}/10  text-{c}  border-{c}/20
```

Neutral (rejected, archived):

```
bg-surface-mute text-fg-mute border-border
```

### Avatar

```
rounded-full
h-5 (table), h-6 (lists), h-8 (nav), h-10 (profile)
text-[11px] / 12px / 13px / 15px
font-medium text-white
bg-{color}-strong     // solid accent tint
```

Color selection: deterministic hash of `user.email` modulo 8 → index into the accent palette.

```ts
const palette = ["slate", "sand", "amber", "teal", "rose", "pink", "violet", "blue"] as const;
function avatarColor(email: string) {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}
```

Fallback when no name: show a single `•` or the first letter of email.

### Table

Structure (TanStack headless + our styling):

```
<table class="w-full text-sm">
  <thead class="bg-bg sticky top-0 z-10">
    <tr class="border-b border-border">
      <th class="px-3 py-2 text-left text-xs font-medium text-fg-mute uppercase tracking-wide">
        ...
      </th>
    </tr>
  </thead>
  <tbody>
    <tr class="border-b border-border hover:bg-surface-mute
               [&[data-selected=true]]:bg-fg/5
               [&[data-selected=true]]:border-l-2
               [&[data-selected=true]]:border-l-fg">
      <td class="px-3 py-2"> ... </td>
    </tr>
  </tbody>
</table>
```

Row height: 36px (py-2 + 20px line-height).

**Interactions** (see [Patterns](#patterns) for detail):

- Click row → opens detail (Review screen).
- `⌘click` or checkbox → toggle selection.
- `Shift+click` → range select.
- `↑ ↓` → move keyboard focus row-to-row.
- `Enter` on focused row → open detail.
- Column resize: drag on right edge of header cell; persist widths in localStorage per tenant.
- First column **sticky** when horizontal scroll is possible.
- Bulk action bar (see below) appears at bottom when selection count > 0.

### Dialog / Modal

```
scrim:     fixed inset-0 bg-overlay backdrop-blur-sm
panel:     bg-surface border border-border rounded-md
           max-w-lg w-full mx-auto
           animate: opacity + translateY(2px)
header:    px-5 py-4 border-b border-border
body:      px-5 py-4
footer:    px-5 py-3 border-t border-border flex justify-end gap-2
```

Never has a shadow. The backdrop-blur + border is enough.

Close on `Esc`, click outside, or explicit button (top-right `×` icon-only ghost button).

### Dropdown menu / Popover

```
bg-surface border border-border rounded-md
py-1 min-w-[180px]
animate: opacity + translateY(2px)
```

Menu item:

```
flex items-center gap-2
px-2.5 py-1.5 text-sm
text-fg
hover: bg-surface-mute
disabled: text-fg-subtle
destructive: text-rose hover:bg-rose/10
keyboard-shortcut hint (right-aligned): text-xs text-fg-subtle
```

Separator: `my-1 border-t border-border`.

No shadow. The border does the work.

### Toast (sonner)

Configured to match:

- `bg-fg text-white border-none` (high contrast, like Linear/Vercel)
- `rounded-md py-2.5 px-3 text-sm`
- Auto-dismiss 4s default
- Position: `bottom-right`
- Stack: 3 visible, rest queued
- No icon by default; success/error variants use a 6px color dot on the left (teal / rose)

### Tooltip

```
bg-fg text-white
px-2 py-1 text-xs rounded-sm
delay 400ms (Radix default)
max-w-[220px]
```

Arrow: triangle pointing at trigger, same bg.

### Command palette (⌘K)

Full spec in [Command palette](#command-palette-k) below.

### Tabs

Underline style (Attio):

```
flex gap-4 border-b border-border
each tab: px-0 py-2 text-sm text-fg-mute
active: text-fg, border-b-2 border-fg -mb-px
```

No pill tabs. No background fill. Underline only.

### Skeleton

```
bg-surface-mute
rounded-sm
animate: pulse opacity 0.5 → 1 at 1.2s linear infinite
```

For table skeletons, render 8 rows of skeleton cells matching column widths.

## Patterns

### Status pill system

Mapping of domain states to pill colors (centralized — defined once, used everywhere):

| Domain state                            | Color   | Label (i18n key)                     |
| --------------------------------------- | ------- | ------------------------------------ |
| `documents.state='uploaded'`            | slate   | `status.uploaded`                    |
| `documents.state='processing'`          | blue    | `status.processing` (+ animated dot) |
| `documents.state='needs_review'`        | amber   | `status.needs_review`                |
| `documents.state='reviewed'`            | teal    | `status.reviewed`                    |
| `documents.state='failed_processing'`   | rose    | `status.failed`                      |
| `documents.state='rejected'`            | neutral | `status.rejected`                    |
| `documents.state='archived'`            | neutral | `status.archived`                    |
| `order_drafts.sync_state='pending'`     | slate   | `sync.pending`                       |
| `order_drafts.sync_state='in_progress'` | blue    | `sync.in_progress` (+ animated dot)  |
| `order_drafts.sync_state='synced'`      | teal    | `sync.synced`                        |
| `order_drafts.sync_state='sync_failed'` | rose    | `sync.failed`                        |

Implemented as a single `<StatusBadge state={...} domain="document" />` component — source of truth for the mapping.

### Avatar color hashing

See [Avatar](#avatar). Always deterministic, same user always gets same color across sessions.

### Table interactions

Selection model:

- `selectedRows: Set<rowId>` in component state
- Click row body → navigate to detail (does not select)
- Click checkbox OR `⌘/Ctrl+click` row → toggle selection
- `Shift+click` → select range from last selected
- `⌘/Ctrl+A` when table focused → select all on current page
- `Esc` → clear selection

Keyboard nav:

- `↑ ↓` → move visual focus (distinct from selection)
- `Enter` → open focused row
- `Space` → toggle selection on focused row
- `j` / `k` → alternate row nav (Linear-style)

Bulk action bar (appears when `selectedRows.size > 0`):

```
fixed bottom-4 left-1/2 -translate-x-1/2
bg-fg text-white border-none
rounded-md px-3 py-2 text-sm
flex items-center gap-3
```

Shows count + actions (retry, reject, archive). Not a sticky footer — a floating toast-like bar.

Column resize:

- Drag handle on right edge of `<th>` (2px wide, visible on hover)
- Min width: 60px
- Max width: 600px
- Double-click handle → auto-fit to content
- Persisted to localStorage as `intake:table:{table_id}:widths`

Sticky first column:

- When scrollable horizontally, first column gets `sticky left-0 bg-bg z-[5]`
- A `border-r border-border` on the sticky cell prevents content bleeding on scroll

### Empty / loading / error states

All three primitives share structure:

```
centered column, max-w-xs, py-12
icon (optional): 32px, text-fg-subtle
title: text-sm font-medium text-fg
subtitle: text-xs text-fg-mute
cta (optional): secondary button
```

**Empty**: friendly copy, a CTA if relevant.
**Loading**: skeleton rows, no spinner.
**Error**: the error code (i18n'd) + "Retry" secondary button. Never show raw stack traces.

### Banners

Used for page-level signals (e.g. "2 documents failed processing" at top of Inbox, "ERP connection unhealthy" in Settings).

```
flex items-center gap-3 px-4 py-2.5
border border-{color}/20 bg-{color}/5 rounded-md
text-sm text-{color}
```

Dismissible with a `×` on the right. Never auto-dismiss (this is state info, not a notification).

## Command palette (⌘K)

### Global shortcuts

| Shortcut        | Action                            |
| --------------- | --------------------------------- |
| `⌘K` / `Ctrl+K` | Open command palette              |
| `⌘Shift+U`      | Upload (opens dropzone)           |
| `⌘1`            | Go to Inbox                       |
| `⌘2`            | Go to Review (current doc if any) |
| `⌘3`            | Go to Processed                   |
| `⌘,`            | Go to Settings                    |
| `g i`           | Inbox (Vim-style, no modifier)    |
| `g p`           | Processed                         |
| `g s`           | Settings                          |
| `?`             | Show shortcuts cheat sheet        |

### Contextual shortcuts — Review screen

| Shortcut | Action                              |
| -------- | ----------------------------------- |
| `⌘Enter` | Approve (if enabled)                |
| `⌘⇧R`    | Reject (opens reason picker)        |
| `⌘E`     | Focus first editable field          |
| `⌘⇧N`    | Next document in Inbox              |
| `⌘⇧P`    | Previous document                   |
| `Esc`    | Back to Inbox (confirms if unsaved) |

### Command palette contents

Sections, in order:

1. **Search** (free text over document PO numbers, buyer names, filenames)
2. **Recent documents** (last 5 viewed, per tenant)
3. **Navigate** (Inbox, Review, Processed, Settings — with shortcuts shown)
4. **Actions** (Upload, Invite member [owner-only], Test ERP connection [owner-only])
5. **Help** (keyboard shortcuts, documentation link)

Visuals:

```
dialog style (see Dialog spec) but:
  max-w-xl
  no header/footer — just body
  body = cmdk <Command.List />
input: h-11 px-4 text-base border-b border-border
items: h-9 px-4 text-sm flex items-center gap-3
items hover/keyboard: bg-surface-mute
section headers: text-xs text-fg-mute uppercase tracking-wide px-4 py-1.5
icons: 16px text-fg-mute
shortcut hints: right-aligned, text-xs text-fg-subtle
  each key in a kbd: border border-border rounded-sm px-1 py-px text-[11px]
```

Empty state inside palette: `text-sm text-fg-mute text-center py-8` — e.g. "No matches for 'foobar'".

### i18n

Command labels, section headers, and empty states are all i18n keys under `command.*`:

```
command.placeholder
command.section.recent
command.section.navigate
command.section.actions
command.section.help
command.action.upload
...
```

## Review screen — 3-column layout (canonical)

Supersedes the 2-pane sketch in [ui.md](./ui.md). That file should reference this section.

```
┌────────────────────────────────────────────────────────────────────┐
│  ← Inbox   ACME-123 · Acme Corp      ⌘⇧N next    [Reject▾] [Approve]│
├───────────────┬────────────────────────────────────┬─────────────┤
│  PROPERTIES   │         PDF (sticky)               │  EXTRACTION │
│   240px       │         flex-1                     │  420px      │
│               │                                    │             │
│  ─ Key facts                                       │   Header    │
│  PO Number    │                                    │   Buyer     │
│  ACME-123     │                                    │   Address   │
│               │                                    │   ─ Lines   │
│  Date         │                                    │   Item 1    │
│  04-16-2026   │                                    │   Item 2    │
│               │                                    │   Totals    │
│  Currency     │                                    │             │
│  USD          │                                    │             │
│               │                                    │             │
│  Customer     │                                    │             │
│  [●] Acme Corp│                                    │             │
│               │                                    │             │
│  Total        │                                    │             │
│  $145.00      │                                    │             │
│               │                                    │             │
│  ─ Activity   │                                    │             │
│  •  Uploaded  │                                    │             │
│     10:39 MM  │                                    │             │
│  •  Processed │                                    │             │
│     10:41 AI  │                                    │             │
│  •  Edited 2x │                                    │             │
│     10:45 MM  │                                    │             │
└───────────────┴────────────────────────────────────┴─────────────┘
```

### Columns

**Left — Properties panel (240px)**

- **Key facts** block: PO number, date, currency, customer (with mapping badge), total. Read-only here (edits happen in right column).
- **Activity** block: chronological event log from `workflow_events` + edits, with avatar + timestamp + one-line description.
- Scrollable independently.
- Collapsible: `⌘B` toggles (hides to 48px strip with icons only).

**Center — PDF pane (flex-1)**

- Same as before. `react-pdf`. Page thumbnails along top or left edge.
- Sticky — does not scroll with other panes.
- Relevant pages get an `accent-teal` left border on their thumbnail; irrelevant a `neutral` faded treatment.

**Right — Extraction editor (420px)**

- Same editable form as before: Header, Lines, Totals, Notes.
- Scrollable.
- Sections use `<Tabs>` underline style if we need to split header vs. lines — for Phase 1, keep as a single scrollable form.

### Top bar

- Back to Inbox (arrow button, ghost)
- Breadcrumb: PO number · buyer (read-only label)
- Right side: `⌘⇧N next` keyboard hint, then Reject dropdown, then Approve primary button
- `h-12 border-b border-border px-4`

### Responsive

- ≥ 1440px: 240 / flex / 420 — as designed
- 1280–1439px: 220 / flex / 380 — properties + extraction shrink
- < 1280px: properties panel collapses to icon strip by default; PDF + extraction split 50/50

## Accessibility

- Color contrast ≥ AA on all text/background pairs (verified per pair — see `/design-tests/contrast.ts`).
- Keyboard focus visible at all times — `ring-fg/20` on interactive elements at focus.
- ARIA: `role="status"` on badges announcing state, `aria-live="polite"` on toast container, `aria-describedby` on inputs with help/error text.
- `<Label>` always pairs with its input (`htmlFor`).
- Modal focus trap (Radix handles by default — do not disable).
- Reduced motion: respected per token above.
- No color-only signals — every status has an icon or text label.

## Dark mode

**Out of scope for Phase 1.**

But: tokens are defined as CSS variables so a future `[data-theme='dark']` override is a single file. Do not ship the dark palette yet; do not add theme-switching UI.

## i18n inside components

- Every component that renders copy accepts an i18n key, never hardcodes.
- Component-level copy (e.g. the `×` close button of a dialog) uses `common.*` namespace.
- Screen-level copy uses the screen's namespace (`inbox.*`, `review.*`, etc).
- Shortcut hints in command palette are language-agnostic (rendered `⌘K`, `Ctrl+K` based on OS).
- Currency formatting uses `Intl.NumberFormat` with the order's currency; date formatting uses `Intl.DateTimeFormat` with tenant's locale.

## Success criteria

- Zero `box-shadow` rules in any compiled CSS (enforce with a PostCSS plugin or stylelint rule).
- Zero hex colors outside the tokens defined here (enforce with stylelint: `color-no-hex` except within `:root`).
- Zero `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl` usage (enforce with ESLint Tailwind plugin).
- All status pills across the app resolve through a single `<StatusBadge />` component.
- All avatars resolve through a single `<Avatar />` component.
- Design review on each PR that adds or changes a component — checked against this file.

## Dependencies

- [ui.md](./ui.md) — screens reference the components and patterns defined here.
- [README.md](./README.md) — i18n convention.
- [product.md](./product.md) — "premium B2B SaaS look" principle concretely realized here.
- **External (target versions, April 2026)**: Next.js 16.2, React 19.2, Node.js 24 LTS, TypeScript 5.7+, Tailwind CSS 4.2, pnpm 9.x, shadcn/ui (latest), cmdk, react-pdf, lucide-react, @tanstack/react-table, react-hook-form, zod, sonner, next/font (Inter + Geist Mono). Always pick the latest stable of each at setup time.
