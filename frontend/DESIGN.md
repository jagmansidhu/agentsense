# Design System: Business AI Style

## 1. Style Definition

- **Name:** Business AI Style
- **Type:** Professional, Data-Driven, User-Centric
- **Keywords:** CRM, AI, sales, business, intelligence, data-driven, professional, intuitive, connected, efficient
- **Era:** 2026+ Business Intelligence
- **Light/Dark:** ✓ Full / ✗ No

## 2. Color Palette

- **Primary:** Business Blue `#00A1E0`, White `#FFFFFF`, Dark Gray `#333333`, Light Gray `#F2F2F2`
- **Secondary:** Green `#008000`, Orange `#FFA500`, Purple `#800080`, Black `#000000`

## 3. Visual Effects

Interactive data visualizations, workflow diagrams, subtle glows on AI elements, clean typography (sans-serif), feedback micro-interactions, modular elements, and sales progress animations.

## 4. AI Prompt Keywords

Design a professional and data-driven landing page for a sales AI platform. Use: business blue accents, interactive data visualizations, workflow diagrams, subtle AI glows, clean typography, feedback micro-interactions, modular elements, sales progress animations, business-centric and intelligent feel.

## 5. CSS Technical

```css
background: #FFFFFF;
color: #333333;
box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
border-radius: 4px;
font-family: "Helvetica, Arial, sans-serif";
transition: all 0.3s ease-in-out;
background-image: linear-gradient(to bottom, #F8F8F8, #FFFFFF);

.data-dashboard-animation {}
.workflow-diagram {}
```

## 6. Design System Variables

```css
--business-blue: #00A1E0;
--white: #FFFFFF;
--dark-grey: #333333;
--light-grey: #F2F2F2;
--ai-glow: rgba(0, 161, 224, 0.3);
--font-business: "Helvetica, Arial, sans-serif";
--shadow-light: 0 2px 5px rgba(0, 0, 0, 0.08);
```

## 7. Implementation Checklist

- ☐ Interactive data visualizations
- ☐ Workflow diagrams
- ☐ AI glows
- ☐ Clean typography
- ☐ Feedback micro-interactions
- ☐ Sales progress animations

## 8. Visual Theme & Atmosphere

Business AI Style — a tech-inspired design focused on CRM, AI, and sales. Template and AI prompt ready to use. The Business AI Style represents a modern trend in web UI/UX design with a tech-inspired focus.

- Density: 5/10 — Balanced
- Variance: 4/10 — Moderate
- Motion: 4/10 — Subtle

## 9. Color Palette & Roles

- **Business Blue** (`#00A1E0`) — Accent highlight, links, and focus states
- **White** (`#FFFFFF`) — Light surface, card backgrounds
- **Dark Gray** (`#333333`) — Dark surface, primary background
- **Light Gray** (`#F2F2F2`) — Secondary text, borders, muted elements
- **Green** (`#008000`) — Success states, positive indicators
- **Orange** (`#FFA500`) — Warm accent, secondary call-to-action
- **Purple** (`#800080`) — Accent color, emphasis elements
- **Black** (`#000000`) — Deep contrast surface

## 10. Typography Rules

- **Display / Hero:** Helvetica — Weight 700, tight tracking, used for headline impact
- **Body:** Helvetica — Weight 400, 16px/1.6 line-height, max 72ch per line
- **UI Labels / Captions:** Helvetica — 0.875rem, weight 500, slight letter-spacing
- **Monospace:** JetBrains Mono — Used for code, metadata, and technical values

Scale:

- Hero: `clamp(2.5rem, 5vw, 4rem)`
- H1: `2.25rem`
- H2: `1.5rem`
- Body: `1rem / 1.6`
- Small: `0.875rem`

## 11. Component Stylings

- **Primary Button:** Rounded (4px) shape. Accent color fill. Hover: 8% darken + subtle lift shadow. Active: -1px translate tactile press. Font weight 600. No outer glows.
- **Secondary / Ghost Button:** Outline variant. 1.5px border in muted color. Text in primary color. Hover: subtle background fill.
- **Cards:** Rounded (4px) corners. Surface background. Subtle shadow (`0 2px 12px rgba(0,0,0,0.06)`). 1px border stroke.
- **Inputs:** Label above input. 1px border stroke. Focus ring: 2px accent color offset 2px. Error text below in semantic red. No floating labels.
- **Navigation:** Primary surface background. Active item: accent color indicator. Font weight 500 when active.
- **Skeletons:** Shimmer animation matching component dimensions. No circular spinners.
- **Empty States:** Icon-based composition with descriptive text and action button.

## 12. Layout Principles

- **Grid:** CSS Grid primary. Max-width containment: 1280px centered with 1.5rem side padding.
- **Spacing rhythm:** Balanced. Base unit: 0.5rem (8px).
- **Section vertical gaps:** `clamp(4rem, 8vw, 8rem)`.
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
- No pure black (`#000000`) — use off-black or charcoal variants
- No oversaturated accent colors (saturation cap: 80%)
- No 3-column equal-width feature layouts — use zig-zag or asymmetric grid
- No `h-screen` — use `min-h-[100dvh]`
- No AI copywriting cliches: "Elevate", "Seamless", "Unleash", "Next-Gen"
- No broken external image links — use picsum.photos or inline SVG
- No generic lorem ipsum in demos

## Historical Context

Business AI Style represents a modern trend in web UI/UX design focused on tech-inspired products.

## Use Case

Landing pages, modern websites.
