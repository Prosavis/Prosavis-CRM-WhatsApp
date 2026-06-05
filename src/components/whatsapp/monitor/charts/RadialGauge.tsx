import React, { useEffect, useState } from 'react';
import { useTheme, Box, Typography } from '@mui/material';

interface RadialGaugeProps {
  value: number;
  usedBytes: number;
  freeBytes: number;
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
