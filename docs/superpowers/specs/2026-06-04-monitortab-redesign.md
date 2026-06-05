# MonitorTab Redesign — Bento Monitor Dashboard

**Date**: 2026-06-04  
**Status**: Approved  
**Author**: Design Agent  
**Project**: Prosavis CRM WhatsApp  
**Component**: `src/components/whatsapp/MonitorTab.tsx`  
**Service**: `src/services/monitorService.ts`  

---

## 1. Executive Summary

Redesign the MonitorTab (Monitoreo) from a flat card-with-dividers layout to a **Bento-grid monitoring dashboard** inspired by modern data dashboards (Linear, Grafana, Apple Health). The redesign improves visual hierarchy, data readability, loading states, and micro-interactions while keeping all existing data and service logic intact.

**Current problems**: 739-line single file, generic card layout, basic SVG donut, CircularProgress spinners, no visual hierarchy between sections, no loading skeletons, flat divider-separated sections.

**Design direction**: Bento Monitor — asymmetric grid layout with varied cell sizes, animated radial gauge, top-5 chat preview with medal icons, compact connection panel, 11-metric bento grid, skeleton loaders matching final layout.

---

## 2. File Architecture

### Decomposition

The single `MonitorTab.tsx` (739 lines) splits into focused files under a `monitor/` directory:

```
src/components/whatsapp/monitor/
├── MonitorTab.tsx                  # Orchestrator (~80 lines)
├── MonitorHeader.tsx               # Header bar with live status + refresh
├── sections/
│   ├── StorageSection.tsx          # Bento storage block
│   ├── HeavyChatsSection.tsx       # Top-5 preview + expandable full table
│   └── ConnectionsSection.tsx      # Compact connection status
├── metrics/
│   ├── MetricsGrid.tsx             # 11-card bento grid layout
│   └── MetricCard.tsx              # Single metric card (count-up + icon)
├── charts/
│   └── RadialGauge.tsx             # Animated SVG radial gauge for storage %
└── ui/
    ├── BentoCard.tsx               # Shared bento card wrapper (MUI Card + framer-motion)
    └── MonitorSkeleton.tsx         # Bento-shaped skeleton matching final layout
```

### Data Flow

```
MonitorTab (reads MonitorDashboard from monitorService)
  ├── MonitorHeader (loading, lastUpdated, onRefresh)
  ├── StorageSection (storage: StorageStats | null)
  ├── HeavyChatsSection (heavyChats: HeavyChat[], onRefresh)
  ├── MetricsGrid (metrics: GeneralMetrics | null)
  └── ConnectionsSection (connections: ConnectionStatus)

Data fetching stays in monitorService.ts — NO changes to service layer.
```

---

## 3. Bento Grid Layout (Desktop xl/lg)

### Top Row — Storage (3 cells + 1 full-width)

```
┌──────────────────────────────┐ ┌──────────┐ ┌──────────┐
│         RADIAL GAUGE         │ │  314     │ │  4.0 GB  │
│         (2fr width)          │ │  Files   │ │  Free    │
│         (2 rows height)      │ │          │ │          │
│                               │ └──────────┘ └──────────┘
│   ╭──────────╮               │
│  ╱    68%    ╲               │
│ │   usado    │               │
│  ╲   116MB   ╱               │
│   ╰──────────╯               │
│                               │
│ Bucket: whatsapp-media        │
└──────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ DISTRIBUCIÓN POR TIPO  (full-width, below)               │
│                                                          │
│ Documents  ████████████████████░░░░░░░░░░  79.5 MB  45%  │
│ Audio      ████░░░░░░░░░░░░░░░░░░░░░░░░░░   7.7 MB   7%  │
│ Images     ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░   6.2 MB   5%  │
│ Video      ██████████░░░░░░░░░░░░░░░░░░░░░  22.5 MB  19%  │
│ Text       ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░   7.1 MB   6%  │
│ Other      ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   1.2 MB   1%  │
└──────────────────────────────────────────────────────────┘
```

