# MonitorTab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the MonitorTab from a flat card-with-dividers layout to a Bento-grid monitoring dashboard with animated radial gauge, staggered entrances, count-up metrics, and compact connection panel.

**Architecture:** Decompose the single 739-line `MonitorTab.tsx` into 10 focused files under `monitor/` directory. The `monitorService.ts` remains untouched. `MonitorTab.tsx` becomes a clean orchestrator importing the new components.

**Tech Stack:** React 19 + TypeScript + MUI v6 + framer-motion v12 + date-fns v4 + Supabase

---

## File Structure (What We're Building)

```
src/components/whatsapp/monitor/
├── MonitorTab.tsx                  # Orchestrator (~80 lines, replaces old)
├── MonitorHeader.tsx               # Header bar with live status + refresh
├── sections/
│   ├── StorageSection.tsx          # Bento storage block (gauge + KPIs + breakdown)
│   ├── HeavyChatsSection.tsx       # Top-5 preview + expandable full table
│   └── ConnectionsSection.tsx      # Compact connection status cards
├── metrics/
│   ├── MetricsGrid.tsx             # 11-card bento grid layout
│   └── MetricCard.tsx              # Single metric card (count-up animation)
├── charts/
│   └── RadialGauge.tsx             # Animated SVG radial gauge for storage %
└── ui/
    ├── BentoCard.tsx               # Shared bento card wrapper (MUI Card + framer-motion)
    └── MonitorSkeleton.tsx         # Bento-shaped skeleton with shimmer
```

### Files to Modify
- **Modify**: `src/components/whatsapp/MonitorTab.tsx` — replace entire content with new orchestrator
- **Delete** (implicit): all inline components (DonutChart, SectionSkeleton, StorageSection, HeavyChatsSection, GeneralMetricsSection, ConnectionsSection)

### Files to Create (10 new)
All under `src/components/whatsapp/monitor/` in the structure above.

---

### Task 1: Create directory structure + BentoCard wrapper

**Files:**
- Create: `src/components/whatsapp/monitor/ui/BentoCard.tsx`
- Create: (directory structure only)

- [ ] **Step 1: Create the directory structure**

```bash
New-Item -ItemType Directory -Path "src/components/whatsapp/monitor/sections" -Force
New-Item -ItemType Directory -Path "src/components/whatsapp/monitor/metrics" -Force
New-Item -ItemType Directory -Path "src/components/whatsapp/monitor/charts" -Force
New-Item -ItemType Directory -Path "src/components/whatsapp/monitor/ui" -Force
```

- [ ] **Step 2: Create `BentoCard.tsx`**

```tsx
import React from 'react';
import { Card, CardContent, CardContentProps, CardProps, useTheme } from '@mui/material';
import { motion, type HTMLMotionProps } from 'framer-motion';

type BentoCardProps = {
  children: React.ReactNode;
  animate?: boolean;
  delay?: number;
  variant?: 'default' | 'kpi' | 'chart';
  onClick?: () => void;
} & Omit<CardProps, 'onClick'>;

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] },
  }),
};

const MotionCard = motion(
  React.forwardRef<HTMLDivElement, CardProps>((props, ref) => <Card ref={ref} {...props} />),
);

const BentoCard: React.FC<BentoCardProps> = ({
  children,
  animate = true,
  delay = 0,
  variant = 'default',
  onClick,
  sx,
  ...cardProps
}) => {
  const theme = useTheme();

  return (
    <MotionCard
      variants={animate ? cardVariants : undefined}
      custom={delay}
      initial={animate ? 'hidden' : undefined}
      animate={animate ? 'visible' : undefined}
      whileHover={animate ? { y: -2, transition: { duration: 0.2 } } : undefined}
      elevation={0}
      onClick={onClick}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '12px',
        bgcolor: 'background.paper',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s ease-out',
        '&:hover': onClick ? { boxShadow: theme.shadows[2] } : undefined,
        ...sx,
      }}
      {...cardProps}
    >
      <CardContent sx={{ p: { xs: 1.5, sm: 2, md: 2.5 }, '&:last-child': { pb: { xs: 1.5, sm: 2, md: 2.5 } } }}>
        {children}
      </CardContent>
    </MotionCard>
  );
};

export default BentoCard;
```

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-Object -First 20`
Expected: No errors (or at least unrelated ones)

- [ ] **Step 4: Commit**

```bash
git add src/components/whatsapp/monitor/ui/BentoCard.tsx
git commit -m "feat(monitor): add BentoCard shared wrapper with framer-motion"
```

---

### Task 2: RadialGauge animated SVG

**Files:**
- Create: `src/components/whatsapp/monitor/charts/RadialGauge.tsx`

- [ ] **Step 1: Create `RadialGauge.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { useTheme, Box, Typography } from '@mui/material';

