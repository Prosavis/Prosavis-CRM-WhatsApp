import React from 'react';
import { Box, useTheme } from '@mui/material';
import { motion } from 'framer-motion';

type BentoCardProps = {
  children: React.ReactNode;
  animate?: boolean;
  delay?: number;
  onClick?: () => void;
  sx?: Record<string, unknown>;
};

const cubicBezier = [0.16, 1, 0.3, 1] as const;

const BentoCard: React.FC<BentoCardProps> = ({
  children,
  animate = true,
  delay = 0,
  onClick,
  sx,
}) => {
  const theme = useTheme();

  const cardSx: Record<string, unknown> = {
    border: '1px solid',
    borderColor: theme.palette.divider,
    borderRadius: '12px',
    bgcolor: theme.palette.background.paper,
    p: { xs: 1.5, sm: 2, md: 2.5 },
    cursor: onClick ? 'pointer' : 'default',
    transition: 'box-shadow 0.2s ease-out',
    '&:hover': onClick ? { boxShadow: theme.shadows[2] } : undefined,
    ...sx,
  };

  if (!animate) {
    return <Box sx={cardSx}>{children}</Box>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: cubicBezier }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
    >
      <Box sx={cardSx}>{children}</Box>
    </motion.div>
  );
};

export default BentoCard;
