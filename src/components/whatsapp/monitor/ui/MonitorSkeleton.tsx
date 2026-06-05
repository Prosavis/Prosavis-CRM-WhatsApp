import React from 'react';
import { Box, Grid } from '@mui/material';
import BentoCard from './BentoCard';

const Shimmer: React.FC<{ width?: string | number; height?: number; delay?: number }> = ({
  width = '100%', height = 24, delay = 0,
}) => (
  <Box
    sx={{
      width,
      height,
      borderRadius: 1,
      background: (t) => `linear-gradient(90deg, ${t.palette.action.hover} 25%, ${t.palette.action.selected} 50%, ${t.palette.action.hover} 75%)`,
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite ease-in-out',
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