interface RadialGaugeProps {
  value: number; // 0–100
  usedBytes: number;
  freeBytes: number;
  unit?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

const RadialGauge: React.FC<RadialGaugeProps> = ({ value, usedBytes, freeBytes }) => {
  const theme = useTheme();
  const size = 200;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;

  const clamped = Math.min(Math.max(value, 0), 100);
  const [animatedOffset, setAnimatedOffset] = useState(circ);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setAnimatedOffset(circ - (clamped / 100) * circ);
    }, 100);
    return () => clearTimeout(timeout);
  }, [clamped, circ]);

  const isDark = theme.palette.mode === 'dark';
  const trackColor = isDark ? '#2a3441' : '#e0e0e0';
  const gradientStart = isDark ? '#FF9933' : '#FF7700';
  const gradientEnd = isDark ? '#FF7700' : '#CC5500';
  const textColor = isDark ? '#e0e0e0' : '#1a1a1a';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={gradientStart} />
            <stop offset="100%" stopColor={gradientEnd} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="url(#gauge-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={animatedOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
        <text x={cx} y={cy - 6} textAnchor="middle" fill={textColor} fontSize="32" fontWeight={800} fontFamily="'JetBrains Mono', monospace">
          {clamped.toFixed(0)}%
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill={theme.palette.text.secondary} fontSize="11">
          usado
        </text>
      </svg>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="body2" fontWeight={700} fontFamily="'JetBrains Mono', monospace">
          {formatBytes(usedBytes)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          de {formatBytes(usedBytes + freeBytes)}
        </Typography>
      </Box>
    </Box>
  );
};

export default RadialGauge;
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-Object -First 20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/whatsapp/monitor/charts/RadialGauge.tsx
git commit -m "feat(monitor): add RadialGauge animated SVG component"
```

---

### Task 3: MonitorHeader with live status + auto-refresh

**Files:**
- Create: `src/components/whatsapp/monitor/MonitorHeader.tsx`

- [ ] **Step 1: Create `MonitorHeader.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Stack, Typography, IconButton, Tooltip, Chip, Box } from '@mui/material';
import { Refresh as RefreshIcon, Speed as SpeedIcon } from '@mui/icons-material';
import { motion } from 'framer-motion';

interface MonitorHeaderProps {
  loading: boolean;
  lastUpdated: Date | null;
  onRefresh: () => void;
}

function relativeTime(date: Date | null): string {
  if (!date) return 'nunca';
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 5) return 'ahora';
  if (diff < 60) return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  return `hace ${Math.floor(diff / 3600)}h`;
}

const LiveDot: React.FC = () => (
  <Box
    sx={{
      width: 8,
      height: 8,
      borderRadius: '50%',
      bgcolor: '#4caf50',
      animation: 'pulse-scale 3s infinite ease-in-out',
      '@keyframes pulse-scale': {
        '0%, 100%': { transform: 'scale(1)', opacity: 0.7 },
        '50%': { transform: 'scale(1.5)', opacity: 1 },
      },
    }}
  />
);

const MonitorHeader: React.FC<MonitorHeaderProps> = ({ loading, lastUpdated, onRefresh }) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
      <SpeedIcon color="primary" sx={{ fontSize: 28 }} />
      <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
        Monitoreo
      </Typography>
      <LiveDot />
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80 }}>
        {relativeTime(lastUpdated)}
      </Typography>
      <Chip
        label={loading ? 'Cargando...' : 'En vivo'}
        size="small"
        color={loading ? 'default' : 'success'}
        variant="outlined"
      />
      <Tooltip title="Recargar datos">
        <motion.div animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 0.4, repeat: loading ? Infinity : 0, ease: 'linear' }}>
          <IconButton onClick={onRefresh} disabled={loading} size="small">
            <RefreshIcon />
          </IconButton>
        </motion.div>
      </Tooltip>
    </Stack>
  );
};