### Middle Row — Chats + Connections (side by side)

```
┌──────────────────────────────────┐ ┌────────────────────┐
│ CHATS MÁS PESADOS   [View all →] │ │ CONEXIONES         │
│                                  │ │                    │
│ 🥇 Juan Pérez     34 MB ████████ │ │ 🟢 Supabase  12ms  │
│ 🥈 María García   28 MB ████████ │ │ 🟢 Firebase  SDK   │
│ 🥉 Carlos Ruiz    22 MB ████████ │ │ 🟢 WhatsApp  ID    │
│ ⁴  Ana López      18 MB ████████ │ └────────────────────┘
│ ⁵  Pedro Gil      15 MB ████████ │
└──────────────────────────────────┘
```

### Bottom Row — Metrics (4-column grid, 3 rows)

```
┌────────┬────────┬────────┬────────┐
│ 1,500  │ 45,000 │   892  │ 3,200  │
│ Conv.  │ Msgs   │ Active │ Leads  │
├────────┼────────┼────────┼────────┤
│ 1,100  │   456  │ 2,100  │    23  │
│ Clients│ Citas  │ Assets │ Blck.  │
├────────┼────────┼────────┤        │
│    12  │     8  │     3  │        │
│ Brdcst │ Tags   │ Admins │        │
└────────┴────────┴────────┴────────┘
```

### Responsive Behavior

| Breakpoint | Grid Template |
|---|---|
| `xl` (1920+) | 3-col top: gauge(2fr) + chip(1fr) + chip(1fr) |
| `lg` (1280+) | Same as xl |
| `md` (960+) | 2-col top: gauge(full) → chips side-by-side |
| `sm` (600+) | Single column, everything stacked full-width |
| `xs` (<600) | Single column, tighter padding (px: 1) |

- Middle row (chats + connections) becomes stacked below `md`
- Metrics grid becomes 2 columns below `sm`
- BentoCard padding reduces at smaller breakpoints (p: 3 → p: 2 → p: 1.5)

---

## 4. Component Specifications

### 4.1 MonitorHeader

```
Props:
  loading: boolean
  lastUpdated: Date | null
  onRefresh: () => void
  sections: string[]  // for individual section stale indicators

Structure:
  [SpeedIcon] "MONITOREO"
  🟢 Live pulsing dot (auto-refresh every 30s)
  "last updated: hace 12s" (relative time via date-fns)
  [RefreshIconButton] spinning when loading
```

**Behavior**:
- Auto-refresh timer: `useEffect` with 30s interval, calls `onRefresh`
- Relative time updates every 10s via `setInterval`
- Live dot: CSS animation `pulse-opacity 3s infinite`
- Refresh button: framer-motion `rotate` animation while loading

### 4.2 StorageSection

**BentoCard (large) — RadialGauge**:

```
Implementation: Custom SVG
- viewBox: "0 0 200 200"
- Track circle: stroke="#e0e0e0" (light) / "#2a3441" (dark)
- Progress arc: stroke="url(#gauge-gradient)", animated via strokeDashoffset
- Center text: "68%" (fontSize 32, fontWeight 800, fontFamily monospace)
- Sub text: "usado" + "116 MB"
- Animation: dashOffset transitions from circumference → final (1.2s ease-out on mount)
- Gradient: light → #FF7700→#CC5500, dark → #FF9933→#FF7700
```

**BentoCard (small) — Files KPI**:
```
- Icon: StorageIcon in #1976d2 circle
- Count: useCountUp animation 0→314 (800ms)
- Label: "Archivos multimedia"
```

**BentoCard (small) — Free Space KPI**:
```
- Icon: SpeedIcon in #7b1fa2 circle
- Count: formatBytes count-up animation
- Label: "Espacio libre"
```

