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
      <Box sx={{
        p: { xs: 1.5, sm: 2 },
        border: '1px solid', borderColor: 'divider',
        borderRadius: '12px', bgcolor: 'background.paper',
        textAlign: 'center', height: '100%',
        transition: 'box-shadow 0.2s ease-out',
        '&:hover': { boxShadow: (t) => t.shadows[2] },
      }}>
        <Box sx={{
          width: 36, height: 36, borderRadius: '50%', bgcolor: bgColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          mx: 'auto', mb: 0.75, color,
        }}>
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