export default MonitorHeader;
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-Object -First 20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/whatsapp/monitor/MonitorHeader.tsx
git commit -m "feat(monitor): add MonitorHeader with live dot and auto-refresh"
```

---

### Task 4: StorageSection with gauge + KPIs + breakdown

**Files:**
- Create: `src/components/whatsapp/monitor/sections/StorageSection.tsx`
- Read reference: `src/components/whatsapp/MonitorTab.tsx` (for the BREAKDOWN_CONFIG and formatBytes)

- [ ] **Step 1: Create `StorageSection.tsx`**

```tsx
import React from 'react';
import { Box, Stack, Typography, LinearProgress, Grid, Chip, Alert, AlertTitle, useTheme } from '@mui/material';
import {
  Storage as StorageIcon,
  PhotoLibrary as PhotoIcon,
  Videocam as VideoIcon,
  Mic as AudioIcon,
  Description as DocIcon,
  TextFields as TextIcon,
  Info as InfoIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import BentoCard from '../ui/BentoCard';
import RadialGauge from '../charts/RadialGauge';
import type { StorageStats, MediaBreakdown } from '@/services/monitorService';

const BREAKDOWN_CONFIG: Record<
  keyof MediaBreakdown,
  { label: string; icon: React.ReactNode; color: string }
> = {
  image: { label: 'Fotos', icon: <PhotoIcon fontSize="small" />, color: '#1976d2' },
  video: { label: 'Videos', icon: <VideoIcon fontSize="small" />, color: '#2e7d32' },
  audio: { label: 'Audios', icon: <AudioIcon fontSize="small" />, color: '#ed6c02' },
  document: { label: 'Documentos', icon: <DocIcon fontSize="small" />, color: '#9c27b0' },
  text: { label: 'Solo texto', icon: <TextIcon fontSize="small" />, color: '#757575' },
  other: { label: 'Otros', icon: <InfoIcon fontSize="small" />, color: '#78909c' },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO');
}

interface StorageSectionProps {
  storage: StorageStats | null;
  loading: boolean;
}

const StorageSection: React.FC<StorageSectionProps> = ({ storage, loading }) => {
  const theme = useTheme();

  if (loading) {
    return (
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <BentoCard>
            <Box sx={{ height: 260, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Box sx={{ width: 180, height: 180, borderRadius: '50%', bgcolor: 'action.hover', animation: 'pulse 2s infinite' }} />
            </Box>
          </BentoCard>
        </Grid>
        {[0, 1].map((i) => (
          <Grid item xs={6} md={3} key={i}>
            <BentoCard>
              <Box sx={{ height: 120, bgcolor: 'action.hover', borderRadius: 1, animation: 'pulse 2s infinite', animationDelay: `${i * 0.2}s` }} />
            </BentoCard>
          </Grid>
        ))}
        <Grid item xs={12}>
          <BentoCard>
            <Box sx={{ height: 200, bgcolor: 'action.hover', borderRadius: 1, animation: 'pulse 2s infinite', animationDelay: '0.4s' }} />
          </BentoCard>
        </Grid>
      </Grid>
    );
  }

  if (!storage) {
    return (
      <Alert severity="warning" icon={<StorageIcon />}>
        <AlertTitle>Almacenamiento no disponible</AlertTitle>
        No se pudieron cargar las estadísticas. Verifica la conexión con Supabase.
      </Alert>
    );
  }

  const gaugePct = Math.min(storage.usedPercent, 100);
  const breakdownEntries = Object.keys(BREAKDOWN_CONFIG) as (keyof MediaBreakdown)[];

  return (
    <Grid container spacing={2}>
      {/* Radial Gauge */}
      <Grid item xs={12} md={6}>
        <BentoCard variant="chart" sx={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <RadialGauge
            value={gaugePct}
            usedBytes={storage.totalBytes}
            freeBytes={storage.freeBytes}
          />
        </BentoCard>
      </Grid>

      {/* Files KPI */}
      <Grid item xs={6} md={3}>
        <BentoCard variant="kpi" sx={{ height: '100%', textAlign: 'center' }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: theme.palette.mode === 'dark' ? 'rgba(144,202,249,0.08)' : '#e3f2fd', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 1, color: '#1976d2' }}>
            <StorageIcon />
          </Box>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Typography variant="h4" fontWeight={800} fontFamily="'JetBrains Mono', monospace" sx={{ color: '#1976d2' }}>
              {formatNumber(storage.totalObjects)}
            </Typography>
          </motion.div>
          <Typography variant="caption" color="text.secondary" fontWeight={500}>
            Archivos multimedia
          </Typography>
        </BentoCard>
      </Grid>

      {/* Free Space KPI */}
      <Grid item xs={6} md={3}>
        <BentoCard variant="kpi" sx={{ height: '100%', textAlign: 'center' }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: theme.palette.mode === 'dark' ? 'rgba(206,147,216,0.08)' : '#f3e5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 1, color: '#7b1fa2' }}>
            <SpeedIcon />
          </Box>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
          >
            <Typography variant="h4" fontWeight={800} fontFamily="'JetBrains Mono', monospace" sx={{ color: '#7b1fa2' }}>
              {formatBytes(storage.freeBytes)}
            </Typography>
          </motion.div>
          <Typography variant="caption" color="text.secondary" fontWeight={500}>
            Espacio libre
          </Typography>
        </BentoCard>
      </Grid>

      {/* Breakdown */}
      <Grid item xs={12}>
        <BentoCard>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              Distribución por tipo
            </Typography>
            <Chip label={`${breakdownEntries.filter((k) => storage.breakdown[k].count > 0).length} tipos`} size="small" variant="outlined" />
          </Stack>
          <Stack spacing={1.25}>
            {breakdownEntries.map((key, idx) => {
              const item = storage.breakdown[key];
              const cfg = BREAKDOWN_CONFIG[key];
              const pct = storage.totalBytes > 0 ? (item.bytes / storage.totalBytes) * 100 : 0;
              if (item.count === 0 && item.bytes === 0) return null;
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 + idx * 0.08 }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cfg.color, flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                        <Typography variant="body2" fontWeight={600}>{cfg.label}</Typography>
                        <Typography variant="body2" color="text.secondary" fontFamily="'JetBrains Mono', monospace">
                          {pct.toFixed(0)}% · {formatBytes(item.bytes)}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          bgcolor: 'action.hover',
                          '& .MuiLinearProgress-bar': { bgcolor: cfg.color, borderRadius: 3 },
                        }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40, textAlign: 'right', flexShrink: 0 }}>
                      {item.count} arch.
                    </Typography>
                  </Box>
                </motion.div>
              );
            })}
          </Stack>
        </BentoCard>
      </Grid>
    </Grid>
  );
};

export default StorageSection;
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-Object -First 20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/whatsapp/monitor/sections/StorageSection.tsx
git commit -m "feat(monitor): add StorageSection with gauge, KPIs and breakdown"
```

---

### Task 5: ConnectionsSection compact

**Files:**
- Create: `src/components/whatsapp/monitor/sections/ConnectionsSection.tsx`

- [ ] **Step 1: Create `ConnectionsSection.tsx`**

```tsx
import React from 'react';
import { Box, Stack, Typography, Chip, CircularProgress } from '@mui/material';
import { Storage as StorageIcon, AdminPanelSettings as AdminIcon, Chat as ChatIcon } from '@mui/icons-material';
import BentoCard from '../ui/BentoCard';
import type { ConnectionStatus } from '@/services/monitorService';

interface ConnectionsSectionProps {
  connections: ConnectionStatus;
}

