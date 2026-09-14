---
name: Nelysia Design System
description: Obsidian and Emerald compiler-first documentation design system
colors:
  bg: "#080c10"
  bg-subtle: "#0d1217"
  panel: "#111720"
  panel-elevated: "#16202c"
  panel-hover: "#1c2736"
  border: "rgba(255, 255, 255, 0.08)"
  border-hover: "rgba(255, 255, 255, 0.16)"
  text: "#f8fafc"
  text-muted: "#94a3b8"
  text-dim: "#7f90a5"
  text-code: "#e2e8f0"
  accent: "#10b981"
  accent-hover: "#34d399"
  accent-bg: "rgba(16, 185, 129, 0.07)"
  accent-border: "rgba(16, 185, 129, 0.22)"
  info: "#38bdf8"
  info-bg: "rgba(56, 189, 248, 0.07)"
  info-border: "rgba(56, 189, 248, 0.22)"
  warn: "#f59e0b"
  warn-bg: "rgba(245, 158, 11, 0.07)"
  warn-border: "rgba(245, 158, 11, 0.22)"
  danger: "#f43f5e"
  red: "#ef4444"
  purple: "#c084fc"
  orange: "#fb923c"
  callout-tip-text: "#d1fae5"
  callout-info-text: "#e0f2fe"
  callout-warn-text: "#fef3c7"
  shadow-soft: "rgba(0, 0, 0, 0.4)"
  shadow-subtle: "rgba(0, 0, 0, 0.3)"
  shadow-deep: "rgba(0, 0, 0, 0.6)"
typography:
  display:
    fontFamily: "Public Sans, Noto Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.7rem, 5.5vw, 4.2rem)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Public Sans, Noto Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3.2vw, 2.2rem)"
    fontWeight: 700
    lineHeight: 1.22
    letterSpacing: "-0.03em"
  subhead:
    fontFamily: "Public Sans, Noto Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.22rem"
    fontWeight: 600
    lineHeight: 1.3
  lead:
    fontFamily: "Public Sans, Noto Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.15rem"
    lineHeight: 1.7
  body:
    fontFamily: "Public Sans, Noto Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.75
  body-sm:
    fontFamily: "Public Sans, Noto Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.98rem"
    lineHeight: 1.75
  body-compact:
    fontFamily: "Public Sans, Noto Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.93rem"
    lineHeight: 1.65
  table-cell:
    fontFamily: "Public Sans, Noto Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9rem"
    lineHeight: 1.6
  nav-link:
    fontFamily: "Public Sans, Noto Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 500
  btn:
    fontFamily: "Public Sans, Noto Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 600
  label:
    fontFamily: "Public Sans, Noto Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
  caption:
    fontFamily: "JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.78rem"
    lineHeight: 1.55
  code:
    fontFamily: "JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.85rem"
    lineHeight: 1.72
  code-sm:
    fontFamily: "JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.78rem"
    lineHeight: 1.72
  mobile-h1:
    fontFamily: "Public Sans, Noto Sans Thai, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.6rem"
    fontWeight: 800
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "56px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    rounded: "{rounded.md}"
    padding: "9px 18px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "rgba(255, 255, 255, 0.04)"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "9px 18px"
---

# Nelysia Design System

## Overview

The Nelysia visual design system is engineered specifically for technical documentation (mode: **Read**). It departs from murky hacker green palettes and generic interface tropes (side-tab borders, pulsing dots, colored halos, gradient text) in favor of a pristine, high-clarity **Obsidian & Emerald** visual architecture.

## Colors

The palette is built on three core pillars:
- **Obsidian Dark Ground (`#080c10`, `#0d1217`, `#111720`)**: Deep, low-noise dark surfaces that provide maximum contrast without harsh pure black glare.
- **Pure Emerald Signals (`#10b981`, `#34d399`)**: High-efficiency, authoritative accent colors reserved for interactive states, primary CTAs, active route signals, and verified benchmark wins.
- **Slate Text Hierarchy (`#f8fafc`, `#94a3b8`, `#64748b`)**: Strictly calibrated text contrast exceeding WCAG AAA (>12:1 for primary headings and code text, >5.5:1 for body copy).

## Typography

Typography prioritizes scanability, comprehension, and cross-platform fidelity:
- **Primary Body & Display**: `Public Sans` with `Noto Sans Thai` for bilingual Thai glyph harmony.
- **Monospace Code**: `JetBrains Mono` with crisp tabular numerals and clean ligature support.
- **Rhythm**: Generous line spacing (`1.75` for body, `1.72` for code) with distinct vertical hierarchy (headings have more top margin than bottom margin).

## Layout

- **Shell Architecture**: Two-column layout with a fixed 290px left sidebar and a flexible content column constrained to 980px max-width for optimal reading measure (65–75 characters per line).
- **Sticky App Header**: 64px height frosted glass bar (`backdrop-filter: blur(16px)`) hosting breadcrumb navigation, segmented language switcher (EN / TH), fast search input, and GitHub repository link.
- **Mobile Adaptive**: Sidebar transforms into a smooth off-canvas drawer (`transform: translateX(-100%)`) toggled via an accessible SVG menu trigger.

## Elevation & Depth

- **Tonal Layering**: Depth is created primarily through tonal value progression: `--bg` (`#080c10`) -> `--panel` (`#111720`) -> `--panel-elevated` (`#16202c`).
- **Subtle Elevation Shadows**: Elevated containers (code blocks, modal panels) use soft directional shadows (`box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.4)`). Zero-offset colored glow halos are strictly banned.
- **Subtle Hairline Borders**: 1px translucent borders (`rgba(255, 255, 255, 0.08)`) define edges crisply without visual weight.

## Shapes

- **Corner Radii**: 6px for pills/badges, 8px for buttons/inputs, 10px for cards/code blocks/callouts, 14px for hero emblems, 999px for status pills.
- **Consistent Rounded Boundaries**: All elements maintain proportional corner curves. Accent borders never clash with corner radii.

## Components

- **Logo & Emblem**: Precision dual-pillar geometric monogram with a high-speed compiler beam and deterministic execution node in emerald & mint gradients.
- **Code Blocks**: Editor chrome with macOS-inspired window controls (`● ● ●`), file path label, copy button with animated SVG feedback, and Tokyo Night syntax highlighting tokens.
- **Callout Cards**: 1px subtle tinted border (`rgba(16, 185, 129, 0.22)`), ambient soft background (`rgba(16, 185, 129, 0.07)`), bold uppercase label with inline SVG iconography.
- **Tables**: Frosted table cards with uppercase headers, tabular numerals, and dedicated lead column highlighting for Nelysia benchmark metrics.
- **Language Switcher**: Segmented toggle pill with instantaneous bilingual DOM swapping.

## Do's and Don'ts

### Do
- Use solid color text with bold weight for emphasis.
- Maintain consistent 1px borders all around containers.
- Use tabular numerals (`font-variant-numeric: tabular-nums`) in benchmark and data tables.
- Style browser surfaces (`::selection`, custom scrollbars, `:focus-visible`).

### Don't
- Never use thick colored side-tab borders (e.g. `border-left: 4px solid ...`).
- Never use zero-offset colored glow halos (`box-shadow: 0 0 15px ...`).
- Never use gradient text clipping (`-webkit-background-clip: text`).
- Never use pulsing status dot animations.
- Never use emoji glyphs in place of authored SVG icons.
