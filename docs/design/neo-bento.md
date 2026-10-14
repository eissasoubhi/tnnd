# TNND Neo Bento — Design System v1

**Status:** approved visual direction · implementation in progress  
**Figma:** https://www.figma.com/design/HM86imsTxQGfuilebN6Npt  
**Code:** `apps/web/src/neo-bento.css` (imported after `styles.css`) and `public/neo-bento.css` (shared extension stylesheet)  
**Scope:** TNND web dashboard, Identity Builder, Personal Memories, Conversations, Action Center, Analytics and Settings. Extension popup, settings and chat preview are independently themed by the shared extension stylesheet.

## Brand concept

**Expressive organization, calm interaction.** TNND should feel like a modern, human-centered AI product, not a generic enterprise admin screen.

- Forest green establishes trust and anchors interactive controls.
- Mint indicates healthy/active/positive activity; lilac indicates identity, memory and AI review; peach indicates pending attention.
- Bento tiles establish hierarchy through size, grouping and purposeful color, never color alone.
- Surfaces use generous negative space, 18–24px radii, crisp typography and a restrained shadow.
- Data and actions remain readable in both light and dark themes; the product never claims a suggested reply was sent without user confirmation.

## Color foundations

| Semantic token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--nb-bg` | `#F6F8F3` | `#101E1A` | App canvas |
| `--nb-surface` | `#FFFFFF` | `#192C26` | Content surfaces |
| `--nb-surface-soft` | `#EDF4EB` | `#1E3A34` | Subtle background |
| `--nb-text` | `#162A24` | `#FFFFFF` | Main text |
| `--nb-text-muted` | `#56716A` | `#B8CFC1` | Secondary text |
| `--nb-border` | `#C8D8CD` | `#3D554B` | Borders |
| `--nb-primary` | `#264B40` | `#D9EFCC` | Primary CTA |
| `--nb-primary-hover` | `#1E3A34` | `#C1E6B5` | CTA hover |
| `--nb-on-primary` | `#FFFFFF` | `#101E1A` | CTA text |
| `--nb-focus` | `#7565DE` | `#B7A9FF` | Focus ring |
| `--nb-mint` | `#D9EFCC` | `#2E4934` | Active/success tile |
| `--nb-lilac` | `#E5E1FC` | `#3A3557` | AI/memory tile |
| `--nb-peach` | `#FFDFC3` | `#503B31` | Attention tile |
| `--nb-danger` | `#B34243` | `#F6C9A6` | Destructive accent / border |
| `--nb-danger-text` | `#9D3034` | `#F6C9A6` | AA-contrast destructive text on danger-soft surface |

Do not encode meaning using color alone: pair with text, status label or icon. Don't place white text on light mint/lilac/peach.

## Typography

Typeface: **DM Sans**, falling back to Inter and system UI fonts when unavailable. Production CSS does not request fonts from third-party CDNs. Figma has text styles:

| Style | Weight | Size | Line-height |
| --- | --- | --- | --- |
| Display | Bold | 42px | 45px |
| Heading 1 | Bold | 32px | 36px |
| Heading 2 | Bold | 24px | 29px |
| Heading 3 | Bold | 18px | 23px |
| Body | Regular | 14px | 21px |
| Label | SemiBold | 12px | 17px |
| Caption | Medium | 11px | 16px |

Use display sparingly (page hero only). Never shrink interactive labels to caption size.

## Spacing, geometry and elevation

Spacing tokens: **4, 8, 12, 16, 20, 24, 32, 40, 48px**.  
Radii: **10px** controls, **14px** navigation, **18px** tiles, **24px** panels/hero.  
Minimum interactive target: **44 × 44px**; visible keyboard focus: **3px** solid `--nb-focus` with 3px offset.  
Shadows: light, soft, minimal; no thick neon glow or glassmorphism over text.

## Components and states

- **Buttons:** primary, secondary, destructive and disabled; explicit hover/focus/busy states. Use primary for one leading action per card.
- **Inputs:** labels above fields, help/error text beneath, visible focus and disabled state.
- **Navigation:** persistent sidebar on desktop, horizontally scrollable navigation on tablet/mobile. Active location marked visually and with `aria-current`.
- **Bento tiles:** mint for active, lilac for identity/memory, peach for actions, neutral for paused/secondary; all must contain descriptive text.
- **Conversation rows:** selected row has inset forest stripe and selected background. Keep message direction visually distinct.
- **Review flows:** distinguish draft, approved, in progress and failure. Never optimistically display approval before server confirmation.
- **Empty/error/loading states:** informative copy, no fabricated analytics, no placeholder numbers presented as real user data.

## Responsive behavior

- **≥1181px:** left navigation + 4 summary tiles + 12-column panel grid.
- **841–1180px:** compact sidebar + 2 summary tiles per row; panels expand full width.
- **≤840px:** top navigation scrolls horizontally; one-column content.
- **≤560px:** two compact summary tiles per row, stacked forms and readable full-width panels.

Respect `prefers-reduced-motion` and `prefers-color-scheme`. Keyboard access and WCAG AA text contrast are acceptance requirements; contrast and visual QA should be checked against rendered browser states, not inferred solely from token values.

## Figma deliverables

The file contains a **Neo Bento · Foundations & Components** page with color, type and spacing specimens plus reusable component masters, and a **Neo Bento · Product Screens** page with desktop dashboard, desktop conversations and mobile dashboard examples. Colors are represented as primitive and semantic Figma variables.

**Figma Starter limitation:** this file supports only one variable mode per collection, so light and dark semantic variables use separate collections rather than one collection with two modes. CSS implements automatic theme switching with `prefers-color-scheme`.


## Workspace navigation and density rules (UX v2)