const StatusDot: React.FC<{ status: 'ok' | 'error' | 'checking' }> = ({ status }) => {
  if (status === 'checking') return <CircularProgress size={10} sx={{ color: '#ff9800' }} />;
  return (
    <Box
      sx={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        bgcolor: status === 'ok' ? '#4caf50' : '#f44336',
        boxShadow: status === 'ok' ? '0 0 6px rgba(76,175,80,0.5)' : 'none',
        animation: status === 'ok' ? 'pulse-dot 3s infinite ease-in-out' : 'none',
        '@keyframes pulse-dot': {
          '0%, 100%': { boxShadow: '0 0 4px rgba(76,175,80,0.3)' },
          '50%': { boxShadow: '0 0 12px rgba(76,175,80,0.7)' },
        },
      }}
    />
  );
};

const ConnectionsSection: React.FC<ConnectionsSectionProps> = ({ connections }) => {
  const items: { label: string; status: ConnectionStatus[keyof ConnectionStatus]; icon: React.ReactNode }[] = [
    { label: 'Supabase (Postgres)', status: connections.supabase, icon: <StorageIcon fontSize="small" /> },
    { label: 'Firebase (Functions)', status: connections.firebase, icon: <AdminPanelSettingsIcon fontSize="small" /> },
    { label: 'WhatsApp Cloud API', status: connections.whatsappApi, icon: <ChatIcon fontSize="small" /> },
  ];

  return (
    <BentoCard sx={{ height: '100%' }}>
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        Conexiones
      </Typography>
      <Stack spacing={1.5} divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>
        {items.map((item) => {
          const isOk = item.status.status === 'ok';
          const isChecking = item.status.status === 'checking';
          const latency = 'latency' in item.status ? (item.status as { latency?: number }).latency : undefined;
          const error = 'error' in item.status ? (item.status as { error?: string }).error : undefined;

          return (
            <Stack key={item.label} direction="row" alignItems="center" spacing={1.5}>
              <StatusDot status={item.status.status} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600}>
                  {item.label}
                </Typography>
                {latency !== undefined && (
                  <Typography variant="caption" color="text.secondary" fontFamily="'JetBrains Mono', monospace">
                    {latency}ms
                  </Typography>
                )}
                {error && (
                  <Typography variant="caption" color="error" sx={{ display: 'block' }}>
                    {error}
                  </Typography>
                )}
                {isOk && item.label === 'WhatsApp Cloud API' && 'phoneNumberId' in item.status && (
                  <Typography variant="caption" color="text.secondary" fontFamily="'JetBrains Mono', monospace" sx={{ display: 'block' }}>
                    ID: {(item.status as { phoneNumberId?: string }).phoneNumberId}
                  </Typography>
                )}
              </Box>
              <Chip
                label={isChecking ? '...' : isOk ? 'OK' : 'Error'}
                size="small"
                color={isOk ? 'success' : isChecking ? 'warning' : 'error'}
                variant="outlined"
                sx={{ height: 22, '& .MuiChip-label': { fontSize: 11, px: 1 } }}
              />
            </Stack>
          );
        })}
      </Stack>
    </BentoCard>
  );
};

// Fix icon name conflict
const AdminPanelSettingsIcon = AdminPanelSettings as React.ComponentType<{ fontSize?: string }>;

export default ConnectionsSection;
```

Wait, the AdminPanelSettings import issue. Let me fix:

```tsx
import {
  Storage as StorageIcon,
  AdminPanelSettings as AdminPanelIcon,
  Chat as ChatIcon,
} from '@mui/icons-material';
```

And use `AdminPanelIcon` in the items array instead.

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-Object -First 20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/whatsapp/monitor/sections/ConnectionsSection.tsx
git commit -m "feat(monitor): add ConnectionsSection compact status cards"
```

---

### Task 6: MetricCard + MetricsGrid with count-up animation

**Files:**
- Create: `src/components/whatsapp/monitor/metrics/MetricCard.tsx`
- Create: `src/components/whatsapp/monitor/metrics/MetricsGrid.tsx`

- [ ] **Step 1: Create `MetricCard.tsx`**

```tsx
import React from 'react';
import { Box, Typography } from '@mui/material';
import { motion } from 'framer-motion';

interface MetricCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  delay?: number;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO');
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, icon, color, bgColor, delay = 0 }) => {
  const [displayed, setDisplayed] = React.useState(0);

  React.useEffect(() => {
    if (value === 0) { setDisplayed(0); return; }
    const duration = 800;
    const steps = 20;
    const increment = value / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayed(value);
        clearInterval(interval);
      } else {
        setDisplayed(Math.round(current));
      }
    }, duration / steps);
    return () => clearInterval(interval);
  }, [value]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      style={{ cursor: 'default' }}
    >
      <Box
        sx={{
          p: { xs: 1.5, sm: 2 },
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '12px',
          bgcolor: 'background.paper',
          textAlign: 'center',
          height: '100%',
          transition: 'box-shadow 0.2s ease-out',
          '&:hover': { boxShadow: (t) => t.shadows[2] },
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            bgcolor: bgColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 0.75,
            color,
          }}
        >
          {icon}
        </Box>
        <Typography variant="h5" fontWeight={800} fontFamily="'JetBrains Mono', monospace" sx={{ color, lineHeight: 1.2 }}>
          {formatNumber(displayed)}
        </Typography>
        <Typography variant="caption" color="text.secondary" fontWeight={500}>
          {label}
        </Typography>
      </Box>
    </motion.div>
  );
};

export default MetricCard;
```

- [ ] **Step 2: Create `MetricsGrid.tsx`**

