# Pocket Tools Design System

## 1. Atmosphere & Identity

Pocket Tools is a quiet utility shelf: direct, private, and ready without setup. The visual signature is the **number ticket**—a crisp six-cell strip inspired by printed Thai lottery tickets, set inside warm paper-like surfaces. The system adapts Notion's approachable structure without copying its branding: whisper borders, generous spacing, compact controls, and one restrained Thai red accent. Design dials: variance 4, motion 3, density 4.

## 2. Color

| Role           | Token              | Light     | Dark      | Usage                             |
| -------------- | ------------------ | --------- | --------- | --------------------------------- |
| Surface/page   | `--surface-page`   | `#f7f6f3` | `#171614` | Page canvas                       |
| Surface/panel  | `--surface-panel`  | `#fffefa` | `#23211e` | Tool and result surfaces          |
| Surface/muted  | `--surface-muted`  | `#eeece7` | `#2d2a26` | Quiet grouping                    |
| Text/primary   | `--text-primary`   | `#24211e` | `#f5f1e9` | Headlines and body                |
| Text/secondary | `--text-secondary` | `#67615a` | `#bdb5aa` | Supporting copy                   |
| Border/default | `--border-default` | `#d9d5ce` | `#454039` | Structure                         |
| Accent/primary | `--accent-primary` | `#b4232c` | `#eb6d74` | Primary actions and focus         |
| Accent/hover   | `--accent-hover`   | `#8f1821` | `#f2777e` | Hover state                       |
| Accent/soft    | `--accent-soft`    | `#f6e5e6` | `#442529` | Selected and informational states |
| Text/on accent | `--text-on-accent` | `#fffefa` | `#171614` | Primary button label              |
| Status/success | `--status-success` | `#246b48` | `#6fc49a` | Copy confirmation                 |

Accent color is reserved for actions, focus, and the active tool. New colors must be added here before use. Both themes must meet WCAG AA contrast.

## 3. Typography

The primary stack is `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; the numeric stack is `ui-monospace, "SFMono-Regular", Consolas, monospace`. No external font requests are permitted.

| Level      | Size                         | Weight | Line height | Tracking   | Usage                    |
| ---------- | ---------------------------- | ------ | ----------- | ---------- | ------------------------ |
| Display    | `clamp(2.5rem, 8vw, 5rem)`   | 760    | 0.95        | `-0.055em` | Main statement           |
| H1         | `clamp(2rem, 5vw, 3.5rem)`   | 740    | 1.02        | `-0.04em`  | Tool title               |
| H2         | `1.5rem`                     | 700    | 1.2         | `-0.02em`  | Section title            |
| Body large | `1.125rem`                   | 450    | 1.55        | normal     | Lead copy                |
| Body       | `1rem`                       | 430    | 1.55        | normal     | Default copy             |
| Small      | `0.875rem`                   | 500    | 1.45        | normal     | Metadata and helper text |
| Number     | `clamp(2.25rem, 10vw, 5rem)` | 720    | 1           | `0.08em`   | Generated ticket         |

## 4. Spacing & Layout

Base unit: 4px. Tokens: `--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 20px`, `--space-6: 24px`, `--space-8: 32px`, `--space-10: 40px`, `--space-12: 48px`, `--space-16: 64px`, `--space-20: 80px`.

The content width is 1120px with 16px mobile gutters and 32px desktop gutters. The home hero uses an asymmetric two-column grid above 768px and collapses to one column below it. Tool pages use a single focused column capped at 760px. Touch targets are at least 44px.

## 5. Components

### Site Header

- **Structure**: brand link, short descriptor, tool index link.
- **States**: default, hover, active, keyboard focus.
- **Accessibility**: semantic header/nav and visible focus ring.
- **Motion**: color and 1px press transform only.

### Tool Link

- **Structure**: semantic anchor with index number, title, summary, and action label.
- **Variants**: available; future disabled state may be added only when needed.
- **States**: default, hover/elevated, active/pressed, focus.
- **Accessibility**: whole card is one descriptive link; no nested controls.
- **Motion**: transform and shadow transition, disabled under reduced motion.

### Primary Button

- **Structure**: button label with optional status region outside the control.
- **States**: loading/disabled until model data is ready, default, hover, active, focus.
- **Accessibility**: 44px minimum target, strong contrast, no icon-only variant.
- **Motion**: 1px press transform and 140ms color transition.

### Number Ticket

- **Structure**: live output containing six individually styled digit cells.
- **States**: model loading, model error, initial placeholder, generated, copied confirmation.
- **Accessibility**: full number exposed as one polite live-region label; decorative cells hidden from assistive technology.
- **Motion**: generated state enters with a short opacity/transform cascade; static under reduced motion.

## 6. Motion & Interaction

Micro interactions use 140ms ease-out; generated-number emphasis uses 280ms cubic-bezier(0.16, 1, 0.3, 1). Only `transform` and `opacity` animate. Motion communicates button feedback or result replacement—there is no perpetual decoration. `prefers-reduced-motion: reduce` disables transitions and generation choreography.

## 7. Depth & Surface

Strategy: mixed whisper borders and warm tinted shadows. Panels use `1px solid var(--border-default)` and one low-opacity, background-tinted shadow. The number ticket adds an inset highlight and a slightly deeper shadow to feel printed and tactile. No glow, glass blur, or pure black shadow is used.