**BentoCard (full-width) — Breakdown**:
```
- Title row: "Distribución por tipo" with subtitle "(6 tipos)"
- 6 rows, each with:
  - Colored dot (4px, borderRadius full)
  - Media type label (fontWeight 600)
  - Mini progress bar (LinearProgress, height 6px, borderRadius 3)
  - Size (right-aligned, monospace, fontWeight 600)
  - Count (right-aligned, text.secondary, caption)
- Rows animate in staggered (100ms delay each)
- Hover: row background highlight
```

### 4.3 HeavyChatsSection

**Two modes**: Preview (default) and Full Table (when expanded)

**Preview mode**:
```
- Title: "CHATS MÁS PESADOS" + Chip with count
- Action button: "Ver todos (20)" → expands to full table
- 5 rows, each:
  - Rank (medal icon for top 3: 🥇🥈🥉, plain number for rest)
  - Contact name + phone (monospace for phone)
  - Weight bar (LinearProgress, proportional to max chat size)
  - Size label (monospace, fontWeight 700, color if >10MB → error)
- Row click: opens delete dialog (existing behavior)
- Mini weight bars animate from 0 width on mount
```

**Full table mode** (when expanded):
```
- Replaces preview, same MUI Table structure as current
- 20 rows with scroll/pagination
- Top-3 highlighted with subtle orange left border
- Actions: IconButton > MoreVert > [Delete Media, Delete Chat]
- Sticky header
- Collapse button: "Mostrar menos" → back to preview
```

**Delete confirmation dialog**: Keep existing implementation, styled with theme.

### 4.4 ConnectionsSection

**Three connection items in a compact column**:
```
┌──────────────────────────────┐
│  CONEXIONES                  │
│                              │
│  🟢 Supabase (Postgres)      │
│     Latencia: 12ms           │
│                              │
│  🟢 Firebase (Functions)     │
│     SDK Activo               │
│                              │
│  🟢 WhatsApp Cloud API       │
│     ID: 123456789            │
└──────────────────────────────┘
```

**Status dot**: CSS animation (pulse on OK, static on error, spinner on checking)
- `ok`: `#4caf50` with subtle glow
- `error`: `#f44336` solid
- `checking`: MUI CircularProgress size 12

### 4.5 MetricsGrid & MetricCard

**MetricsGrid**:
```
Grid container: 4 columns on xl/lg, 3 columns on md, 2 columns on sm
11 MetricCards in a flat array, mapped with staggered animation
```

**MetricCard**:
```
┌──────────────────┐
│    IconCircle     │  ← 36px, colored bg, centered icon
│                  │
│     1,234        │  ← count-up animation
│                  │
│   Label          │  ← text.secondary, caption
└──────────────────┘
```

- `IconCircle`: `Box` with `width: 36, height: 36, borderRadius: '50%'`, colored background
- `Count`: `Typography variant="h5" fontWeight={800}` with framer-motion `AnimatePresence` for count-up
- `Label`: `Typography variant="caption" color="text.secondary"`
- Hover: subtle elevation + icon circle enlarges slightly
- Cards are clickable (no action yet, but cursor: pointer for future)

### 4.6 BentoCard (Shared Wrapper)

```
Props:
  gridArea?: string          // CSS grid area
  colSpan?: 1 | 2            // responsive column span
  rowSpan?: 1 | 2            // responsive row span
  animate?: boolean          // enable entrance animation
  delay?: number             // stagger delay
  variant?: 'default' | 'kpi' | 'chart'
  children: ReactNode

Implementation:
- MUI Card with elevation={0}, border: 1px solid divider
- borderRadius: '12px' (DesignTokens.borderRadius.lg)
- Padding: { xs: 1.5, sm: 2, md: 2.5 }
- framer-motion: staggered entrance (fadeInUp), hover lift (y: -2)
- No box-shadow by default, subtle on hover only
- Background: background.paper
```

