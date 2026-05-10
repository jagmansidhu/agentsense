# Design System: Minimalism & Swiss Style

## 1. Definição do Estilo

- **Nome:** Minimalism & Swiss Style
- **Tipo:** Clean, Geometric, Functional, Grid-Based
- **Keywords:** Clean, simple, spacious, functional, white space, high contrast, geometric, sans-serif, grid-based, essential
- **Era:** 1950s Swiss
- **Light/Dark:** ✓ Full / ✓ Full

## 2. Paleta de Cores

- **Primárias:** Monochromatic, Black #000000, White #FFFFFF
- **Secundárias:** Neutral (Beige #F5F1E8, Grey #808080, Taupe #B38B6D), Primary accent

## 3. Efeitos Visuais

Subtle hover (200-250ms), smooth transitions, sharp shadows if any, clear type hierarchy, fast loading

## 4. AI Prompt Keywords

Design a minimalist landing page. Use: white space, geometric layouts, sans-serif fonts, high contrast, grid-based structure, essential elements only. Avoid shadows and gradients. Focus on clarity and functionality.

## 5. CSS Technical

```css
display: grid, gap: 2rem, font-family: sans-serif, color: #000 or #FFF, max-width: 1200px, clean borders, no box-shadow unless necessary
```

## 6. Design System Variables

```css
--spacing: 2rem, --border-radius: 0px, --font-weight: 400-700, --shadow: none, --accent-color: single primary only
```

## 7. Checklist de Implementação

- ☐ Grid-based layout 12-16 columns
- ☐ Typography hierarchy clear
- ☐ No unnecessary decorations
- ☐ WCAG AAA contrast verified
- ☐ Mobile responsive grid

## 8. Visual Theme & Atmosphere

Design minimalista com grid, tipografia clara e espaço em branco. Ideal para SaaS B2B, apps enterprise e projetos profissionais. Prompt pronto para IA. Originário dos Alpes suíços (1950s), o Swiss Style revolucionou design com grid systems e tipografia sem serifa. Ainda é padrão em design profissional moderno.

- Density: 3/10 — Airy
- Variance: 2/10 — Structured
- Motion: 4/10 — Subtle

## 9. Color Palette & Roles

- **Black** (#000000) — Dark surface, primary background
- **White** (#FFFFFF) — Light surface, card backgrounds
- **Beige** (#F5F1E8) — Extended palette, decorative use
- **Grey** (#808080) — Secondary text, borders, muted elements
- **Taupe** (#B38B6D) — Extended palette, decorative use

## 10. Typography Rules

- **Display / Hero:** sans-serif — Weight 700, tight tracking, used for headline impact
- **Body:** sans-serif — Weight 400, 16px/1.6 line-height, max 72ch per line
- **UI Labels / Captions:** sans-serif — 0.875rem, weight 500, slight letter-spacing
- **Monospace:** JetBrains Mono — Used for code, metadata, and technical values

Scale:
- Hero: clamp(2.5rem, 5vw, 4rem)
- H1: 2.25rem
- H2: 1.5rem
- Body: 1rem / 1.6
- Small: 0.875rem

## 11. Component Stylings

- **Primary Button:** Sharp edges (0px) shape. Accent color fill. Hover: 8% darken + subtle lift shadow. Active: -1px translate tactile press. Font weight 600. No outer glows.
- **Secondary / Ghost Button:** Outline variant. 1.5px border in muted color. Text in primary color. Hover: subtle background fill.
- **Cards:** Sharp edges (0px) corners. Surface background. Subtle shadow (0 2px 12px rgba(0,0,0,0.06)). 1px border stroke.
- **Inputs:** Label above input. 1px border stroke. Focus ring: 2px accent color offset 2px. Error text below in semantic red. No floating labels.
- **Navigation:** Primary surface background. Active item: accent color indicator. Font weight 500 when active.
- **Skeletons:** Shimmer animation matching component dimensions. No circular spinners.
- **Empty States:** Icon-based composition with descriptive text and action button.

## 12. Layout Principles

- **Grid:** CSS Grid primary. Max-width containment: 1280px centered with 1.5rem side padding.
- **Spacing rhythm:** Balanced. Base unit: 0.5rem (8px).
- **Section vertical gaps:** clamp(4rem, 8vw, 8rem).
- **Hero layout:** Split-screen (text left, visual right).
- **Feature sections:** Zig-zag alternating text+image rows. No 3-equal-columns.
- **Mobile collapse:** All multi-column layouts collapse below 768px. No horizontal overflow.
- **z-index contract:** base (0) / sticky-nav (100) / overlay (200) / modal (300) / toast (500).

## 13. Motion & Interaction

- **Physics:** Ease-out curves, 200-300ms duration. Smooth and predictable.
- **Entry animations:** Fade + translate-Y (16px → 0) over 420ms ease-out. Staggered cascades for lists: 80ms between items.
- **Hover states:** Subtle color shift + shadow adjustment over 200ms.
- **Page transitions:** Fade only (200ms).
- **Performance:** Only transform and opacity animated. No layout-triggering properties.

## 14. Anti-Patterns (Banned)

- No emojis in UI — use icon system only (Lucide, Heroicons)
- No pure black (#000000) — use off-black or charcoal variants
- No oversaturated accent colors (saturation cap: 80%)
- No 3-column equal-width feature layouts — use zig-zag or asymmetric grid
- No `h-screen` — use `min-h-[100dvh]`
- No AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen"
- No broken external image links — use picsum.photos or inline SVG
- No generic lorem ipsum in demos

## Contexto Histórico

Originário dos Alpes suíços (1950s), o Swiss Style revolucionou design com grid systems e tipografia sem serifa. Ainda é padrão em design profissional moderno.

## Caso de Uso

SaaS B2B, Apps enterprise, SaaS de design, Ferramentas profissionais