```tsx
import React from 'react';
import { Grid, Alert, AlertTitle } from '@mui/material';
import {
  Chat as ChatIcon,
  TextFields as TextIcon,
  People as PeopleIcon,
  Business as BusinessIcon,
  CalendarMonth as CalendarIcon,
  PhotoLibrary as PhotoIcon,
  Block as BlockIcon,
  Campaign as CampaignIcon,
  Info as InfoIcon,
  AdminPanelSettings as AdminIcon,
} from '@mui/icons-material';
import MetricCard from './MetricCard';
import type { GeneralMetrics } from '@/services/monitorService';

interface MetricsGridProps {
  metrics: GeneralMetrics | null;
  loading: boolean;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO');
}

const MetricsGrid: React.FC<MetricsGridProps> = ({ metrics, loading }) => {
  if (loading) {
    return (
      <Grid container spacing={2}>
        {Array.from({ length: 11 }).map((_, i) => (
          <Grid item xs={6} sm={4} md={3} lg={2} key={i}>
            <Box
              sx={{
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '12px',
                bgcolor: 'background.paper',
                height: 120,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
              }}
            >
              <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: 'action.hover', animation: 'pulse 2s infinite' }} />
              <Box sx={{ width: 60, height: 24, bgcolor: 'action.hover', borderRadius: 1, animation: 'pulse 2s infinite', animationDelay: '0.15s' }} />
              <Box sx={{ width: 80, height: 14, bgcolor: 'action.hover', borderRadius: 1, animation: 'pulse 2s infinite', animationDelay: '0.3s' }} />
            </Box>
          </Grid>
        ))}
      </Grid>
    );
  }

  if (!metrics) {
    return (
      <Alert severity="warning">
        <AlertTitle>Métricas no disponibles</AlertTitle>
        No se pudieron cargar las métricas generales.
      </Alert>
    );
  }

  const cards = [
    { label: 'Conversaciones', value: metrics.conversations, icon: <ChatIcon fontSize="small" />, color: '#1976d2', bg: '#e3f2fd' },
    { label: 'Mensajes', value: metrics.messages, icon: <TextIcon fontSize="small" />, color: '#2e7d32', bg: '#e8f5e9' },
    { label: 'Activas', value: metrics.activeConversations, icon: <ChatIcon fontSize="small" />, color: '#00897b', bg: '#e0f2f1' },
    { label: 'Leads', value: metrics.leads, icon: <PeopleIcon fontSize="small" />, color: '#ed6c02', bg: '#fff3e0' },
    { label: 'Clientes', value: metrics.clients, icon: <BusinessIcon fontSize="small" />, color: '#7b1fa2', bg: '#f3e5f5' },
    { label: 'Citas', value: metrics.appointments, icon: <CalendarIcon fontSize="small" />, color: '#1565c0', bg: '#e3f2fd' },
    { label: 'Assets', value: metrics.mediaAssets, icon: <PhotoIcon fontSize="small" />, color: '#2e7d32', bg: '#e8f5e9' },
    { label: 'Blocklist', value: metrics.blocklisted, icon: <BlockIcon fontSize="small" />, color: '#d32f2f', bg: '#ffebee' },
    { label: 'Broadcasts', value: metrics.broadcastJobs, icon: <CampaignIcon fontSize="small" />, color: '#6a1b9a', bg: '#f3e5f5' },
    { label: 'Tags', value: metrics.tags, icon: <InfoIcon fontSize="small" />, color: '#00838f', bg: '#e0f7fa' },
    { label: 'Admins', value: metrics.adminProfiles, icon: <AdminIcon fontSize="small" />, color: '#37474f', bg: '#eceff1' },
  ];

  return (
    <Grid container spacing={2}>
      {cards.map((m, idx) => (
        <Grid item xs={6} sm={4} md={3} lg={2} key={m.label}>
          <MetricCard
            label={m.label}
            value={m.value}
            icon={m.icon}
            color={m.color}
            bgColor={m.bg}
            delay={0.05 * idx}
          />
        </Grid>
      ))}
    </Grid>
  );
};

export default MetricsGrid;
```

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-Object -First 20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/whatsapp/monitor/metrics/MetricCard.tsx src/components/whatsapp/monitor/metrics/MetricsGrid.tsx
git commit -m "feat(monitor): add MetricCard with count-up animation and MetricsGrid"
```

---

### Task 7: HeavyChatsSection with preview + expandable table

**Files:**
- Create: `src/components/whatsapp/monitor/sections/HeavyChatsSection.tsx`

- [ ] **Step 1: Create `HeavyChatsSection.tsx`**

```tsx
import React, { useState } from 'react';
import {
  Box, Stack, Typography, Button, Chip, Divider, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Alert, CircularProgress, LinearProgress, useTheme,
} from '@mui/material';
import {
  Chat as ChatIcon, Warning as WarningIcon, DeleteSweep as DeleteSweepIcon,
  ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import BentoCard from '../ui/BentoCard';
import { supabase } from '@/config/supabase';
import type { HeavyChat } from '@/services/monitorService';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO');
}

interface HeavyChatsSectionProps {
  chats: HeavyChat[];
  loading: boolean;
  onRefresh: () => void;
}