### 4.7 MonitorSkeleton

Bento-shaped skeleton that mirrors final layout:

```
┌──────────────────┐ ┌──────────┐ ┌──────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │ │ ▓▓▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓▓▓ │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │ │ ▓▓▓▓▓▓▓▓ │ │ ▓▓▓▓▓▓▓▓ │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │ └──────────┘ └──────────┘
└──────────────────┘
┌────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│ ▓▓▓▓█▓▓ ▓▓▓▓░░ ▓▓▓▓▓▓ ▓▓▓▓░░ ▓▓▓▓░░ ▓▓▓  │
└────────────────────────────────────────────┘
┌─────────────────┐ ┌──────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓  │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓  │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │
└─────────────────┘ └──────────────────────┘
┌────┬────┬────┬────┐
│▓▓▓▓│▓▓▓▓│▓▓▓▓│▓▓▓▓│
│▓▓▓▓│▓▓▓▓│▓▓▓▓│▓▓▓▓│
└────┴────┴────┴────┘
```

Shimmer effect: CSS `@keyframes shimmer` with `background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)` sweeping across blocks.

---

## 5. Micro-interactions & Animations

All animations use **framer-motion** (v12.23.15, already in package.json). Respect `prefers-reduced-motion` via `useReducedMotion()`.

| Element | Animation | Timing |
|---|---|---|
| Page entrance | Staggered BentoCard `fadeInUp` | stagger 80ms, each card: 0.4s |
| Radial gauge | `strokeDashoffset` transition | 1.2s ease-out on mount |
| Number counters | framer-motion `AnimatePresence` count-up | 800ms per metric, stagger 50ms |
| Breakdown bars | `LinearProgress` value animation | 600ms per bar, stagger 100ms |
| Connection dots | CSS `@keyframes pulse-opacity` | 3s infinite ease-in-out |
| Card hover | `y: -2`, `boxShadow` increase | 200ms ease-out |
| Refresh icon | framer-motion `rotate(360deg)` | 400ms linear while loading |
| Live dot | CSS `@keyframes pulse-scale` | 3s infinite |
| Heavy chat rows | Staggered entrance `fadeInLeft` | stagger 60ms, 0.3s each |
| Expanded table | framer-motion `AnimatePresence` layout | 0.3s ease-out |
| Delete dialog | MUI Dialog default (keep existing) | — |

---

## 6. States

### 6.1 Loading State

- Full-page `MonitorSkeleton` matching the exact bento layout
- Individual sections show skeleton when data is partial
- All skeleton blocks use CSS shimmer animation

### 6.2 Empty States

- **Storage**: Radial gauge at 0% with "Sin datos de almacenamiento" label
- **Files KPI**: Shows "0" with count-up reaching 0 immediately
- **Breakdown**: Empty rows with "No hay archivos multimedia" message
- **Heavy Chats**: Empty illustration area with "No hay conversaciones pesadas" chip
- **Metrics**: Show dashes "—" for each metric value
- **Connections**: Show as normal (these are always populated)

### 6.3 Error States

- **Partial failure**: Inline Alert within the failed bento cell, other sections render normally
- **Full failure**: Alert banner at top with retry button
- **Sections use existing `Promise.allSettled` behavior** in monitorService

### 6.4 Edge Cases

- **Storage > 100%**: Clamp gauge to 100%, show error chip "Límite excedido"
- **Chats with no name**: Show phone number italicized
- **0 metrics**: Show dashes consistently
- **Connection failure**: Show red dot + error message in tooltip

---

## 7. Dark/Light Mode

