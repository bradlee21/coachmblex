# UI System (Page Layout + Component Conventions)

Dev-facing conventions for page layout and common UI patterns. Use this as the default spec for new pages and targeted UI fixes.

## Goals

- Keep page structure consistent across routes.
- Make layout choices explicit (centered vs full width).
- Reuse shared UI patterns for states, buttons, and keyboard hints.
- Prefer minimal diffs when updating existing pages.

## Page Templates

### A) Standard Page

Use for most app screens (`/settings`, `/review`, `/progress`, content pages).

- Header row:
  - `h1` title
  - Optional subtitle/helper text (`.muted`)
  - Optional actions (buttons/links) aligned with header area, not inside content cards
- Content:
  - 1+ sections/cards stacked vertically
  - Each section should have a clear heading or purpose
- Best for:
  - Settings, summaries, dashboards, read/write forms

Recommended structure:

```md
Page header (title + subtitle + actions)
Section/card
Section/card
Optional status/empty state
```

### B) Practice Page (Runner-Style)

Use for focused task flows (`/today`, `/flashcards`, question runners, drills).

- Header:
  - `h1` title
  - Short instruction line (`.muted`)
  - Any nav/back action belongs in the page header row (de-emphasized secondary action)
- Runner content:
  - Progress/meta row (step/card count, mode badge)
  - Centered primary card (`.runner`)
  - Primary interaction controls (flip/submit)
  - Secondary controls (ratings, skip, etc.)
  - Explanation/details area appears after the reveal/answer step when applicable
- Best for:
  - Single-item workflows with hotkeys and repeated interactions

Recommended structure:

```md
Page header (title + instructions + optional back action)
Centered runner card
Hotkey hints / action row
Reveal-only explanation/details
Completion state (review again / next action)
```

### C) Data Page

Use for admin/search/list management screens (`/admin/questions` and similar).

- Header row:
  - `h1` title
  - Subtitle/help text
  - Primary action button (e.g. Create)
- Controls row:
  - Filters, search, tabs, sort
  - Keep controls above the list/table
- Content:
  - Table or list
  - Pagination/load more if needed
  - Empty state and loading state in the same content region
- Best for:
  - Searchable, filterable datasets and CRUD screens

Recommended structure:

```md
Page header (title + subtitle + primary action)
Filters/search row
Table/list container
Empty/loading/error states in-place
```

## Layout Tokens

These are practical defaults based on current app styles.

### Desktop Max Widths

- Standard Page:
  - Use `.content` default max width: `980px`
- Practice Page:
  - Use centered page wrapper (`.today-page`, `.flashcards-page`) at `56rem` on desktop (`>= 1024px`)
  - Keep the main runner card centered within that wrapper
- Data Page:
  - Start with `.content` (`980px`)
  - Use full width (`.content--practice`-style or page-specific full-width wrapper) only when table density genuinely needs it

### Centering Rules

- Center the page (`max-width` + auto margins) when the main task is a single focused interaction:
  - Practice runners
  - Single forms
  - Reading/review screens
- Use wider/full-width layouts when the page is data-dense:
  - Tables
  - Multi-panel admin tools
  - Complex filter/control surfaces
- Center the primary card/component even inside a wider page when it is the main interaction target.

### Spacing / Padding Standards

- Page padding:
  - Default `.content` padding is `24px`
- Card/container spacing:
  - Use stacked sections/cards with consistent vertical spacing (current `.runner` uses `margin-top: 16px`)
- Card padding:
  - Current runner/card standard is `16px`
- Button row spacing:
  - Use `.button-row` (`gap: 8px`)
- Keep header text compact:
  - Title, then one short `.muted` helper line before main content

## UI Patterns

### Buttons (Primary / Secondary)

- Primary button:
  - Use for the page's main action only (submit, create, start, reveal when it is the main action)
  - Place near title in header row for page-level actions
  - Place first in action row for task-level actions
- Secondary button:
  - Use for back/nav, cancel, reset, optional actions
  - Prefer de-emphasized placement in header row (not inside the primary content card header unless the card itself owns the navigation)
- Button rows:
  - Group related actions in `.button-row`
  - Avoid mixing page-level navigation with per-card controls

### Empty / Loading / Error States

- Loading:
  - Use short plain copy near the top of the content region (e.g. `Loading ...`)
- Error:
  - Use `.status.error` with actionable copy if possible
  - Keep the error in the same region where content would render
- Empty:
  - Render inside the same card/container style used by the page (e.g. `.runner` or list container)
  - Include one clear next step when applicable (create, refresh, change filters)

### Keyboard Hint Style

- Show keyboard hints inline in labels when the action is core to the flow:
  - Example: `Show Answer (Space)`
- Keep labels stateful:
  - The control text should describe the result of pressing it (not a generic "Flip" if state-specific wording is clearer)
- Put one short hotkey instruction line under the page title for practice pages.
- Gate advanced hints/actions until relevant state is reached (example: rating hotkeys only after reveal).

## New Page Checklist

- Pick a template first: Standard, Practice, or Data.
- Set page width intentionally (`980px`, `56rem` centered, or full width).
- Put title/subtitle/actions in a clear page header row.
- Keep page-level navigation/actions out of card headers unless necessary.
- Reuse shared patterns for loading, empty, and error states.
- If hotkeys exist, show concise hints and make button labels reflect current state.
- Verify desktop alignment/centering matches the chosen template.