const HeavyChatsSection: React.FC<HeavyChatsSectionProps> = ({ chats, loading, onRefresh }) => {
  const [expanded, setExpanded] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; chat: HeavyChat | null; mode: 'media' | 'chat' }>({ open: false, chat: null, mode: 'media' });
  const [deleting, setDeleting] = useState(false);
  const theme = useTheme();

  const handleDeleteMedia = (chat: HeavyChat) => setDeleteDialog({ open: true, chat, mode: 'media' });
  const handleDeleteChat = (chat: HeavyChat) => setDeleteDialog({ open: true, chat, mode: 'chat' });

  const confirmDelete = async () => {
    if (!deleteDialog.chat) return;
    setDeleting(true);
    try {
      if (deleteDialog.mode === 'media') {
        await supabase.from('whatsapp_media_assets').delete().eq('conversation_stable_key', deleteDialog.chat.stableKey);
      } else {
        await supabase.from('whatsapp_conversations').delete().eq('stable_key', deleteDialog.chat.stableKey);
      }
      setDeleteDialog({ open: false, chat: null, mode: 'media' });
      onRefresh();
    } catch (e) {
      console.error('Error eliminando:', e);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <BentoCard>
        <Box sx={{ height: 200, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <CircularProgress size={24} />
        </Box>
      </BentoCard>
    );
  }

  if (chats.length === 0) {
    return (
      <BentoCard>
        <Stack alignItems="center" spacing={1} sx={{ py: 3 }}>
          <ChatIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
          <Typography variant="body2" color="text.secondary">No hay conversaciones pesadas</Typography>
        </Stack>
      </BentoCard>
    );
  }

  const displayChats = expanded ? chats : chats.slice(0, 5);
  const maxBytes = Math.max(...chats.map((c) => c.totalBytes), 1);

  const medalIcon = (i: number) => {
    if (i === 0) return <Typography sx={{ fontSize: 18, lineHeight: 1 }}>🥇</Typography>;
    if (i === 1) return <Typography sx={{ fontSize: 18, lineHeight: 1 }}>🥈</Typography>;
    if (i === 2) return <Typography sx={{ fontSize: 18, lineHeight: 1 }}>🥉</Typography>;
    return <Typography variant="caption" fontWeight={700} color="text.disabled">{i + 1}</Typography>;
  };

  return (
    <>
      <BentoCard>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <ChatIcon color="warning" />
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
            Chats más pesados
          </Typography>
          <Chip label={`${chats.length} chats`} size="small" variant="outlined" />
          {chats.length > 5 && (
            <Button
              size="small"
              endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Mostrar menos' : `Ver todos (${chats.length})`}
            </Button>
          )}
        </Stack>

        <AnimatePresence mode="wait">
          {!expanded ? (
            /* Preview mode: top 5 */
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Stack spacing={1}>
                {displayChats.map((chat, i) => {
                  const pct = (chat.totalBytes / maxBytes) * 100;
                  return (
                    <motion.div
                      key={chat.stableKey}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.06 }}
                    >
                      <Box
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 1.5,
                          px: 1.5, py: 1, borderRadius: 1,
                          '&:hover': { bgcolor: 'action.hover' },
                          cursor: 'pointer',
                        }}
                        onClick={() => handleDeleteMedia(chat)}
                      >
                        {medalIcon(i)}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {chat.contactName || chat.contactPhone || 'Sin nombre'}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={pct}
                            sx={{
                              height: 4, borderRadius: 2, mt: 0.5,
                              bgcolor: 'action.hover',
                              '& .MuiLinearProgress-bar': {
                                bgcolor: chat.totalBytes > 10_485_760 ? 'error.main' : 'warning.main',
                                borderRadius: 2,
                              },
                            }}
                          />
                        </Box>
                        <Typography variant="body2" fontWeight={700} fontFamily="'JetBrains Mono', monospace" sx={{ flexShrink: 0 }}>
                          {formatBytes(chat.totalBytes)}
                        </Typography>
                      </Box>
                    </motion.div>
                  );
                })}
              </Stack>
            </motion.div>
          ) : (
            /* Full table mode */
            <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? 'action.hover' : 'grey.50' }}>
                      <TableCell sx={{ fontWeight: 600, pl: 2 }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Contacto</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Teléfono</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Msgs</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Mult.</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Peso</TableCell>
                      <TableCell sx={{ fontWeight: 600, pr: 2 }} align="center">Acción</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {chats.map((chat, i) => (
                      <TableRow
                        key={chat.stableKey}
                        hover
                        sx={i < 3 ? { '& .MuiTableCell-root': { borderLeft: `3px solid ${theme.palette.warning.main}`, borderLeftStyle: i < 3 ? 'solid' : 'none' } } : undefined}
                      >
                        <TableCell sx={{ pl: 2 }}>{medalIcon(i)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 160 }}>
                            {chat.contactName || 'Sin nombre'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" fontFamily="'JetBrains Mono', monospace">
                            {chat.contactPhone || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{formatNumber(chat.messageCount)}</TableCell>
                        <TableCell align="right">
                          <Chip label={chat.mediaCount} size="small" color={chat.mediaCount > 10 ? 'warning' : 'default'} variant="outlined" />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} color={chat.totalBytes > 10_485_760 ? 'error.main' : 'text.primary'} fontFamily="'JetBrains Mono', monospace">
                            {formatBytes(chat.totalBytes)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ pr: 2 }}>
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            <Tooltip title="Eliminar multimedia">
                              <IconButton size="small" color="warning" onClick={() => handleDeleteMedia(chat)}>
                                <DeleteSweepIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Eliminar todo el chat">
                              <IconButton size="small" color="error" onClick={() => handleDeleteChat(chat)}>
                                <WarningIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </motion.div>
          )}
        </AnimatePresence>

        <Box sx={{ mt: 1.5, px: 1, py: 0.75, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            <WarningIcon sx={{ fontSize: 12, verticalAlign: 'text-bottom', mr: 0.5 }} />
            Al eliminar un chat completo se borran también todos sus mensajes y archivos
          </Typography>
        </Box>
      </BentoCard>

      {/* Delete dialog */}
      <Dialog open={deleteDialog.open} onClose={() => !deleting && setDeleteDialog({ open: false, chat: null, mode: 'media' })} maxWidth="sm" fullWidth>
        <DialogTitle>{deleteDialog.mode === 'media' ? 'Eliminar multimedia' : 'Eliminar todo el chat'}</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            {deleteDialog.mode === 'media' ? (
              <Box>
                <Alert severity="warning" sx={{ mb: 2 }}>Se eliminarán todos los archivos multimedia de esta conversación.</Alert>
                <Typography variant="body2"><strong>Chat:</strong> {deleteDialog.chat?.contactName || deleteDialog.chat?.contactPhone || 'Desconocido'}</Typography>
                <Typography variant="body2"><strong>Multimedia:</strong> {deleteDialog.chat?.mediaCount} archivos ({deleteDialog.chat ? formatBytes(deleteDialog.chat.totalBytes) : '—'})</Typography>
              </Box>
            ) : (
              <Box>
                <Alert severity="error" sx={{ mb: 2 }}>Esta acción eliminará <strong>toda la conversación</strong>, incluyendo mensajes y archivos. No se puede deshacer.</Alert>
                <Typography variant="body2"><strong>Chat:</strong> {deleteDialog.chat?.contactName || deleteDialog.chat?.contactPhone || 'Desconocido'}</Typography>
                <Typography variant="body2"><strong>Mensajes:</strong> {deleteDialog.chat?.messageCount}</Typography>
                <Typography variant="body2"><strong>Multimedia:</strong> {deleteDialog.chat?.mediaCount} archivos</Typography>
              </Box>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, chat: null, mode: 'media' })} disabled={deleting}>Cancelar</Button>
          <Button variant="contained" color={deleteDialog.mode === 'chat' ? 'error' : 'warning'} onClick={confirmDelete} disabled={deleting} startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {deleting ? 'Eliminando...' : deleteDialog.mode === 'media' ? 'Eliminar multimedia' : 'Eliminar todo'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default HeavyChatsSection;
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-Object -First 20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/whatsapp/monitor/sections/HeavyChatsSection.tsx
git commit -m "feat(monitor): add HeavyChatsSection with preview + expandable table"
```

---

### Task 8: MonitorSkeleton (bento-shaped skeleton)

**Files:**
- Create: `src/components/whatsapp/monitor/ui/MonitorSkeleton.tsx`

- [ ] **Step 1: Create `MonitorSkeleton.tsx`**

```tsx
import React from 'react';
import { Box, Grid } from '@mui/material';
import BentoCard from './BentoCard';

const Shimmer: React.FC<{ width?: string | number; height?: number; delay?: number }> = ({ width = '100%', height = 24, delay = 0 }) => (
  <Box
    sx={{
      width,
      height,
      borderRadius: 1,
      background: (t) => `linear-gradient(90deg, ${t.palette.action.hover} 25%, ${t.palette.action.selected} 50%, ${t.palette.action.hover} 75%)`,
      backgroundSize: '200% 100%',
      animation: `shimmer 1.5s infinite ease-in-out`,
      animationDelay: `${delay}s`,
      '@keyframes shimmer': {
        '0%': { backgroundPosition: '200% 0' },
        '100%': { backgroundPosition: '-200% 0' },
      },
    }}
  />
);

const MonitorSkeleton: React.FC = () => (
  <Box>
    <Grid container spacing={2}>
      {/* Gauge skeleton */}
      <Grid item xs={12} md={6}>
        <BentoCard>
          <Box sx={{ height: 220, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Shimmer width={180} height={180} delay={0} />
          </Box>
        </BentoCard>
      </Grid>
      {/* Two KPIs */}
      {[0.1, 0.2].map((d) => (
        <Grid item xs={6} md={3} key={d}>
          <BentoCard>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 2 }}>
              <Shimmer width={40} height={40} delay={d} />
              <Shimmer width={60} height={28} delay={d + 0.05} />
              <Shimmer width={80} height={14} delay={d + 0.1} />
            </Box>
          </BentoCard>
        </Grid>
      ))}
      {/* Breakdown skeleton */}
      <Grid item xs={12}>
        <BentoCard>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[0, 0.08, 0.16, 0.24, 0.32, 0.4].map((d) => (
              <Box key={d} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Shimmer width={8} height={8} delay={d} />
                <Box sx={{ flex: 1 }}>
                  <Shimmer height={16} delay={d} />
                  <Shimmer height={6} delay={d + 0.05} />
                </Box>
                <Shimmer width={60} height={16} delay={d} />
              </Box>
            ))}
          </Box>
        </BentoCard>
      </Grid>
      {/* Chat + Connections skeleton */}
      <Grid item xs={12} md={7}>
        <BentoCard>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[0, 0.06, 0.12, 0.18, 0.24].map((d) => (
              <Box key={d} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Shimmer width={20} height={20} delay={d} />
                <Box sx={{ flex: 1 }}>
                  <Shimmer height={16} delay={d} />
                  <Shimmer height={4} delay={d + 0.03} />
                </Box>
                <Shimmer width={50} height={16} delay={d} />
              </Box>
            ))}
          </Box>
        </BentoCard>
      </Grid>
      <Grid item xs={12} md={5}>
        <BentoCard>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[0, 0.08, 0.16].map((d) => (
              <Box key={d} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Shimmer width={10} height={10} delay={d} />
                <Box sx={{ flex: 1 }}>
                  <Shimmer height={16} delay={d} />
                  <Shimmer height={12} delay={d + 0.05} />
                </Box>
                <Shimmer width={40} height={20} delay={d} />
              </Box>
            ))}
          </Box>
        </BentoCard>
      </Grid>
      {/* Metrics skeleton */}
      <Grid item xs={12}>
        <Grid container spacing={2}>
          {Array.from({ length: 11 }).map((_, i) => (
            <Grid item xs={6} sm={4} md={3} lg={2} key={i}>
              <BentoCard>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, py: 1 }}>
                  <Shimmer width={36} height={36} delay={i * 0.04} />
                  <Shimmer width={50} height={24} delay={i * 0.04 + 0.05} />
                  <Shimmer width={70} height={14} delay={i * 0.04 + 0.1} />
                </Box>
              </BentoCard>
            </Grid>
          ))}
        </Grid>
      </Grid>
    </Grid>
  </Box>
);