| Element | Light Mode | Dark Mode |
|---|---|---|
| Page bg | `#f8f9fa` | `#0f1419` |
| BentoCard bg | `#ffffff` | `#1e252e` |
| BentoCard border | `1px solid #e0e0e0` | `1px solid #404b5a` |
| Gauge track | `#e0e0e0` | `#2a3441` |
| Gauge progress | `#FF7700→#CC5500` | `#FF9933→#FF7700` |
| KPI icon bg (files) | `#e3f2fd` | `rgba(144,202,249,0.08)` |
| KPI icon bg (free) | `#f3e5f5` | `rgba(206,147,216,0.08)` |
| Medal 1 bg | `#fff3e0` | `rgba(255,152,0,0.12)` |
| Medal 2 bg | `#f5f5f5` | `rgba(158,158,158,0.12)` |
| Medal 3 bg | `#fce4ec` | `rgba(244,67,54,0.08)` |
| Section header text | `text.primary` | `text.primary` |
| Metric values | Brand blue/orange | Light blue/orange |
| Skeleton shimmer | White-to-gray sweep | White-to-dark sweep |
| Shadows | MUI sm | MUI lg (tinted) |

All colors reference the existing `DesignTokens` from `@/constants/designSystem`.

---

## 8. Dependencies & Constraints

### Used
- `framer-motion` v12.23.15 ✅ (exists in package.json)
- `@mui/material` v5.15.0 ✅
- `@mui/icons-material` v5.15.0 ✅
- `@emotion/styled` v11.14.1 ✅
- `date-fns` v4.3.0 ✅ (for relative time formatting)
- `@/constants/designSystem` ✅ (DesignTokens)
- `@/services/monitorService` ✅ (no changes needed)

### Not Used (explicitly avoided)
- `recharts` / `nivo` / `chart.js` — SVG gauge is custom
- `phosphor-icons` — not in package.json
- `@radix-ui/*` — not in package.json
- `framer-motion` for DOM layout — only opacity/transform

---

## 9. File Sizes (Estimated)

| File | Current | After | Change |
|---|---|---|---|
| `MonitorTab.tsx` | 739 lines | ~80 lines | -659 |
| `monitorService.ts` | 352 lines | 352 lines | 0 (no change) |
| **New files**: | | | |
| `MonitorHeader.tsx` | — | ~60 lines | +60 |
| `StorageSection.tsx` | — | ~120 lines | +120 |
| `HeavyChatsSection.tsx` | — | ~180 lines | +180 |
| `ConnectionsSection.tsx` | — | ~60 lines | +60 |
| `MetricsGrid.tsx` | — | ~50 lines | +50 |
| `MetricCard.tsx` | — | ~40 lines | +40 |
| `RadialGauge.tsx` | — | ~80 lines | +80 |
| `BentoCard.tsx` | — | ~40 lines | +40 |
| `MonitorSkeleton.tsx` | — | ~60 lines | +60 |
| **Total new** | 739 | ~770 | +31 lines |

The total is roughly the same line count, but **distributed across focused files** with improved readability and maintainability.

---

## 10. Implementation Order

1. Create `src/components/whatsapp/monitor/` directory structure
2. Build `BentoCard.tsx` (shared Card + framer-motion wrapper)
3. Build `RadialGauge.tsx` (animated SVG component)
4. Build `MonitorHeader.tsx` (header with live status)
5. Build `StorageSection.tsx` (gauge + KPIs + breakdown)
6. Build `ConnectionsSection.tsx` (compact connection cards)
7. Build `MetricCard.tsx` + `MetricsGrid.tsx` (grid of 11)
8. Build `HeavyChatsSection.tsx` (preview + full table)
9. Build `MonitorSkeleton.tsx` (bento skeleton)
10. Rewrite `MonitorTab.tsx` (clean orchestrator)
11. Delete old `MonitorTab.tsx` content, replace with new imports
12. TypeScript compile check
13. Deploy and verify

---

## 11. Open Questions / Future Iterations

- Auto-refresh interval: 30s default? Configurable?
- Click on metric cards: Any navigation action planned?
- Heavy chats: Is top-5 sufficient, or should we show more/less?
- Should the full table have sortable columns?

These can be deferred to implementation.
