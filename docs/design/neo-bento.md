# TNND Neo Bento — Design System v1

**Status:** approved visual direction · implementation in progress  
**Figma:** https://www.figma.com/design/HM86imsTxQGfuilebN6Npt  
**Code:** `apps/web/src/neo-bento.css` (imported after `styles.css`)  
**Scope:** TNND web dashboard, Identity Builder, Personal Memories, Conversations, Action Center, Analytics and Settings. Extension UI is a separate later adaptation, not automatically restyled by web CSS.

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

## Implementation and QA sequence

1. Foundation tokens, shell/sidebar, metrics, global panels and conversation skin.
2. Conversation search/filter usability and state management.
3. Identity Builder, Personal Memories and Analytics details and chart visual semantics.
4. Settings and destructive action affordances, accessibility and responsive regression.
5. Browser screenshots (desktop/mobile, light/dark), test/build/CI, release gate and merge only when green.

**Important:** GitHub CI checks do not replace visual browser QA. Root `README.md` remains exactly zero bytes per repository convention.