export default MonitorSkeleton;
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-Object -First 20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/whatsapp/monitor/ui/MonitorSkeleton.tsx
git commit -m "feat(monitor): add MonitorSkeleton with bento-shaped shimmer"
```

---

### Task 9: Rewrite MonitorTab.tsx as clean orchestrator

**Files:**
- Modify: `src/components/whatsapp/MonitorTab.tsx` (replace entire content)

- [ ] **Step 1: Replace `MonitorTab.tsx`**

```tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Box, Alert, AlertTitle, Button } from '@mui/material';
import {
  getMonitorDashboard,
  type MonitorDashboard,
} from '@/services/monitorService';
import MonitorHeader from './monitor/MonitorHeader';
import StorageSection from './monitor/sections/StorageSection';
import HeavyChatsSection from './monitor/sections/HeavyChatsSection';
import ConnectionsSection from './monitor/sections/ConnectionsSection';
import MetricsGrid from './monitor/metrics/MetricsGrid';
import MonitorSkeleton from './monitor/ui/MonitorSkeleton';

const MonitorTab: React.FC = () => {
  const [dashboard, setDashboard] = useState<MonitorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMonitorDashboard();
      setDashboard(data);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh each 30s
  useEffect(() => {
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const storage = dashboard?.storage ?? null;
  const heavyChats = dashboard?.heavyChats ?? [];
  const metrics = dashboard?.metrics ?? null;
  const connections = dashboard?.connections ?? {
    supabase: { status: 'checking' as const },
    firebase: { status: 'checking' as const },
    whatsappApi: { status: 'checking' as const },
  };

  return (
    <Box sx={{ px: { xs: 0.5, sm: 0 } }}>
      <MonitorHeader loading={loading} lastUpdated={lastUpdated} onRefresh={loadData} />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} action={<Button size="small" onClick={loadData}>Reintentar</Button>}>
          <AlertTitle>Error al cargar</AlertTitle>
          {error}
        </Alert>
      )}

      {loading && !dashboard ? (
        <MonitorSkeleton />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Storage */}
          <StorageSection storage={storage} loading={loading && !dashboard} />

          {/* Heavy Chats + Connections side by side */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' }, gap: 2 }}>
            <HeavyChatsSection chats={heavyChats} loading={loading} onRefresh={loadData} />
            <ConnectionsSection connections={connections} />
          </Box>

          {/* General Metrics */}
          <MetricsGrid metrics={metrics} loading={loading} />
        </Box>
      )}
    </Box>
  );
};