The workspace is **section-first**, not a long page of every feature. Sidebar/hash navigation switches visible panels while keeping the existing forms mounted and preserving unsaved input states. Lazy loaded panels are assigned to a stable section and late mounts honor the current hash. Deep links (for example `#ai-provider-form` and `#memory-source`) open the owning section automatically.

| Section | Primary panels |
| --- | --- |
| Overview | Compact hero, real conversation stats, setup checklist and suggested next steps |
| Conversations | Inbox, conversation management and explicit takeover review |
| Identity | Approved Identity Builder and optional writing-style learning |
| Memories | Approved personal story library and review |
| Action Center | Pending human decisions |
| Analytics | Analytics and memory insights |
| Settings | Baseline communication preferences, Gemini, connected account, import/export, privacy |

**Density and hierarchy:** keep a single main task per view. Overview-only metrics are never duplicated alongside the inbox totals. Important style controls show a stored value and independent Auto-adapt toggle; group them into accessible details sections. Collapse less frequently changed writing/retention fields by default. Long profile editors must span the available workspace rather than sit alongside an unrelated short card and create tall empty gaps.

**Authentication:** signed-in users see their connected account and optional session manager, not an unnecessary login form. Signed-out users can still find sign-in from Overview.

**Empty and async states:** don't show unverified zeros as live activity metrics; use an unavailable marker until data is loaded and then render verified totals. Routing may not move or delete mounted feature nodes just to change visible sections—`hidden` preserves in-progress inputs.

**Visual QA matrix:** inspect Overview, Conversations, Identity, Memories, Settings and mobile navigation at desktop (1440/1280), tablet (840), and mobile (390/375) widths in light and dark mode; verify no horizontal overflow, reachable primary buttons, focus-visible state and no account-auth form shown on signed-in sessions.

## Extension browser visual smoke

The extension has a dedicated Neo Bento stylesheet at `public/neo-bento.css` loaded by popup, settings and chat preview. `scripts/build.mjs` copies it into `dist/`.

Run the browser smoke after `npm run build`:

```bash
CHROME_BIN=google-chrome node scripts/visual-qa-extension.mjs
```

The CI workflow installs Chrome and runs this smoke test on pull requests. It renders **12 scenarios**: popup at 380px in logged-out and connected-chat fixture states, plus settings/preview at 390px and 1280px, each in light and dark mode. The script checks the active palette, shared stylesheet, absence of horizontal overflow and 44px button targets. PNG screenshots and `report.json` are uploaded as a GitHub Actions artifact for human review.

**Limitations:** this is a static HTML/CSS test. Chrome extension scripts are deliberately disabled and sample conversation text is synthetic. It does not validate authentication, Chrome APIs, Tinder DOM integration, or actual message sending. Manual browser QA and real extension smoke testing remain required before release. Screenshots should be visually reviewed rather than treated as proof of polish on their own.

## Implementation and QA sequence

1. Foundation tokens, shell/sidebar, metrics, global panels and conversation skin.
2. Conversation search/filter usability and state management.
3. Identity Builder, Personal Memories and Analytics details and chart visual semantics.
4. Settings and destructive action affordances, accessibility and responsive regression.
5. Browser screenshots (desktop/mobile, light/dark), test/build/CI, release gate and merge only when green.

**Important:** GitHub CI checks do not replace visual browser QA. Root `README.md` remains exactly zero bytes per repository convention.

## Always-visible Web build identity

The sticky left rail includes a compact **Web vX.Y.Z (gitsha)** indicator under the
TNND brand. On mobile it stays at the beginning of the horizontal navigation.
This distinguishes the loaded Web frontend from the separately versioned Chrome
extension.

- `X.Y.Z` comes from `apps/web/package.json` and changes when we deliberately
  release a Web version (independent of the root extension's version).
- The commit hash comes from the actual Git checkout at Vite startup / bundle
  build (CI `GITHUB_SHA` or explicit `TNND_WEB_GIT_SHA` can override it).
- Node reads loose refs, packed refs or detached HEAD directly: Docker's
  `node:alpine` container does not need a Git executable.
- If the repository metadata is not available, show `(unknown)` **instead of
  inventing a commit**. Hovering the label explains the full revision and source.
- **After `git pull` restart Web**, e.g. `docker compose up -d --force-recreate
  web`, and hard-reload the page. The displayed commit is the version that Vite
  started with, not a live check against GitHub.

## UX visual review of the October 15 user-provided full-page screenshot — phase 1

The six-page capture shows Overview, Conversations, Identity, Memories, Action Center,
Analytics and Settings consecutively in one long document. This makes routine
navigation depend on scrolling, repeats titles, and places infrequent technical
controls along the main reading path. The first improvement returns to the
previously approved **section-first** information architecture: each nav entry
shows only its own workspace section, while keeping *all* panels and unsaved form
values mounted in the DOM. Overview alone retains the global metrics; the active
section title is shown once in the page header. Deep links and browser history
activate the owning section, including lazily mounted feature panels.

This phase changes navigation and hierarchy only. It does not validate all
screens visually or redesign the existing complex settings and management forms.
Actual browser screenshots, responsive review and user testing remain required.

## UX visual review — phase 2: progressive onboarding

The user screenshot showed a verified **100% setup checklist** below an active
five-step tutorial. Both large panels were taking space from the user's actual
tasks. After confirming all four essential setup steps (without treating unknown
as verified), Overview now displays a compact **TNND is ready** state and direct
links to Conversations and Personal Memories. The checklist remains mounted and
can be expanded. Optional story suggestions are disclosed separately. The
first-run tutorial automatically steps aside for verified complete accounts but
can always be reopened explicitly. Neither behavior changes saved profiles or
triggers Gemini/Tinder actions. This remains a source + user screenshot review;
post-change visual browser inspection is still needed.