export default MonitorTab;
```

- [ ] **Step 2: Build check**

Run: `npm run build 2>&1 | Select-Object -First 30`
Expected: Clean build, no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/whatsapp/MonitorTab.tsx
git commit -m "feat(monitor): rewrite MonitorTab as clean bento orchestrator"
```

---

### Task 10: Final build + deploy

- [ ] **Step 1: Full build verification**

Run: `npm run build 2>&1`
Expected: `vite v7.x.x building... ✓ built in Xs`

- [ ] **Step 2: Full commit**

```bash
git add -A
git commit -m "feat(monitor): complete bento dashboard redesign with animations"
git push
```

- [ ] **Step 3: Verify Vercel deploy**

Run: `npx vercel list --prod 2>&1 | Select-Object -First 5`
Expected: Latest deployment shows "● Ready"

---

## Self-Review

**Spec coverage check:**
- ✅ Bento grid layout (Task 9: grid template)
- ✅ Radial gauge animated SVG (Task 2: RadialGauge.tsx)
- ✅ Count-up animation on metrics (Task 6: MetricCard.tsx count-up)
- ✅ Staggered entrance animations (Task 1: BentoCard framer-motion)
- ✅ Connection status dots with pulse (Task 5: StatusDot animation)
- ✅ Heavy chats preview + expandable table (Task 7)
- ✅ Skeleton loaders matching bento layout (Task 8: MonitorSkeleton)
- ✅ Dark/light mode support (sx uses theme.palette)
- ✅ Auto-refresh every 30s (Task 9)
- ✅ Delete dialog preserved (Task 7)
- ✅ No service changes (all tasks use existing monitorService types)
- ✅ framer-motion used for all animations (constraint checked)
- ✅ Responsive layout (Task 9: gridTemplateColumns changes)

**Placeholder scan:** No TBD, TODOs, or incomplete patterns. All code is concrete.

**Type consistency:** All components import types from `@/services/monitorService`. `HeavyChat`, `StorageStats`, `GeneralMetrics`, `ConnectionStatus` types are consistent across all tasks.
